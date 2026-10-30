import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, ne, or, type SQL } from 'drizzle-orm';
import {
  SUPERSEDED_BY_REVISION_NOTE,
  isFutureLessonDate,
  type AdminAttendanceDetail,
  type AdminAttendanceListItem,
  type AdminAttendanceListQuery,
  type AnomalyAnalysisStatus,
  type AnomalyReviewStatus,
  type FindingType,
  type Paginated,
  type ReviseAttendanceRequest,
  type SessionDecisionRequest,
  type SessionStatus,
  type SubmitAttendanceRequest,
  type SubmitAttendanceResponse,
  type TutorAssignmentOption,
  type TutorAttendanceListQuery,
  type TutorSession,
} from '@mumtaz/contracts';
import type { DbOrTx } from '../../db/client.js';
import { anomalyFlags, lessonSessions, students, subjects, tutorAssignments, tutorRates, tutors } from '../../db/schema.js';
import { PG_UNIQUE_VIOLATION, isPgError } from '../../lib/db-errors.js';
import { iso, isoOrNull } from '../../lib/format.js';
import {
  HttpError,
  notFound,
  stateConflict,
  validationFailed,
  type ErrorDetail,
} from '../../lib/http-error.js';
import { likePattern, pageOffset, paginated } from '../../lib/pagination.js';
import { toFinding } from '../anomaly/finding-mapper.js';
import type { ServiceContext } from '../context.js';
import { lessonDateInPeriod, selectSessionView, tutorUser, type SessionView } from './session-query.js';

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function coreFields(row: SessionView) {
  return {
    id: row.id,
    assignment_id: row.assignment_id,
    tutor_id: row.tutor_id,
    tutor_name: row.tutor_name,
    student_id: row.student_id,
    student_name: row.student_name,
    grade: row.grade,
    school_name: row.school_name,
    subject_id: row.subject_id,
    subject_name: row.subject_name,
    lesson_date: row.lesson_date,
    duration_minutes: row.duration_minutes,
  };
}

function toTutorSession(row: SessionView): TutorSession {
  return {
    ...coreFields(row),
    learning_material: row.learning_material,
    learning_notes: row.learning_notes,
    next_focus: row.next_focus,
    status: row.status as SessionStatus,
    admin_note: row.admin_note,
    submitted_at: iso(row.submitted_at),
    reviewed_at: isoOrNull(row.reviewed_at),
  };
}

type FlagRow = typeof anomalyFlags.$inferSelect;

async function findingsFor(db: DbOrTx, sessionIds: string[]): Promise<FlagRow[]> {
  if (sessionIds.length === 0) return [];
  return db
    .select()
    .from(anomalyFlags)
    .where(inArray(anomalyFlags.lesson_session_id, sessionIds))
    .orderBy(asc(anomalyFlags.created_at));
}

// ---------------------------------------------------------------------------
// Validasi domain (setelah validasi bentuk Zod)
// ---------------------------------------------------------------------------

/**
 * Assignment harus milik tutor login, aktif, siswanya aktif, dan berlaku pada
 * `lesson_date`. Tanggal masa depan menurut Asia/Jakarta ditolak (O-14, provisional).
 */
