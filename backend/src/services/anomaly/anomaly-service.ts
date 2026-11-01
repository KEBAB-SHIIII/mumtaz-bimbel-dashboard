import { and, asc, eq, gte, lte, ne, or } from 'drizzle-orm';
import { anomalyFindingCandidateSchema, type AnomalyFindingCandidate, type SessionValidity } from '@mumtaz/contracts';
import type { Database } from '../../db/client.js';
import { anomalyFlags, lessonSessions, students } from '../../db/schema.js';
import { safeErrorMessage } from '../../lib/db-errors.js';
import type { Logger } from '../../lib/logger.js';
import {
  AnomalyProviderError,
  type AnomalyDetectionConfig,
  type AnomalyDetector,
  type AnomalySessionSnapshot,
} from '../../integrations/anomaly/types.js';
import { validityUpdate } from '../attendance/attendance-service.js';
import { hhmm, sessionSubjects } from '../attendance/session-query.js';
import { COMPARISON_WINDOW_DAYS, generateCandidates, selectComparisons } from './candidates.js';

export interface AnomalyServiceDeps {
  db: Database;
  /** `null` = provider belum dikonfigurasi → `not_evaluated`. */
  detector: AnomalyDetector | null;
  config: AnomalyDetectionConfig;
  timeoutMs: number;
  logger: Logger;
}

/** `stale` = payload sesi berubah (revisi) selama analisis; hasil lama dibuang. */
export type AnalysisOutcome = 'completed' | 'failed' | 'not_evaluated' | 'skipped' | 'stale';

function snapshotColumns(subjectAgg: ReturnType<typeof sessionSubjects>) {
  return {
    id: lessonSessions.id,
    tutor_id: lessonSessions.tutor_id,
    student_id: lessonSessions.student_id,
    subject_ids: subjectAgg.subject_ids,
    lesson_date: lessonSessions.lesson_date,
    start_time: lessonSessions.start_time,
    duration_minutes: lessonSessions.duration_minutes,
    submitted_at: lessonSessions.submitted_at,
  };
}

function selectSnapshots(db: Database) {
  const subjectAgg = sessionSubjects(db);
  return db
    .select(snapshotColumns(subjectAgg))
    .from(lessonSessions)
    .innerJoin(subjectAgg, eq(subjectAgg.lesson_session_id, lessonSessions.id));
}

type SnapshotRow = Awaited<ReturnType<ReturnType<typeof selectSnapshots>['execute']>>[number];

const toSnapshot = (row: SnapshotRow): AnomalySessionSnapshot => ({
  ...row,
  start_time: hhmm(row.start_time),
  submitted_at: row.submitted_at.toISOString(),
});

function shiftDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function loadTarget(db: Database, sessionId: string) {
  const [row] = await db
    .select({ anomaly_analysis_status: lessonSessions.anomaly_analysis_status, grade: students.grade })
    .from(lessonSessions)
    .innerJoin(students, eq(students.id, lessonSessions.student_id))
    .where(eq(lessonSessions.id, sessionId))
    .limit(1);
  if (!row) return undefined;
  const [snapshot] = await selectSnapshots(db).where(eq(lessonSessions.id, sessionId)).limit(1);
  return snapshot ? { ...row, snapshot } : undefined;
}

/** Sesi di sekitar tanggal yang sama untuk tutor atau siswa yang sama (bukan seluruh histori). */
async function loadComparisonPool(db: Database, target: AnomalySessionSnapshot): Promise<AnomalySessionSnapshot[]> {
  const rows = await selectSnapshots(db)
    .where(
      and(
        ne(lessonSessions.id, target.id),
        gte(lessonSessions.lesson_date, shiftDate(target.lesson_date, -COMPARISON_WINDOW_DAYS)),
        lte(lessonSessions.lesson_date, shiftDate(target.lesson_date, COMPARISON_WINDOW_DAYS)),
        or(eq(lessonSessions.tutor_id, target.tutor_id), eq(lessonSessions.student_id, target.student_id)),
      ),
    )
    .orderBy(asc(lessonSessions.submitted_at), asc(lessonSessions.id))
    .limit(200);
  return rows.map(toSnapshot);
}

/** Output detektor tidak dipercaya mentah: schema + konsistensi referensi sesi. */
function validateFindings(
  findings: AnomalyFindingCandidate[],
  target: AnomalySessionSnapshot,
  knownIds: Set<string>,
): AnomalyFindingCandidate[] {
  return findings.map((finding) => {
    const parsed = anomalyFindingCandidateSchema.safeParse(finding);
    if (
      !parsed.success ||
      parsed.data.lesson_session_id !== target.id ||
      (parsed.data.related_lesson_session_id !== null && !knownIds.has(parsed.data.related_lesson_session_id))
    ) {
      throw new AnomalyProviderError('Output detektor tidak valid', 'invalid_output');
    }
    return parsed.data;
  });
}

