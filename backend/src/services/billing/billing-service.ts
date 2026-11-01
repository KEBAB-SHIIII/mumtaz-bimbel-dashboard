import { and, asc, eq, inArray } from 'drizzle-orm';
import { Decimal } from 'decimal.js';
import type { BillingLine, BillingQuery, BillingResponse, BillingStudent } from '@mumtaz/contracts';
import { lessonSessions, parentStudents, users } from '../../db/schema.js';
import { money } from '../../lib/format.js';
import { notFound } from '../../lib/http-error.js';
import type { ServiceContext } from '../context.js';
import { hhmm, sessionsInPeriod, type SessionView } from '../attendance/session-query.js';

function toLine(row: SessionView, amount: Decimal): BillingLine {
  return {
    session_id: row.id,
    lesson_date: row.lesson_date,
    start_time: hhmm(row.start_time),
    end_time: hhmm(row.end_time),
    tutor_name: row.tutor_name,
    subject_name: row.subject_name,
    duration_minutes: row.duration_minutes,
    amount: money(amount),
  };
}

const byLessonTime = (a: SessionView, b: SessionView) =>
  a.lesson_date.localeCompare(b.lesson_date) ||
  (hhmm(a.start_time) ?? '').localeCompare(hhmm(b.start_time) ?? '') ||
  a.id.localeCompare(b.id);

/**
 * `GET /admin/billing` — tagihan per murid: hanya sesi yang dihitung (approved; Valid atau Perlu revisi
 * yang Disetujui) dengan tarif les snapshot (kotor) per sesi. Sesi dihitung tanpa tarif tidak diberi
 * nominal palsu; muncul sebagai peringatan.
 */
export async function getBilling(ctx: ServiceContext, query: BillingQuery): Promise<BillingResponse> {
  const rows = (
    await sessionsInPeriod(
      ctx.db,
      query.period,
      and(eq(lessonSessions.status, 'approved'), query.student_id ? eq(lessonSessions.student_id, query.student_id) : undefined),
    )
  ).sort(byLessonTime);

  const byStudent = new Map<string, { first: SessionView; lines: BillingLine[]; total: Decimal }>();
  const unpriced = new Map<string, number>();
  for (const row of rows) {
    if (row.rate_amount_snapshot === null) {
      unpriced.set(row.student_name, (unpriced.get(row.student_name) ?? 0) + 1);
      continue;
    }
    const amount = new Decimal(row.rate_amount_snapshot);
    const entry = byStudent.get(row.student_id) ?? { first: row, lines: [], total: new Decimal(0) };
    entry.lines.push(toLine(row, amount));
    entry.total = entry.total.plus(amount);
    byStudent.set(row.student_id, entry);
  }

  const studentIds = [...byStudent.keys()];
  const parents =
    studentIds.length === 0
      ? []
      : await ctx.db
          .select({ student_id: parentStudents.student_id, full_name: users.full_name })
          .from(parentStudents)
          .innerJoin(users, eq(users.id, parentStudents.parent_user_id))
          .where(and(inArray(parentStudents.student_id, studentIds), eq(users.is_active, true)))
          .orderBy(asc(users.full_name));

  const students: BillingStudent[] = [...byStudent.entries()]
    .map(([studentId, entry]) => ({
      student_id: studentId,
      student_name: entry.first.student_name,
      grade: entry.first.grade,
      school_name: entry.first.school_name,
      parent_names: parents.filter((parent) => parent.student_id === studentId).map((parent) => parent.full_name),
      sessions: entry.lines.length,
      total_amount: money(entry.total),
      lines: entry.lines,
    }))
    .sort((a, b) => a.student_name.localeCompare(b.student_name) || a.student_id.localeCompare(b.student_id));

  return {
    period: query.period,
    students,
    total_sessions: students.reduce((sum, student) => sum + student.sessions, 0),
    total_amount: money(students.reduce((sum, student) => sum.plus(student.total_amount), new Decimal(0))),
    warnings: [...unpriced.entries()].map(
      ([name, count]) => `${name}: ${count} sesi dihitung belum memiliki tarif (kelas tidak didukung); tidak ditagihkan.`,
    ),
  };
}

/** Tagihan satu murid untuk invoice; 404 bila murid tidak punya sesi yang dihitung pada periode. */
export async function getStudentBilling(ctx: ServiceContext, studentId: string, period: BillingQuery['period']): Promise<BillingStudent> {
  const billing = await getBilling(ctx, { period, student_id: studentId });
  const student = billing.students[0];
  if (!student) throw notFound('Tagihan murid pada periode ini');
  return student;
}