async function assertAssignmentUsable(
  ctx: ServiceContext,
  db: DbOrTx,
  tutorId: string,
  assignmentId: string,
  lessonDate: string,
): Promise<void> {
  const details: ErrorDetail[] = [];
  if (isFutureLessonDate(lessonDate, ctx.now())) {
    details.push({ field: 'lesson_date', message: 'Tanggal les tidak boleh di masa depan (Asia/Jakarta)' });
  }

  const [assignment] = await db
    .select({
      tutor_id: tutorAssignments.tutor_id,
      is_active: tutorAssignments.is_active,
      start_date: tutorAssignments.start_date,
      end_date: tutorAssignments.end_date,
      student_active: students.is_active,
    })
    .from(tutorAssignments)
    .innerJoin(students, eq(students.id, tutorAssignments.student_id))
    .where(eq(tutorAssignments.id, assignmentId))
    .limit(1);

  // Assignment milik tutor lain diperlakukan sama dengan tidak ada (tidak membocorkan keberadaan).
  if (!assignment || assignment.tutor_id !== tutorId || !assignment.is_active || !assignment.student_active) {
    details.push({ field: 'assignment_id', message: 'Penugasan tidak valid atau tidak aktif untuk tutor ini' });
  } else if (
    lessonDate < assignment.start_date ||
    (assignment.end_date !== null && lessonDate > assignment.end_date)
  ) {
    details.push({ field: 'lesson_date', message: 'Tanggal les di luar masa berlaku penugasan' });
  }

  if (details.length > 0) throw validationFailed(details);
}

type EditableFields = Omit<SubmitAttendanceRequest, 'client_submission_id'>;

function normalizeEditable(input: EditableFields) {
  return {
    assignment_id: input.assignment_id,
    lesson_date: input.lesson_date,
    duration_minutes: input.duration_minutes,
    learning_material: input.learning_material,
    learning_notes: input.learning_notes ?? null,
    next_focus: input.next_focus ?? null,
  };
}

function sameEditable(row: SessionView, input: EditableFields): boolean {
  const next = normalizeEditable(input);
  return (
    row.assignment_id === next.assignment_id &&
    row.lesson_date === next.lesson_date &&
    row.duration_minutes === next.duration_minutes &&
    row.learning_material === next.learning_material &&
    row.learning_notes === next.learning_notes &&
    row.next_focus === next.next_focus
  );
}

async function sessionViewById(db: DbOrTx, id: string): Promise<SessionView | undefined> {
  const [row] = await selectSessionView(db).where(eq(lessonSessions.id, id)).limit(1);
  return row;
}

// ---------------------------------------------------------------------------
// Tutor
// ---------------------------------------------------------------------------

/** `GET /tutor/me/assignments`: hanya assignment aktif milik tutor login dengan siswa aktif. */
export async function listTutorAssignmentOptions(ctx: ServiceContext, tutorId: string): Promise<TutorAssignmentOption[]> {
  const rows = await ctx.db
    .select({
      assignment_id: tutorAssignments.id,
      student_id: students.id,
      student_name: students.full_name,
      grade: students.grade,
      school_name: students.school_name,
      subject_id: subjects.id,
      subject_name: subjects.name,
      start_date: tutorAssignments.start_date,
      end_date: tutorAssignments.end_date,
    })
    .from(tutorAssignments)
    .innerJoin(students, eq(students.id, tutorAssignments.student_id))
    .innerJoin(subjects, eq(subjects.id, tutorAssignments.subject_id))
    .where(
      and(
        eq(tutorAssignments.tutor_id, tutorId),
        eq(tutorAssignments.is_active, true),
        eq(students.is_active, true),
      ),
    )
    .orderBy(asc(students.full_name), asc(subjects.name));

  return rows.map((row) => ({
    assignment_id: row.assignment_id,
    student: { id: row.student_id, full_name: row.student_name, grade: row.grade, school_name: row.school_name },
    subject: { id: row.subject_id, name: row.subject_name },
    start_date: row.start_date,
    end_date: row.end_date,
  }));
}

function toSubmitResponse(row: SessionView): SubmitAttendanceResponse {
  return {
    session: {
      id: row.id,
      client_submission_id: row.client_submission_id,
      status: row.status as SessionStatus,
      anomaly_analysis_status: row.anomaly_analysis_status as AnomalyAnalysisStatus,
      submitted_at: iso(row.submitted_at),
    },
  };
}

