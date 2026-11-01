import { randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import {
  SUPERSEDED_BY_REVISION_NOTE,
  approvalStatusOf,
  durationBetween,
  isFutureLessonDate,
  sessionStatusFor,
  type AdminAttendanceDetail,
  type AdminAttendanceListItem,
  type AdminAttendanceListQuery,
  type AdminAttendanceOptions,
  type AdminCreateAttendanceRequest,
  type AdminUpdateAttendanceRequest,
  type ApprovalStatus,
  type AttendanceOptions,
  type AnomalyAnalysisStatus,
  type AnomalyReviewStatus,
  type FindingType,
  type Paginated,
  type ReviseAttendanceRequest,
  type SessionStatus,
  type SessionValidity,
  type SetValidityRequest,
  type SubmitAttendanceRequest,
  type SubmitAttendanceResponse,
  type TutorAttendanceListQuery,
  type TutorSession,
} from '@mumtaz/contracts';
import type { DbOrTx } from '../../db/client.js';
import { anomalyFlags, lessonSessionSubjects, lessonSessions, students, subjects, tutors, users } from '../../db/schema.js';
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
import { NO_SNAPSHOT, countedSnapshot } from '../billing/tariff.js';
import { toFinding } from '../anomaly/finding-mapper.js';
import type { ServiceContext } from '../context.js';
import {
  hhmm,
  lessonDateInPeriod,
  selectSessionView,
  sessionHasSubject,
  tutorUser,
  type SessionView,
} from './session-query.js';

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
    subject_ids: row.subject_ids,
    subject_name: row.subject_name,
    lesson_date: row.lesson_date,
    start_time: hhmm(row.start_time),
    end_time: hhmm(row.end_time),
    duration_minutes: row.duration_minutes,
  };
}

function validityFields(row: SessionView) {
  const validity = row.validity as SessionValidity | null;
  return {
    validity,
    approval_status: approvalStatusOf(validity, row.status as SessionStatus),
    validity_reason: row.validity_reason,
  };
}

