import { and, asc, count, desc, eq, ilike, inArray, ne, or, type SQL } from 'drizzle-orm';
import {
  SUPERSEDED_BY_REVISION_NOTE,
  isFutureLessonDate,
  type AdminAttendanceDetail,
  type AdminAttendanceListItem,
  type AdminAttendanceListQuery,
  type AttendanceOptions,
  type AnomalyAnalysisStatus,
  type AnomalyReviewStatus,
  type FindingType,
  type Paginated,
  type ReviseAttendanceRequest,
  type SessionDecisionRequest,
  type SessionStatus,
  type SubmitAttendanceRequest,
  type SubmitAttendanceResponse,
  type TutorAttendanceListQuery,
  type TutorSession,
} from '@mumtaz/contracts';
import type { DbOrTx } from '../../db/client.js';
import { anomalyFlags, lessonSessions, students, subjects, tutors } from '../../db/schema.js';
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
 * Aturan domain payload sesi (submit & revisi):
 * - murid dan mata pelajaran yang dipilih Tutor harus ada dan aktif (tanpa penugasan, D-24);
 * - tanggal masa depan menurut Asia/Jakarta ditolak (O-14, provisional);
 * - durasi tidak melebihi `ATTENDANCE_MAX_DURATION_MINUTES` (konfigurasi, O-12).
 */
async function assertPayloadValid(
  ctx: ServiceContext,
  db: DbOrTx,
  input: Pick<SubmitAttendanceRequest, 'student_id' | 'subject_id' | 'lesson_date' | 'duration_minutes'>,
): Promise<void> {
  const details: ErrorDetail[] = [];
  if (isFutureLessonDate(input.lesson_date, ctx.now())) {
    details.push({ field: 'lesson_date', message: 'Tanggal les tidak boleh di masa depan (Asia/Jakarta)' });
  }
  if (input.duration_minutes > ctx.attendance.maxDurationMinutes) {
    details.push({
      field: 'duration_minutes',
      message: `Durasi maksimal ${ctx.attendance.maxDurationMinutes} menit`,
    });
  }

  const [student] = await db.select({ is_active: students.is_active }).from(students).where(eq(students.id, input.student_id)).limit(1);
  if (!student?.is_active) details.push({ field: 'student_id', message: 'Murid tidak ditemukan atau tidak aktif' });
  const [subject] = await db.select({ is_active: subjects.is_active }).from(subjects).where(eq(subjects.id, input.subject_id)).limit(1);
  if (!subject?.is_active) details.push({ field: 'subject_id', message: 'Mata pelajaran tidak ditemukan atau tidak aktif' });

  if (details.length > 0) throw validationFailed(details);
}

type EditableFields = Omit<SubmitAttendanceRequest, 'client_submission_id'>;

function normalizeEditable(input: EditableFields) {
  return {
    student_id: input.student_id,
    subject_id: input.subject_id,
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
    row.student_id === next.student_id &&
    row.subject_id === next.subject_id &&
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

/** `GET /tutor/attendance-options`: murid & mata pelajaran aktif yang dapat dipilih Tutor. */
export async function listAttendanceOptions(ctx: ServiceContext): Promise<AttendanceOptions> {
  const [studentRows, subjectRows] = await Promise.all([
    ctx.db
      .select({ id: students.id, full_name: students.full_name, grade: students.grade, school_name: students.school_name })
      .from(students)
      .where(eq(students.is_active, true))
      .orderBy(asc(students.full_name), asc(students.id)),
    ctx.db
      .select({ id: subjects.id, name: subjects.name })
      .from(subjects)
      .where(eq(subjects.is_active, true))
      .orderBy(asc(subjects.name), asc(subjects.id)),
  ]);
  return { students: studentRows, subjects: subjectRows };
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
  await assertPayloadValid(ctx, ctx.db, input);

  const now = ctx.now();
  try {
    const [inserted] = await ctx.db
      .insert(lessonSessions)
      .values({
        client_submission_id: input.client_submission_id,
        tutor_id: tutor.tutorId,
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
    eq(lessonSessions.tutor_id, tutorId),
    lessonDateInPeriod(query.period),
    query.status ? eq(lessonSessions.status, query.status) : undefined,
    query.student_id ? eq(lessonSessions.student_id, query.student_id) : undefined,
  );
  const [rows, [total]] = await Promise.all([
    selectSessionView(ctx.db)
      .where(where)
      .orderBy(desc(lessonSessions.lesson_date), desc(lessonSessions.submitted_at), asc(lessonSessions.id))
      .limit(query.page_size)
      .offset(pageOffset(query)),
    ctx.db.select({ value: count() }).from(lessonSessions).where(where),
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

    await assertPayloadValid(ctx, tx, input);

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
    query.tutor_id ? eq(lessonSessions.tutor_id, query.tutor_id) : undefined,
    query.student_id ? eq(lessonSessions.student_id, query.student_id) : undefined,
    query.subject_id ? eq(lessonSessions.subject_id, query.subject_id) : undefined,
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
    .innerJoin(tutors, eq(tutors.id, lessonSessions.tutor_id))
    .innerJoin(tutorUser, eq(tutorUser.id, tutors.user_id))
    .innerJoin(students, eq(students.id, lessonSessions.student_id))
    .innerJoin(subjects, eq(subjects.id, lessonSessions.subject_id));
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
 * terminal — working default O-15). Approve mengunci tarif tunggal per sesi dari konfigurasi
 * (`HONOR_RATE_PER_SESSION`, D-24) ke `rate_amount_snapshot`, sehingga honor bulan lalu tidak
 * berubah bila tarif konfigurasi diganti.
 */
export async function decideAttendance(
  ctx: ServiceContext,
  adminUserId: string,
  sessionId: string,
  input: SessionDecisionRequest,
): Promise<AdminAttendanceDetail> {
  return ctx.db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ status: lessonSessions.status })
      .from(lessonSessions)
      .where(eq(lessonSessions.id, sessionId))
      .for('update')
      .limit(1);
    if (!locked) throw notFound('Sesi');
    if (locked.status !== 'pending') {
      throw stateConflict('Hanya sesi berstatus pending yang dapat diputuskan');
    }

    const snapshot = { rate_amount_snapshot: input.decision === 'approved' ? ctx.honor.ratePerSession : null };

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
