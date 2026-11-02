import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { lessonSessions, parentStudents } from '../db/schema.js';
import type { ServiceContext } from './context.js';

export async function listAvailablePeriods(ctx: ServiceContext, scope: { tutorId?: string; parentId?: string } = {}) {
  const month = sql<string>`to_char(${lessonSessions.lesson_date}, 'YYYY-MM')`;
  const rows = await ctx.db.selectDistinct({ period: month }).from(lessonSessions).where(and(
    scope.tutorId ? eq(lessonSessions.tutor_id, scope.tutorId) : undefined,
    scope.parentId ? and(
      eq(lessonSessions.status, 'approved'),
      inArray(lessonSessions.student_id, ctx.db.select({ id: parentStudents.student_id }).from(parentStudents).where(eq(parentStudents.parent_user_id, scope.parentId))),
    ) : undefined,
  )).orderBy(desc(month));
  return { periods: rows.map((row) => row.period) };
}