function toTutorSession(row: SessionView): TutorSession {
  return {
    ...coreFields(row),
    learning_material: row.learning_material,
    learning_notes: row.learning_notes,
    next_focus: row.next_focus,
    status: row.status as SessionStatus,
    ...validityFields(row),
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
// Validitas & snapshot
// ---------------------------------------------------------------------------

/**
 * Kolom yang ditulis saat validitas ditetapkan (oleh AI atau Admin). Status efektif diturunkan dari
 * validitas + approval; snapshot tarif & potongan Admin dikunci hanya bila sesi dihitung (approved).
 */
export function validityUpdate(
  session: { grade: string; duration_minutes: number },
  validity: SessionValidity,
  approval: ApprovalStatus = 'pending',
) {
  const status = sessionStatusFor(validity, approval);
  return {
    validity,
    status,
    ...(status === 'approved' ? countedSnapshot(session.grade, session.duration_minutes) : NO_SNAPSHOT),
  };
}

// ---------------------------------------------------------------------------
// Validasi domain (setelah validasi bentuk Zod)
// ---------------------------------------------------------------------------

type EditableFields = ReviseAttendanceRequest;

/**
 * Aturan domain payload sesi (submit, revisi, dan CRUD Admin):
 * - murid dan semua mata pelajaran yang dipilih harus ada dan aktif (tanpa penugasan, D-24);
 * - tanggal masa depan menurut Asia/Jakarta ditolak (O-14, provisional);
 * - durasi (dari jam mulai–selesai) tidak melebihi `ATTENDANCE_MAX_DURATION_MINUTES`.
 */
async function assertPayloadValid(ctx: ServiceContext, db: DbOrTx, input: EditableFields): Promise<number> {
  const details: ErrorDetail[] = [];
  if (isFutureLessonDate(input.lesson_date, ctx.now())) {
    details.push({ field: 'lesson_date', message: 'Tanggal les tidak boleh di masa depan (Asia/Jakarta)' });
  }
  const duration = durationBetween(input.start_time, input.end_time);
  if (duration === null) {
    details.push({ field: 'end_time', message: 'Jam selesai harus setelah jam mulai' });
  } else if (duration > ctx.attendance.maxDurationMinutes) {
    details.push({ field: 'end_time', message: `Durasi maksimal ${ctx.attendance.maxDurationMinutes} menit` });
  }

  const [student] = await db.select({ is_active: students.is_active }).from(students).where(eq(students.id, input.student_id)).limit(1);
  if (!student?.is_active) details.push({ field: 'student_id', message: 'Murid tidak ditemukan atau tidak aktif' });
  const activeSubjects = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(inArray(subjects.id, input.subject_ids), eq(subjects.is_active, true)));
  if (activeSubjects.length !== input.subject_ids.length) {
    details.push({ field: 'subject_ids', message: 'Mata pelajaran tidak ditemukan atau tidak aktif' });
  }

  if (details.length > 0 || duration === null) throw validationFailed(details);
  return duration;
}

function normalizeEditable(input: EditableFields, duration: number) {
  return {
    student_id: input.student_id,
    lesson_date: input.lesson_date,
    start_time: input.start_time,
    end_time: input.end_time,
    duration_minutes: duration,
    learning_material: input.learning_material,
    learning_notes: input.learning_notes ?? null,
    next_focus: input.next_focus ?? null,
  };
}

const sortedIds = (ids: readonly string[]) => [...ids].sort().join(',');

function sameEditable(row: SessionView, input: EditableFields): boolean {
  return (
    row.student_id === input.student_id &&
    sortedIds(row.subject_ids) === sortedIds(input.subject_ids) &&
    row.lesson_date === input.lesson_date &&
    hhmm(row.start_time) === input.start_time &&
    hhmm(row.end_time) === input.end_time &&
    row.learning_material === input.learning_material &&
    row.learning_notes === (input.learning_notes ?? null) &&
    row.next_focus === (input.next_focus ?? null)
  );
}

async function replaceSubjects(tx: DbOrTx, sessionId: string, subjectIds: readonly string[]): Promise<void> {
  await tx.delete(lessonSessionSubjects).where(eq(lessonSessionSubjects.lesson_session_id, sessionId));
  await tx.insert(lessonSessionSubjects).values(subjectIds.map((subject_id) => ({ lesson_session_id: sessionId, subject_id })));
}

async function sessionViewById(db: DbOrTx, id: string): Promise<SessionView | undefined> {
  const [row] = await selectSessionView(db).where(eq(lessonSessions.id, id)).limit(1);
  return row;
}

/** Temuan lama tidak berlaku lagi setelah payload sesi diubah (dianalisis ulang). */
async function supersedeFindings(tx: DbOrTx, sessionId: string): Promise<void> {
  await tx
    .update(anomalyFlags)
    .set({ review_status: 'superseded', review_note: SUPERSEDED_BY_REVISION_NOTE })
    .where(and(eq(anomalyFlags.lesson_session_id, sessionId), ne(anomalyFlags.review_status, 'superseded')));
}

/** Kembali ke "menunggu validasi": AI akan menganalisis ulang payload baru. */
const resetToPendingValidation = (now: Date) => ({
  status: 'pending',
  validity: null,
  validity_reason: null,
  anomaly_analysis_status: 'pending',
  ...NO_SNAPSHOT,
  submitted_at: now,
  updated_at: now,
  reviewed_by_user_id: null,
  reviewed_at: null,
  admin_note: null,
});

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

/** `GET /admin/attendance-options`: pilihan form sesi Admin = opsi Tutor + tutor aktif. */
export async function listAdminAttendanceOptions(ctx: ServiceContext): Promise<AdminAttendanceOptions> {
  const [options, tutorRows] = await Promise.all([
    listAttendanceOptions(ctx),
    ctx.db
      .select({ id: tutors.id, full_name: users.full_name })
      .from(tutors)
      .innerJoin(users, eq(users.id, tutors.user_id))
      .where(and(eq(tutors.is_active, true), eq(users.is_active, true)))
      .orderBy(asc(users.full_name), asc(tutors.id)),
  ]);
  return { ...options, tutors: tutorRows };
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

/** Simpan sesi baru `pending` (menunggu validasi AI) beserta mapelnya dalam satu transaksi. */
async function insertSession(
  ctx: ServiceContext,
  values: { client_submission_id: string; tutor_id: string; input: EditableFields; duration: number },
): Promise<string> {
  const now = ctx.now();
  return ctx.db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(lessonSessions)
      .values({
        client_submission_id: values.client_submission_id,
        tutor_id: values.tutor_id,
        ...normalizeEditable(values.input, values.duration),
        status: 'pending',
        anomaly_analysis_status: 'pending',
        submitted_at: now,
        updated_at: now,
      })
      .returning({ id: lessonSessions.id });
    if (!inserted) throw new Error('Insert sesi gagal');
    await replaceSubjects(tx, inserted.id, values.input.subject_ids);
    return inserted.id;
  });
}

