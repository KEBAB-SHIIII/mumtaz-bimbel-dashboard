import { createHash } from 'node:crypto';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
  learningSummaryViewSchema,
  type GenerateMonthlySummaryResponse,
  type GenerateSessionSummaryResponse,
  type LearningSummaryAiRequest,
  type LearningSummaryAiResponse,
  type LearningSummaryScope,
  type LearningSummaryStatus,
  type LearningSummaryView,
  type ParentLearningSummariesResponse,
  type Period,
} from '@mumtaz/contracts';
import { learningSummaries, lessonSessions, students } from '../../db/schema.js';
import {
  LearningSummaryProviderError,
  type LearningSummaryProvider,
} from '../../integrations/learning-summary/types.js';
import { HttpError, notFound } from '../../lib/http-error.js';
import type { Logger } from '../../lib/logger.js';
import { selectSessionView, sessionsInPeriod, type SessionView } from '../attendance/session-query.js';
import type { ServiceContext } from '../context.js';
import { assertParentLinked } from '../parent-service.js';

const UNAVAILABLE_MESSAGE =
  'Layanan ringkasan AI sedang tidak tersedia. Silakan coba lagi nanti.';

export interface FingerprintSession {
  id: string;
  lesson_date: string;
  subjects: readonly string[];
  duration_minutes: number;
  learning_material: string;
  learning_notes: string | null;
}

export interface FingerprintInput {
  scope: LearningSummaryScope;
  period: Period;
  student_grade: string;
  sessions: readonly FingerprintSession[];
}

export interface LearningSummaryServiceDeps {
  ctx: ServiceContext;
  provider: LearningSummaryProvider | null;
  timeoutMs: number;
  logger: Logger;
}

type StoredSummaryRow = typeof learningSummaries.$inferSelect;

/**
 * Hash SHA-256 deterministik dari data sumber ringkasan (materi, catatan, mapel, durasi, jenjang).
 * Berubah bila ada edit catatan/materi atau penambahan/penghapusan sesi approved.
 */
export function computeSummaryFingerprint(input: FingerprintInput): string {
  const canonicalSessions = [...input.sessions]
    .sort((a, b) => a.lesson_date.localeCompare(b.lesson_date) || a.id.localeCompare(b.id))
    .map((s) => ({
      id: s.id,
      lesson_date: s.lesson_date,
      subjects: [...s.subjects].sort((a, b) => a.localeCompare(b)),
      duration_minutes: s.duration_minutes,
      learning_material: s.learning_material,
      learning_notes: s.learning_notes,
    }));

  const payload = JSON.stringify({
    scope: input.scope,
    period: input.period,
    student_grade: input.student_grade,
    sessions: canonicalSessions,
  });

  return createHash('sha256').update(payload).digest('hex');
}

function toFingerprintSession(row: SessionView): FingerprintSession {
  return {
    id: row.id,
    lesson_date: row.lesson_date,
    subjects: row.subject_names,
    duration_minutes: row.duration_minutes,
    learning_material: row.learning_material,
    learning_notes: row.learning_notes,
  };
}

function toAiSessionInput(row: SessionView): LearningSummaryAiRequest['sessions'][number] {
  return {
    lesson_date: row.lesson_date,
    subjects: [...row.subject_names].sort((a, b) => a.localeCompare(b)),
    duration_minutes: row.duration_minutes,
    learning_material: row.learning_material,
    learning_notes: row.learning_notes,
  };
}

function toSummaryView(row: StoredSummaryRow, isStale: boolean): LearningSummaryView {
  return learningSummaryViewSchema.parse({
    overall_status: row.overall_status as LearningSummaryStatus,
    summary: row.summary,
    strengths: row.strengths,
    areas_to_improve: row.areas_to_improve,
    subjects_covered: row.subjects_covered,
    generated_at: row.generated_at.toISOString(),
    is_stale: isStale,
  });
}

async function listApprovedStudentSessionsInPeriod(
  ctx: ServiceContext,
  studentId: string,
  period: Period,
): Promise<SessionView[]> {
  return sessionsInPeriod(
    ctx.db,
    period,
    and(eq(students.id, studentId), eq(lessonSessions.status, 'approved')),
  ).orderBy(asc(lessonSessions.lesson_date), asc(lessonSessions.id));
}