/** Retry dengan `client_submission_id` yang sama: payload identik → sesi sama; berbeda → 409. */
async function replayIfExists(
  ctx: ServiceContext,
  tutorId: string,
  input: SubmitAttendanceRequest,
): Promise<SubmitAttendanceResponse | undefined> {
  const [existing] = await selectSessionView(ctx.db)
    .where(eq(lessonSessions.client_submission_id, input.client_submission_id))
    .limit(1);
  if (!existing) return undefined;
  if (existing.tutor_id !== tutorId || !sameEditable(existing, input)) {
    throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'client_submission_id sudah dipakai untuk data yang berbeda');
  }
  return toSubmitResponse(existing);
}

/**
 * `POST /tutor/attendance`. Tutor diambil dari session; sesi disimpan `pending`
 * dengan `anomaly_analysis_status=pending`. TIDAK memanggil Google Sheets.
 */
export async function submitAttendance(
  ctx: ServiceContext,
  tutor: { tutorId: string; tutorActive: boolean },
  input: SubmitAttendanceRequest,
): Promise<{ response: SubmitAttendanceResponse; created: boolean }> {
  const replay = await replayIfExists(ctx, tutor.tutorId, input);
  if (replay) return { response: replay, created: false };

  if (!tutor.tutorActive) {
    throw new HttpError(403, 'FORBIDDEN', 'Profil tutor nonaktif; tidak dapat mengirim sesi baru');
  }
  await assertAssignmentUsable(ctx, ctx.db, tutor.tutorId, input.assignment_id, input.lesson_date);

  const now = ctx.now();
  try {
    const [inserted] = await ctx.db
      .insert(lessonSessions)
      .values({
        client_submission_id: input.client_submission_id,
        ...normalizeEditable(input),
        status: 'pending',
        anomaly_analysis_status: 'pending',
        submitted_at: now,
        updated_at: now,
      })
      .returning({ id: lessonSessions.id });
    if (!inserted) throw new Error('Insert sesi gagal');
    const row = await sessionViewById(ctx.db, inserted.id);
    if (!row) throw new Error('Sesi baru tidak ditemukan');
    return { response: toSubmitResponse(row), created: true };
  } catch (error) {
    // Dua request paralel dengan key sama: yang kalah mengikuti aturan replay.
    if (isPgError(error, PG_UNIQUE_VIOLATION, 'lesson_sessions_client_submission_id_key')) {
      const raced = await replayIfExists(ctx, tutor.tutorId, input);
      if (raced) return { response: raced, created: false };
    }
    throw error;
  }
}

export async function listTutorAttendance(
  ctx: ServiceContext,
  tutorId: string,
  query: TutorAttendanceListQuery,
): Promise<Paginated<TutorSession>> {
  const where = and(
    eq(tutorAssignments.tutor_id, tutorId),
    lessonDateInPeriod(query.period),
    query.status ? eq(lessonSessions.status, query.status) : undefined,
  );
  const [rows, [total]] = await Promise.all([
    selectSessionView(ctx.db)
      .where(where)
      .orderBy(desc(lessonSessions.lesson_date), desc(lessonSessions.submitted_at), asc(lessonSessions.id))
      .limit(query.page_size)
      .offset(pageOffset(query)),
    ctx.db
      .select({ value: count() })
      .from(lessonSessions)
      .innerJoin(tutorAssignments, eq(tutorAssignments.id, lessonSessions.assignment_id))
      .where(where),
  ]);
  return paginated(rows.map(toTutorSession), query, total?.value ?? 0);
}

/**
 * `PATCH /tutor/me/attendance/:id` — hanya sesi milik tutor berstatus `revision_requested`.
 * Kembali ke `pending`, metadata review direset, finding lama `superseded`.
 * Retry identik setelah respons hilang → 200 tanpa perubahan.
 */