/**
 * `POST /tutor/attendance`. Tutor diambil dari session; sesi disimpan `pending` (menunggu validasi AI)
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
  const duration = await assertPayloadValid(ctx, ctx.db, input);

  try {
    const id = await insertSession(ctx, {
      client_submission_id: input.client_submission_id,
      tutor_id: tutor.tutorId,
      input,
      duration,
    });
    const row = await sessionViewById(ctx.db, id);
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
 * `PATCH /tutor/me/attendance/:id` — hanya sesi milik tutor yang Perlu revisi dengan approval
 * masih menunggu (`revision_requested`). Sesi Ditolak tidak dapat diedit Tutor. Kembali ke
 * menunggu validasi, temuan lama `superseded`, lalu AI menganalisis ulang.
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
      throw stateConflict('Sesi hanya dapat direvisi saat berstatus Perlu revisi');
    }

    const duration = await assertPayloadValid(ctx, tx, input);
    const updated = await tx
      .update(lessonSessions)
      .set({ ...normalizeEditable(input, duration), ...resetToPendingValidation(ctx.now()) })
      // Conditional update: aman terhadap keputusan/revisi paralel.
      .where(and(eq(lessonSessions.id, sessionId), eq(lessonSessions.status, 'revision_requested')))
      .returning({ id: lessonSessions.id });
    if (updated.length === 0) throw stateConflict('Status sesi berubah; muat ulang data');

    await replaceSubjects(tx, sessionId, input.subject_ids);
    await supersedeFindings(tx, sessionId);

    const row = await sessionViewById(tx, sessionId);
    if (!row) throw notFound('Sesi');
    return toTutorSession(row);
  });
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

function validityFilter(validity: AdminAttendanceListQuery['validity']): SQL | undefined {
  if (!validity) return undefined;
  return validity === 'unvalidated' ? isNull(lessonSessions.validity) : eq(lessonSessions.validity, validity);
}

function subjectNameMatches(pattern: string): SQL {
  return sql`exists (select 1 from ${lessonSessionSubjects} inner join ${subjects} on ${subjects.id} = ${lessonSessionSubjects.subject_id} where ${lessonSessionSubjects.lesson_session_id} = ${lessonSessions.id} and ${subjects.name} ilike ${pattern})`;
}

export async function listAdminAttendance(
  ctx: ServiceContext,
  query: AdminAttendanceListQuery,
): Promise<Paginated<AdminAttendanceListItem>> {
  const filters: (SQL | undefined)[] = [
    lessonDateInPeriod(query.period),
    query.tutor_id ? eq(lessonSessions.tutor_id, query.tutor_id) : undefined,
    query.student_id ? eq(lessonSessions.student_id, query.student_id) : undefined,
    query.subject_id ? sessionHasSubject(query.subject_id) : undefined,
    query.status ? eq(lessonSessions.status, query.status) : undefined,
    validityFilter(query.validity),
    query.anomaly_status ? eq(lessonSessions.anomaly_analysis_status, query.anomaly_status) : undefined,
    query.search
      ? or(
          ilike(tutorUser.full_name, likePattern(query.search)),
          ilike(students.full_name, likePattern(query.search)),
          subjectNameMatches(likePattern(query.search)),
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
    ...validityFields(row),
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
    .innerJoin(students, eq(students.id, lessonSessions.student_id));
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
    ...validityFields(row),
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

async function adminDetailById(db: DbOrTx, id: string): Promise<AdminAttendanceDetail> {
  const row = await sessionViewById(db, id);
  if (!row) throw notFound('Sesi');
  return toAdminDetail(db, row);
}

export async function getAdminAttendanceDetail(ctx: ServiceContext, id: string): Promise<AdminAttendanceDetail> {
  return adminDetailById(ctx.db, id);
}

async function assertTutorExists(db: DbOrTx, tutorId: string): Promise<void> {
  const [tutor] = await db.select({ id: tutors.id }).from(tutors).where(eq(tutors.id, tutorId)).limit(1);
  if (!tutor) throw validationFailed([{ field: 'tutor_id', message: 'Tutor tidak ditemukan' }]);
}

/**
 * `POST /admin/attendance` — Admin mencatat sesi atas nama tutor. Alurnya sama dengan submit Tutor:
 * tersimpan `pending`, lalu divalidasi AI (route meng-enqueue analisis).
 */
