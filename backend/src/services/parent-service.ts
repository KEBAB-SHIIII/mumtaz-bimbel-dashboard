import { and, asc, desc, eq } from 'drizzle-orm';
import type { ParentProgressResponse, ParentStudent, Period } from '@mumtaz/contracts';
import { lessonSessions, parentStudents, students } from '../db/schema.js';
import { forbidden } from '../lib/http-error.js';
import type { ServiceContext } from './context.js';
import { sessionsInPeriod } from './attendance/session-query.js';

/** `GET /parent/me/students` — hanya siswa yang terhubung via `parent_students`. */
export async function listParentStudents(ctx: ServiceContext, parentUserId: string): Promise<ParentStudent[]> {
  return ctx.db
    .select({
      id: students.id,
      full_name: students.full_name,
      grade: students.grade,
      school_name: students.school_name,
      relationship: parentStudents.relationship,
    })
    .from(parentStudents)
    .innerJoin(students, eq(students.id, parentStudents.student_id))
    .where(eq(parentStudents.parent_user_id, parentUserId))
    .orderBy(asc(students.full_name));
}

/**
 * Relasi parent-anak diperiksa di backend pada SETIAP request.
 * Anak yang tidak terhubung → 403 (tanpa membedakan apakah siswa ada).
 */
export async function assertParentLinked(ctx: ServiceContext, parentUserId: string, studentId: string) {
  const [link] = await ctx.db
    .select({
      id: students.id,
      full_name: students.full_name,
      grade: students.grade,
      school_name: students.school_name,
    })
    .from(parentStudents)
    .innerJoin(students, eq(students.id, parentStudents.student_id))
    .where(and(eq(parentStudents.parent_user_id, parentUserId), eq(parentStudents.student_id, studentId)))
    .limit(1);
  if (!link) throw forbidden();
  return link;
}

/**
 * Progress Anak: hanya sesi `approved`, hanya field yang diizinkan
 * (tanpa admin_note, anomali, tarif/honor).
 */
export async function getParentProgress(
  ctx: ServiceContext,
  parentUserId: string,
  studentId: string,
  period: Period,
): Promise<ParentProgressResponse> {
  const student = await assertParentLinked(ctx, parentUserId, studentId);
  const rows = await sessionsInPeriod(
    ctx.db,
    period,
    and(eq(students.id, studentId), eq(lessonSessions.status, 'approved')),
  ).orderBy(desc(lessonSessions.lesson_date), asc(lessonSessions.id));

  return {
    student,
    period,
    sessions: rows.map((row) => ({
      id: row.id,
      lesson_date: row.lesson_date,
      tutor_name: row.tutor_name,
      subject_name: row.subject_name,
      duration_minutes: row.duration_minutes,
      learning_material: row.learning_material,
      learning_notes: row.learning_notes,
      next_focus: row.next_focus,
    })),
  };
}
