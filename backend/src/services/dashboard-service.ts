import { and, count, eq } from 'drizzle-orm';
import type {
  AdminDashboardSummary,
  ParentDashboardSummary,
  Period,
  SessionStatusCounts,
  TutorDashboardSummary,
} from '@mumtaz/contracts';
import { anomalyFlags, lessonSessions, students, tutorAssignments, tutors, users } from '../db/schema.js';
import type { ServiceContext } from './context.js';
import { lessonDateInPeriod, sessionsInPeriod, type SessionView } from './attendance/session-query.js';
import { assertParentLinked } from './parent-service.js';
import { getPayrollPreview } from './payroll-service.js';

function statusCounts(rows: SessionView[]): SessionStatusCounts {
  const counts: SessionStatusCounts = { pending: 0, approved: 0, revision_requested: 0, rejected: 0 };
  for (const row of rows) {
    const status = row.status as keyof SessionStatusCounts;
    counts[status] += 1;
  }
  return counts;
}

export async function getAdminDashboardSummary(ctx: ServiceContext, period: Period): Promise<AdminDashboardSummary> {
  const [rows, [activeTutors], [activeStudents], [pendingFindings], payroll] = await Promise.all([
    sessionsInPeriod(ctx.db, period),
    ctx.db
      .select({ value: count() })
      .from(tutors)
      .innerJoin(users, eq(users.id, tutors.user_id))
      .where(and(eq(tutors.is_active, true), eq(users.is_active, true))),
    ctx.db.select({ value: count() }).from(students).where(eq(students.is_active, true)),
    ctx.db
      .select({ value: count() })
      .from(anomalyFlags)
      .innerJoin(lessonSessions, eq(lessonSessions.id, anomalyFlags.lesson_session_id))
      .where(and(eq(anomalyFlags.review_status, 'pending_review'), lessonDateInPeriod(period))),
    getPayrollPreview(ctx, period),
  ]);

  return {
    period,
    active_tutors: activeTutors?.value ?? 0,
    active_students: activeStudents?.value ?? 0,
    total_sessions: rows.length,
    status_counts: statusCounts(rows),
    anomaly_findings_pending_review: pendingFindings?.value ?? 0,
    honor: {
      estimated_amount: payroll.total_estimated_amount,
      is_demo_assumption: payroll.is_demo_assumption,
      demo_label: payroll.demo_label,
    },
  };
}

export async function getTutorDashboardSummary(
  ctx: ServiceContext,
  tutorId: string,
  period: Period,
): Promise<TutorDashboardSummary> {
  const [rows, payroll] = await Promise.all([
    sessionsInPeriod(ctx.db, period, eq(tutorAssignments.tutor_id, tutorId)),
    getPayrollPreview(ctx, period, { tutorId }),
  ]);
  return {
    period,
    status_counts: statusCounts(rows),
    honor: {
      estimated_amount: payroll.total_estimated_amount,
      is_demo_assumption: payroll.is_demo_assumption,
      demo_label: payroll.demo_label,
    },
  };
}

/** Hanya sesi `approved` anak yang terhubung; tanpa honor/anomali. */
export async function getParentDashboardSummary(
  ctx: ServiceContext,
  parentUserId: string,
  studentId: string,
  period: Period,
): Promise<ParentDashboardSummary> {
  await assertParentLinked(ctx, parentUserId, studentId);
  const rows = await sessionsInPeriod(
    ctx.db,
    period,
    and(eq(tutorAssignments.student_id, studentId), eq(lessonSessions.status, 'approved')),
  );
  return {
    period,
    student_id: studentId,
    approved_sessions: rows.length,
    approved_duration_minutes: rows.reduce((sum, row) => sum + row.duration_minutes, 0),
    subjects: [...new Set(rows.map((row) => row.subject_name))].sort(),
  };
}