export async function adminCreateAttendance(
  ctx: ServiceContext,
  input: AdminCreateAttendanceRequest,
): Promise<AdminAttendanceDetail> {
  await assertTutorExists(ctx.db, input.tutor_id);
  const duration = await assertPayloadValid(ctx, ctx.db, input);
  const id = await insertSession(ctx, { client_submission_id: randomUUID(), tutor_id: input.tutor_id, input, duration });
  return adminDetailById(ctx.db, id);
}

/**
 * `PUT /admin/attendance/:id` — koreksi data oleh Admin. Validitas & status tidak berubah (Admin
 * mengubahnya lewat endpoint validitas); bila sesi sedang dihitung, snapshot dihitung ulang dari
 * data baru karena ini koreksi data, bukan perubahan tarif.
 */
export async function adminUpdateAttendance(
  ctx: ServiceContext,
  sessionId: string,
  input: AdminUpdateAttendanceRequest,
): Promise<AdminAttendanceDetail> {
  return ctx.db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ status: lessonSessions.status })
      .from(lessonSessions)
      .where(eq(lessonSessions.id, sessionId))
      .for('update')
      .limit(1);
    if (!locked) throw notFound('Sesi');
    await assertTutorExists(tx, input.tutor_id);
    const duration = await assertPayloadValid(ctx, tx, input);
    const [student] = await tx.select({ grade: students.grade }).from(students).where(eq(students.id, input.student_id)).limit(1);
    const snapshot =
      locked.status === 'approved' && student ? countedSnapshot(student.grade, duration) : NO_SNAPSHOT;

    await tx
      .update(lessonSessions)
      .set({ tutor_id: input.tutor_id, ...normalizeEditable(input, duration), ...snapshot, updated_at: ctx.now() })
      .where(eq(lessonSessions.id, sessionId));
    await replaceSubjects(tx, sessionId, input.subject_ids);
    return adminDetailById(tx, sessionId);
  });
}

/** `DELETE /admin/attendance/:id` — hapus sesi beserta temuannya (mis. data duplikat yang Ditolak). */
export async function deleteAttendance(ctx: ServiceContext, sessionId: string): Promise<void> {
  await ctx.db.transaction(async (tx) => {
    // Temuan sesi lain yang merujuk sesi ini sebagai pembanding: lepaskan rujukannya.
    await tx
      .update(anomalyFlags)
      .set({ related_lesson_session_id: null })
      .where(and(eq(anomalyFlags.related_lesson_session_id, sessionId), ne(anomalyFlags.lesson_session_id, sessionId)));
    await tx.delete(anomalyFlags).where(eq(anomalyFlags.lesson_session_id, sessionId));
    const deleted = await tx.delete(lessonSessions).where(eq(lessonSessions.id, sessionId)).returning({ id: lessonSessions.id });
    if (deleted.length === 0) throw notFound('Sesi');
  });
}

/**
 * `PATCH /admin/attendance/:id/validity` — Admin mengoreksi label validitas AI atau memilih status
 * approval sesi Perlu revisi (hasil banding Tutor via WA). Berlaku dari status apa pun; keputusan
 * Admin tidak ditimpa hasil AI yang datang belakangan (AI hanya menulis sesi `pending`).
 */
export async function setAttendanceValidity(
  ctx: ServiceContext,
  adminUserId: string,
  sessionId: string,
  input: SetValidityRequest,
): Promise<AdminAttendanceDetail> {
  return ctx.db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ grade: students.grade, duration_minutes: lessonSessions.duration_minutes })
      .from(lessonSessions)
      .innerJoin(students, eq(students.id, lessonSessions.student_id))
      .where(eq(lessonSessions.id, sessionId))
      .for('update', { of: lessonSessions })
      .limit(1);
    if (!locked) throw notFound('Sesi');

    const approval = input.validity === 'needs_revision' ? input.approval : 'pending';
    const now = ctx.now();
    await tx
      .update(lessonSessions)
      .set({
        ...validityUpdate(locked, input.validity, approval),
        ...(input.admin_note !== undefined ? { admin_note: input.admin_note } : {}),
        reviewed_by_user_id: adminUserId,
        reviewed_at: now,
        updated_at: now,
      })
      .where(eq(lessonSessions.id, sessionId));
    return adminDetailById(tx, sessionId);
  });
}