async function invokeProvider(
  deps: LearningSummaryServiceDeps,
  request: LearningSummaryAiRequest,
): Promise<{ result: LearningSummaryAiResponse; provider: string; model: string | null }> {
  if (!deps.provider) {
    throw new HttpError(503, 'INTEGRATION_UNAVAILABLE', UNAVAILABLE_MESSAGE);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
  timer.unref?.();

  try {
    const result = await deps.provider.summarize(request, { signal: controller.signal });
    return {
      result,
      provider: deps.provider.provider,
      model: result.model ?? deps.provider.model,
    };
  } catch (error) {
    const reason =
      error instanceof LearningSummaryProviderError ? error.kind : 'unexpected_error';
    deps.logger.warn('learning_summary_failed', {
      scope: request.scope,
      period: request.period,
      reason,
    });
    throw new HttpError(503, 'INTEGRATION_UNAVAILABLE', UNAVAILABLE_MESSAGE);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `GET /parent/students/:student_id/summaries?period=YYYY-MM`
 * Membaca cache ringkasan bulanan & per sesi untuk periode terpilih.
 * Tidak pernah memanggil AI service dan tidak pernah membocorkan cache sesi yang sudah dihapus/ditolak.
 */
export async function getParentLearningSummaries(
  ctx: ServiceContext,
  parentUserId: string,
  studentId: string,
  period: Period,
): Promise<ParentLearningSummariesResponse> {
  await assertParentLinked(ctx, parentUserId, studentId);

  const approvedSessions = await listApprovedStudentSessionsInPeriod(ctx, studentId, period);
  const lastSession = approvedSessions[approvedSessions.length - 1];
  if (!lastSession) {
    return {
      student_id: studentId,
      period,
      approved_session_count: 0,
      monthly: null,
      sessions: {},
    };
  }

  const monthlyFingerprint = computeSummaryFingerprint({
    scope: 'monthly',
    period,
    student_grade: lastSession.grade,
    sessions: approvedSessions.map(toFingerprintSession),
  });

  const sessionFingerprints = new Map<string, string>();
  const approvedSessionIds: string[] = [];
  for (const session of approvedSessions) {
    approvedSessionIds.push(session.id);
    sessionFingerprints.set(
      session.id,
      computeSummaryFingerprint({
        scope: 'session',
        period,
        student_grade: session.grade,
        sessions: [toFingerprintSession(session)],
      }),
    );
  }

  const [monthlyRows, sessionRows] = await Promise.all([
    ctx.db
      .select()
      .from(learningSummaries)
      .where(
        and(
          eq(learningSummaries.scope, 'monthly'),
          eq(learningSummaries.student_id, studentId),
          eq(learningSummaries.period, period),
        ),
      )
      .limit(1),
    ctx.db
      .select()
      .from(learningSummaries)
      .where(
        and(
          eq(learningSummaries.scope, 'session'),
          inArray(learningSummaries.lesson_session_id, approvedSessionIds),
        ),
      ),
  ]);

  const monthlyRow = monthlyRows[0];
  const monthly = monthlyRow
    ? toSummaryView(monthlyRow, monthlyRow.source_fingerprint !== monthlyFingerprint)
    : null;

  const sessions: Record<string, LearningSummaryView> = {};
  for (const row of sessionRows) {
    if (!row.lesson_session_id) continue;
    const expectedFp = sessionFingerprints.get(row.lesson_session_id);
    if (!expectedFp) continue;
    sessions[row.lesson_session_id] = toSummaryView(row, row.source_fingerprint !== expectedFp);
  }

  return {
    student_id: studentId,
    period,
    approved_session_count: approvedSessions.length,
    monthly,
    sessions,
  };
}

/**
 * `POST /parent/students/:student_id/summaries/monthly`
 * Menghasilkan (atau mengembalikan cache segar) ringkasan bulanan berdasarkan semua sesi `approved`.
 */
export async function generateMonthlyLearningSummary(
  deps: LearningSummaryServiceDeps,
  parentUserId: string,
  studentId: string,
  period: Period,
): Promise<GenerateMonthlySummaryResponse> {
  await assertParentLinked(deps.ctx, parentUserId, studentId);

  const approvedSessions = await listApprovedStudentSessionsInPeriod(deps.ctx, studentId, period);
  const lastSession = approvedSessions[approvedSessions.length - 1];
  if (!lastSession) {
    throw new HttpError(
      422,
      'VALIDATION_FAILED',
      'Belum ada sesi yang disetujui pada periode ini untuk diringkas.',
    );
  }

  const currentFingerprint = computeSummaryFingerprint({
    scope: 'monthly',
    period,
    student_grade: lastSession.grade,
    sessions: approvedSessions.map(toFingerprintSession),
  });

  const [cachedRow] = await deps.ctx.db
    .select()
    .from(learningSummaries)
    .where(
      and(
        eq(learningSummaries.scope, 'monthly'),
        eq(learningSummaries.student_id, studentId),
        eq(learningSummaries.period, period),
      ),
    )
    .limit(1);

  if (cachedRow && cachedRow.source_fingerprint === currentFingerprint) {
    return {
      summary: toSummaryView(cachedRow, false),
      cached: true,
    };
  }

  const aiRequest: LearningSummaryAiRequest = {
    scope: 'monthly',
    period,
    student_grade: lastSession.grade,
    sessions: approvedSessions.map(toAiSessionInput),
  };

  const { result, provider, model } = await invokeProvider(deps, aiRequest);
  const now = deps.ctx.now();

  const [saved] = await deps.ctx.db
    .insert(learningSummaries)
    .values({
      scope: 'monthly',
      student_id: studentId,
      period,
      lesson_session_id: null,
      source_fingerprint: currentFingerprint,
      overall_status: result.overall_status,
      summary: result.summary,
      strengths: result.strengths,
      areas_to_improve: result.areas_to_improve,
      subjects_covered: result.subjects_covered,
      provider,
      model,
      generated_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [learningSummaries.student_id, learningSummaries.period],
      targetWhere: sql`${learningSummaries.scope} = 'monthly'`,
      set: {
        source_fingerprint: currentFingerprint,
        overall_status: result.overall_status,
        summary: result.summary,
        strengths: result.strengths,
        areas_to_improve: result.areas_to_improve,
        subjects_covered: result.subjects_covered,
        provider,
        model,
        generated_at: now,
        updated_at: now,
      },
    })
    .returning();

  if (!saved) {
    throw new HttpError(500, 'INTERNAL_ERROR', 'Gagal menyimpan ringkasan belajar.');
  }

  return {
    summary: toSummaryView(saved, false),
    cached: false,
  };
}

/**
 * `POST /parent/students/:student_id/sessions/:session_id/summary`
 * Menghasilkan (atau mengembalikan cache segar) ringkasan satu sesi `approved`.
 */
export async function generateSessionLearningSummary(
  deps: LearningSummaryServiceDeps,
  parentUserId: string,
  studentId: string,
  sessionId: string,
): Promise<GenerateSessionSummaryResponse> {
  await assertParentLinked(deps.ctx, parentUserId, studentId);

  const [session] = await selectSessionView(deps.ctx.db)
    .where(
      and(
        eq(lessonSessions.id, sessionId),
        eq(lessonSessions.student_id, studentId),
        eq(lessonSessions.status, 'approved'),
      ),
    )
    .limit(1);

  if (!session) {
    throw notFound('Sesi belajar');
  }

  const period = session.lesson_date.slice(0, 7) as Period;
  const currentFingerprint = computeSummaryFingerprint({
    scope: 'session',
    period,
    student_grade: session.grade,
    sessions: [toFingerprintSession(session)],
  });

  const [cachedRow] = await deps.ctx.db
    .select()
    .from(learningSummaries)
    .where(
      and(
        eq(learningSummaries.scope, 'session'),
        eq(learningSummaries.lesson_session_id, session.id),
      ),
    )
    .limit(1);

  if (
    cachedRow &&
    cachedRow.source_fingerprint === currentFingerprint &&
    cachedRow.student_id === studentId &&
    cachedRow.period === period
  ) {
    return {
      lesson_session_id: session.id,
      summary: toSummaryView(cachedRow, false),
      cached: true,
    };
  }

  const aiRequest: LearningSummaryAiRequest = {
    scope: 'session',
    period,
    student_grade: session.grade,
    sessions: [toAiSessionInput(session)],
  };

  const { result, provider, model } = await invokeProvider(deps, aiRequest);
  const now = deps.ctx.now();

  const [saved] = await deps.ctx.db
    .insert(learningSummaries)
    .values({
      scope: 'session',
      student_id: studentId,
      period,
      lesson_session_id: session.id,
      source_fingerprint: currentFingerprint,
      overall_status: result.overall_status,
      summary: result.summary,
      strengths: result.strengths,
      areas_to_improve: result.areas_to_improve,
      subjects_covered: result.subjects_covered,
      provider,
      model,
      generated_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [learningSummaries.lesson_session_id],
      targetWhere: sql`${learningSummaries.scope} = 'session'`,
      set: {
        student_id: studentId,
        period,
        source_fingerprint: currentFingerprint,
        overall_status: result.overall_status,
        summary: result.summary,
        strengths: result.strengths,
        areas_to_improve: result.areas_to_improve,
        subjects_covered: result.subjects_covered,
        provider,
        model,
        generated_at: now,
        updated_at: now,
      },
    })
    .returning();

  if (!saved) {
    throw new HttpError(500, 'INTERNAL_ERROR', 'Gagal menyimpan ringkasan sesi.');
  }

  return {
    lesson_session_id: session.id,
    summary: toSummaryView(saved, false),
    cached: false,
  };
}