export async function reviseAttendance(
  ctx: ServiceContext,
  tutorId: string,
  sessionId: string,
  input: ReviseAttendanceRequest,
): Promise<TutorSession> {
  return ctx.db.transaction(async (tx) => {
    const current = await sessionViewById(tx, sessionId);
    if (!current || current.tutor_id !== tutorId) throw notFound('Sesi');

    if (current.status === 'pending' && sameEditable(current, input)) {
      return toTutorSession(current);
    }
    if (current.status !== 'revision_requested') {
      throw stateConflict('Sesi hanya dapat direvisi saat berstatus revision_requested');
    }

    await assertAssignmentUsable(ctx, tx, tutorId, input.assignment_id, input.lesson_date);

    const now = ctx.now();
    const updated = await tx
      .update(lessonSessions)
      .set({
        ...normalizeEditable(input),
        status: 'pending',
        anomaly_analysis_status: 'pending',
        submitted_at: now,
        updated_at: now,
        reviewed_by_user_id: null,
        reviewed_at: null,
        admin_note: null,
      })
      // Conditional update: aman terhadap keputusan/revisi paralel.
      .where(and(eq(lessonSessions.id, sessionId), eq(lessonSessions.status, 'revision_requested')))
      .returning({ id: lessonSessions.id });
    if (updated.length === 0) throw stateConflict('Status sesi berubah; muat ulang data');

    await tx
      .update(anomalyFlags)
      .set({ review_status: 'superseded', review_note: SUPERSEDED_BY_REVISION_NOTE })
      .where(and(eq(anomalyFlags.lesson_session_id, sessionId), ne(anomalyFlags.review_status, 'superseded')));

    const row = await sessionViewById(tx, sessionId);
    if (!row) throw notFound('Sesi');
    return toTutorSession(row);
  });
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function listAdminAttendance(
  ctx: ServiceContext,
  query: AdminAttendanceListQuery,
): Promise<Paginated<AdminAttendanceListItem>> {
  const filters: (SQL | undefined)[] = [
    lessonDateInPeriod(query.period),
    query.tutor_id ? eq(tutorAssignments.tutor_id, query.tutor_id) : undefined,
    query.student_id ? eq(tutorAssignments.student_id, query.student_id) : undefined,
    query.subject_id ? eq(tutorAssignments.subject_id, query.subject_id) : undefined,
    query.status ? eq(lessonSessions.status, query.status) : undefined,
    query.anomaly_status ? eq(lessonSessions.anomaly_analysis_status, query.anomaly_status) : undefined,
    query.search
      ? or(
          ilike(tutorUser.full_name, likePattern(query.search)),
          ilike(students.full_name, likePattern(query.search)),
          ilike(subjects.name, likePattern(query.search)),
          ilike(lessonSessions.learning_material, likePattern(query.search)),
        )
      : undefined,
  ];
  const where = and(...filters);

  const [rows, [total]] = await Promise.all([
    selectSessionView(ctx.db)
      .where(where)
      .orderBy(desc(lessonSessions.lesson_date), desc(lessonSessions.submitted_at), asc(lessonSessions.id))
      .limit(query.page_size)
      .offset(pageOffset(query)),
    selectCount(ctx.db).where(where),
  ]);

  const flags = await findingsFor(ctx.db, rows.map((row) => row.id));
  const items = rows.map((row) => ({
    ...coreFields(row),
    status: row.status as SessionStatus,
    anomaly_analysis_status: row.anomaly_analysis_status as AnomalyAnalysisStatus,
    findings: flags
      .filter((flag) => flag.lesson_session_id === row.id)
      .map((flag) => ({
        id: flag.id,
        finding_type: flag.finding_type as FindingType,
        review_status: flag.review_status as AnomalyReviewStatus,
      })),
    submitted_at: iso(row.submitted_at),
  }));
  return paginated(items, query, total?.value ?? 0);
}

function selectCount(db: DbOrTx) {
  return db
    .select({ value: count() })
    .from(lessonSessions)
    .innerJoin(tutorAssignments, eq(tutorAssignments.id, lessonSessions.assignment_id))
    .innerJoin(tutors, eq(tutors.id, tutorAssignments.tutor_id))
    .innerJoin(tutorUser, eq(tutorUser.id, tutors.user_id))
    .innerJoin(students, eq(students.id, tutorAssignments.student_id))
    .innerJoin(subjects, eq(subjects.id, tutorAssignments.subject_id));
}

async function toAdminDetail(db: DbOrTx, row: SessionView): Promise<AdminAttendanceDetail> {
  const flags = await findingsFor(db, [row.id]);
  return {
    ...coreFields(row),
    client_submission_id: row.client_submission_id,
    learning_material: row.learning_material,
    learning_notes: row.learning_notes,
    next_focus: row.next_focus,
    status: row.status as SessionStatus,
    anomaly_analysis_status: row.anomaly_analysis_status as AnomalyAnalysisStatus,
    findings: flags.map(toFinding),
    submitted_at: iso(row.submitted_at),
    updated_at: iso(row.updated_at),
    last_review: {
      reviewed_by_user_id: row.reviewed_by_user_id,
      reviewed_at: isoOrNull(row.reviewed_at),
      admin_note: row.admin_note,
    },
  };
}

export async function getAdminAttendanceDetail(ctx: ServiceContext, id: string): Promise<AdminAttendanceDetail> {
  const row = await sessionViewById(ctx.db, id);
  if (!row) throw notFound('Sesi');
  return toAdminDetail(ctx.db, row);
}

/**
 * `PATCH /admin/attendance/:id/decision`. Hanya dari `pending` (approved/rejected
 * terminal — working default O-15). Approve menyimpan snapshot tarif yang berlaku
 * pada `lesson_date`; tanpa tarif → snapshot kosong (payroll memberi warning).
 */
export async function decideAttendance(
  ctx: ServiceContext,
  adminUserId: string,
  sessionId: string,
  input: SessionDecisionRequest,
): Promise<AdminAttendanceDetail> {
  return ctx.db.transaction(async (tx) => {
    const [locked] = await tx
      .select({
        status: lessonSessions.status,
        assignment_id: lessonSessions.assignment_id,
        lesson_date: lessonSessions.lesson_date,
      })
      .from(lessonSessions)
      .where(eq(lessonSessions.id, sessionId))
      .for('update')
      .limit(1);
    if (!locked) throw notFound('Sesi');
    if (locked.status !== 'pending') {
      throw stateConflict('Hanya sesi berstatus pending yang dapat diputuskan');
    }

    let snapshot = { rate_type_snapshot: null, rate_amount_snapshot: null, rate_is_demo_snapshot: null } as {
      rate_type_snapshot: string | null;
      rate_amount_snapshot: string | null;
      rate_is_demo_snapshot: boolean | null;
    };
    if (input.decision === 'approved') {
      const [rate] = await tx
        .select()
        .from(tutorRates)
        .where(
          and(
            eq(tutorRates.assignment_id, locked.assignment_id),
            lte(tutorRates.effective_from, locked.lesson_date),
            or(isNull(tutorRates.effective_to), gte(tutorRates.effective_to, locked.lesson_date)),
          ),
        )
        .orderBy(desc(tutorRates.effective_from))
        .limit(1);
      if (rate) {
        snapshot = {
          rate_type_snapshot: rate.rate_type,
          rate_amount_snapshot: rate.rate_amount,
          rate_is_demo_snapshot: rate.is_demo_assumption,
        };
      }
    }

    const now = ctx.now();
    await tx
      .update(lessonSessions)
      .set({
        status: input.decision,
        admin_note: input.admin_note ?? null,
        reviewed_by_user_id: adminUserId,
        reviewed_at: now,
        updated_at: now,
        ...snapshot,
      })
      .where(and(eq(lessonSessions.id, sessionId), eq(lessonSessions.status, 'pending')));

    const row = await sessionViewById(tx, sessionId);
    if (!row) throw notFound('Sesi');
    return toAdminDetail(tx, row);
  });
}