async function withTimeout<T>(timeoutMs: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AnomalyProviderError('Provider anomali melebihi batas waktu', 'timeout'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Analisis & validasi satu sesi (docs/03 §5, docs/05 §6; revisi PM). Status analisis ditetapkan backend:
 * - rule engine tidak menemukan kandidat → `completed`, sesi **Valid** tanpa memanggil model;
 * - ada kandidat, provider tidak dikonfigurasi → `not_evaluated`, sesi tetap menunggu validasi;
 * - provider dipanggil lalu timeout/error/output invalid → `failed`, sesi tetap menunggu validasi;
 * - selesai → `completed` + finding di `anomaly_flags` + label validitas dari model.
 * Label validitas hanya ditulis bila sesi masih `pending` (keputusan Admin tidak ditimpa), dan
 * semua penulisan kondisional terhadap payload yang dianalisis, sehingga revisi yang terjadi di
 * tengah analisis tidak tertimpa hasil lama.
 */
export async function analyzeSession(deps: AnomalyServiceDeps, sessionId: string): Promise<AnalysisOutcome> {
  const loaded = await loadTarget(deps.db, sessionId);
  if (loaded?.anomaly_analysis_status !== 'pending') return 'skipped';
  const target = toSnapshot(loaded.snapshot);

  const sameSubmission = and(
    eq(lessonSessions.id, sessionId),
    eq(lessonSessions.anomaly_analysis_status, 'pending'),
    eq(lessonSessions.submitted_at, loaded.snapshot.submitted_at),
  );
  const finish = async (
    status: 'completed' | 'failed' | 'not_evaluated',
    result: { findings?: AnomalyFindingCandidate[]; validity?: SessionValidity; reason?: string | null; detector?: AnomalyDetector } = {},
  ) =>
    deps.db.transaction(async (tx) => {
      const updated = await tx
        .update(lessonSessions)
        .set({ anomaly_analysis_status: status })
        .where(sameSubmission)
        .returning({ id: lessonSessions.id });
      if (updated.length === 0) return 'stale' as const;
      const flags = (result.findings ?? []).filter((finding) => finding.is_anomaly);
      if (flags.length > 0) {
        await tx.insert(anomalyFlags).values(
          flags.map((finding) => ({
            lesson_session_id: finding.lesson_session_id,
            related_lesson_session_id: finding.related_lesson_session_id,
            finding_type: finding.finding_type,
            severity: finding.severity,
            reason: finding.reason,
            evidence_summary: finding.evidence_summary,
            provider: result.detector?.provider ?? null,
            model: result.detector?.model ?? null,
          })),
        );
      }
      if (result.validity) {
        await tx
          .update(lessonSessions)
          .set({
            ...validityUpdate({ grade: loaded.grade, duration_minutes: target.duration_minutes }, result.validity),
            validity_reason: result.reason ?? null,
            reviewed_by_user_id: null,
            reviewed_at: new Date(),
          })
          .where(and(eq(lessonSessions.id, sessionId), eq(lessonSessions.status, 'pending')));
      }
      return status;
    });

  const pool = await loadComparisonPool(deps.db, target);
  const candidates = generateCandidates(target, pool, deps.config);
  // Tidak ada kandidat dari rule engine → data bersih: Valid tanpa memanggil model.
  if (candidates.length === 0) return finish('completed', { validity: 'valid', reason: null });
  if (!deps.detector) return finish('not_evaluated');

  const comparisons = selectComparisons(target, pool, candidates);
  const detector = deps.detector;
  try {
    const detection = await withTimeout(deps.timeoutMs, (signal) =>
      detector.detect({ target, comparisons, candidates, config: deps.config }, { signal }),
    );
    const findings = validateFindings(detection.findings, target, new Set(comparisons.map((s) => s.id)));
    return await finish('completed', { findings, validity: detection.validity, reason: detection.validity_reason, detector });
  } catch (error) {
    deps.logger.warn('anomaly_analysis_failed', {
      session_id: sessionId,
      provider: detector.provider,
      reason: error instanceof AnomalyProviderError ? error.reason : 'unexpected',
      error_message: safeErrorMessage(error),
    });
    return finish('failed');
  }
}

/** ID sesi yang masih `pending` (mis. setelah restart) untuk dilanjutkan worker. */
export async function listPendingAnalysis(db: Database): Promise<string[]> {
  const rows = await db
    .select({ id: lessonSessions.id })
    .from(lessonSessions)
    .where(eq(lessonSessions.anomaly_analysis_status, 'pending'))
    .orderBy(asc(lessonSessions.submitted_at));
  return rows.map((row) => row.id);
}
