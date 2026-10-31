import { and, eq, gte, lt, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { periodDateRange, type Period } from '@mumtaz/contracts';
import type { DbOrTx } from '../../db/client.js';
import { lessonSessions, students, subjects, tutors, users } from '../../db/schema.js';

export const tutorUser = alias(users, 'tutor_user');

/** Kolom sesi + delapan kolom inti hasil join langsung sesi → tutor/siswa/mapel. */
export const sessionViewColumns = {
  id: lessonSessions.id,
  client_submission_id: lessonSessions.client_submission_id,
  tutor_id: lessonSessions.tutor_id,
  tutor_name: tutorUser.full_name,
  student_id: lessonSessions.student_id,
  student_name: students.full_name,
  grade: students.grade,
  school_name: students.school_name,
  subject_id: lessonSessions.subject_id,
  subject_name: subjects.name,
  lesson_date: lessonSessions.lesson_date,
  duration_minutes: lessonSessions.duration_minutes,
  learning_material: lessonSessions.learning_material,
  learning_notes: lessonSessions.learning_notes,
  next_focus: lessonSessions.next_focus,
  status: lessonSessions.status,
  anomaly_analysis_status: lessonSessions.anomaly_analysis_status,
  rate_amount_snapshot: lessonSessions.rate_amount_snapshot,
  reviewed_by_user_id: lessonSessions.reviewed_by_user_id,
  submitted_at: lessonSessions.submitted_at,
  reviewed_at: lessonSessions.reviewed_at,
  updated_at: lessonSessions.updated_at,
  admin_note: lessonSessions.admin_note,
};

export function selectSessionView(db: DbOrTx) {
  return db
    .select(sessionViewColumns)
    .from(lessonSessions)
    .innerJoin(tutors, eq(tutors.id, lessonSessions.tutor_id))
    .innerJoin(tutorUser, eq(tutorUser.id, tutors.user_id))
    .innerJoin(students, eq(students.id, lessonSessions.student_id))
    .innerJoin(subjects, eq(subjects.id, lessonSessions.subject_id));
}

export type SessionView = Awaited<ReturnType<ReturnType<typeof selectSessionView>['execute']>>[number];

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
