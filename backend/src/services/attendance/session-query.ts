import { and, eq, gte, lt, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { periodDateRange, type Period } from '@mumtaz/contracts';
import type { DbOrTx } from '../../db/client.js';
import { lessonSessionSubjects, lessonSessions, students, subjects, tutors, users } from '../../db/schema.js';

export const tutorUser = alias(users, 'tutor_user');

/**
 * Mapel per sesi digabung menjadi satu baris: ID (urut nama) dan nama dipisah koma, mis.
 * "IPA, Matematika". Dipakai semua tampilan, rekap, dan ekspor (kolom "mata pelajaran").
 */
export const sessionSubjects = (db: DbOrTx) =>
  db
    .select({
      lesson_session_id: lessonSessionSubjects.lesson_session_id,
      subject_ids: sql<string[]>`json_agg(${subjects.id} ORDER BY ${subjects.name}, ${subjects.id})`.as('subject_ids'),
      subject_names: sql<string[]>`json_agg(${subjects.name} ORDER BY ${subjects.name}, ${subjects.id})`.as('subject_names'),
      subject_name: sql<string>`string_agg(${subjects.name}, ', ' ORDER BY ${subjects.name}, ${subjects.id})`.as('subject_name'),
    })
    .from(lessonSessionSubjects)
    .innerJoin(subjects, eq(subjects.id, lessonSessionSubjects.subject_id))
    .groupBy(lessonSessionSubjects.lesson_session_id)
    .as('session_subjects');

/** Kolom sesi + kolom inti hasil join langsung sesi → tutor/siswa/mapel. */
function sessionViewColumns(subjectAgg: ReturnType<typeof sessionSubjects>) {
  return {
    id: lessonSessions.id,
    client_submission_id: lessonSessions.client_submission_id,
    tutor_id: lessonSessions.tutor_id,
    tutor_name: tutorUser.full_name,
    student_id: lessonSessions.student_id,
    student_name: students.full_name,
    grade: students.grade,
    school_name: students.school_name,
    subject_ids: subjectAgg.subject_ids,
    /** Sejajar dengan `subject_ids`. */
    subject_names: subjectAgg.subject_names,
    subject_name: subjectAgg.subject_name,
    lesson_date: lessonSessions.lesson_date,
    start_time: lessonSessions.start_time,
    end_time: lessonSessions.end_time,
    duration_minutes: lessonSessions.duration_minutes,
    learning_material: lessonSessions.learning_material,
    learning_notes: lessonSessions.learning_notes,
    next_focus: lessonSessions.next_focus,
    status: lessonSessions.status,
    validity: lessonSessions.validity,
    validity_reason: lessonSessions.validity_reason,
    anomaly_analysis_status: lessonSessions.anomaly_analysis_status,
    rate_amount_snapshot: lessonSessions.rate_amount_snapshot,
    admin_fee_snapshot: lessonSessions.admin_fee_snapshot,
    reviewed_by_user_id: lessonSessions.reviewed_by_user_id,
    submitted_at: lessonSessions.submitted_at,
    reviewed_at: lessonSessions.reviewed_at,
    updated_at: lessonSessions.updated_at,
    admin_note: lessonSessions.admin_note,
  };
}

export function selectSessionView(db: DbOrTx) {
  const subjectAgg = sessionSubjects(db);
  return db
    .select(sessionViewColumns(subjectAgg))
    .from(lessonSessions)
    .innerJoin(tutors, eq(tutors.id, lessonSessions.tutor_id))
    .innerJoin(tutorUser, eq(tutorUser.id, tutors.user_id))
    .innerJoin(students, eq(students.id, lessonSessions.student_id))
    .innerJoin(subjectAgg, eq(subjectAgg.lesson_session_id, lessonSessions.id));
}

export type SessionView = Awaited<ReturnType<ReturnType<typeof selectSessionView>['execute']>>[number];

/** Kolom `time` Postgres ("16:00:00") → "16:00"; `null` untuk sesi lama tanpa jam. */
export function hhmm(value: string | null): string | null {
  return value === null ? null : value.slice(0, 5);
}

/** Sesi yang mencakup mapel tertentu (filter daftar). */
export function sessionHasSubject(subjectId: string): SQL {
  return sql`exists (select 1 from ${lessonSessionSubjects} where ${lessonSessionSubjects.lesson_session_id} = ${lessonSessions.id} and ${lessonSessionSubjects.subject_id} = ${subjectId})`;
}

/** Filter periode SELALU berbasis `lesson_date` (docs/05 §4): [awal bulan, awal bulan berikutnya). */
export function lessonDateInPeriod(period: Period): SQL {
  const { start, endExclusive } = periodDateRange(period);
  const condition = and(gte(lessonSessions.lesson_date, start), lt(lessonSessions.lesson_date, endExclusive));
  if (!condition) throw new Error('Kondisi periode kosong');
  return condition;
}

/** Semua sesi pada periode (untuk agregasi rekap/payroll/dashboard). */
export function sessionsInPeriod(db: DbOrTx, period: Period, extra?: SQL) {
  return selectSessionView(db).where(and(lessonDateInPeriod(period), extra));
}
