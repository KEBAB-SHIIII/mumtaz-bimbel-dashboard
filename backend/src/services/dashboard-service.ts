import { and, count, eq, gte, lt, sql } from 'drizzle-orm';
import { Decimal } from 'decimal.js';
import { periodDateRange, trailingPeriods } from '@mumtaz/contracts';
import type {
  AdminDashboardSummary,
  ParentDashboardSummary,
  Period,
  SessionStatusCounts,
  TutorDashboardSummary,
} from '@mumtaz/contracts';
import { lessonSessions, tutors, users } from '../db/schema.js';
import { money } from '../lib/format.js';
import type { ServiceContext } from './context.js';
import { sessionsInPeriod, type SessionView } from './attendance/session-query.js';
import { assertParentLinked } from './parent-service.js';
import { getTutorPayroll } from './payroll-service.js';

function statusCounts(rows: SessionView[]): SessionStatusCounts {
  const counts: SessionStatusCounts = { pending: 0, approved: 0, revision_requested: 0, rejected: 0 };
  for (const row of rows) {
    const status = row.status as keyof SessionStatusCounts;
    counts[status] += 1;
  }
  return counts;
}

const REVENUE_MONTHS = 6;

/** Pendapatan per bulan (6 bulan s.d. periode) dari snapshot sesi yang dihitung; bulan tanpa sesi = 0. */
async function revenueByMonth(ctx: ServiceContext, period: Period): Promise<AdminDashboardSummary['revenue_by_month']> {
  const periods = trailingPeriods(period, REVENUE_MONTHS);
  const month = sql<string>`to_char(${lessonSessions.lesson_date}, 'YYYY-MM')`;
  const rows = await ctx.db
    .select({
      period: month,
      gross: sql<string>`coalesce(sum(${lessonSessions.rate_amount_snapshot}), 0)`,
      fee: sql<string>`coalesce(sum(${lessonSessions.admin_fee_snapshot}), 0)`,
    })
    .from(lessonSessions)
    .where(
      and(
        eq(lessonSessions.status, 'approved'),
        gte(lessonSessions.lesson_date, periodDateRange(periods[0] ?? period).start),
        lt(lessonSessions.lesson_date, periodDateRange(period).endExclusive),
      ),
    )
    .groupBy(month);
  return periods.map((item) => {
    const row = rows.find((r) => r.period === item);
    const gross = new Decimal(row?.gross ?? 0);
    const fee = new Decimal(row?.fee ?? 0);
    return { period: item, gross_revenue: money(gross), tutor_salary: money(gross.minus(fee)), net_revenue: money(fee) };
  });
}

export async function getAdminDashboardSummary(ctx: ServiceContext, period: Period): Promise<AdminDashboardSummary> {
  const [rows, [activeTutors], revenue] = await Promise.all([
    sessionsInPeriod(ctx.db, period),
    ctx.db
      .select({ value: count() })
      .from(tutors)
      .innerJoin(users, eq(users.id, tutors.user_id))
      .where(and(eq(tutors.is_active, true), eq(users.is_active, true))),
    revenueByMonth(ctx, period),
  ]);

  // Omzet kotor = Σ tarif les terkunci (snapshot) sesi yang dihitung = total tagihan orang tua.
  const gross = rows
    .filter((row) => row.status === 'approved' && row.rate_amount_snapshot !== null)
    .reduce((sum, row) => sum.plus(row.rate_amount_snapshot ?? 0), new Decimal(0));

  return {
    period,
    active_tutors: activeTutors?.value ?? 0,
    students_with_sessions: new Set(rows.map((row) => row.student_id)).size,
    total_sessions: rows.length,
    gross_revenue: money(gross),
    revenue_by_month: revenue,
  };
}

export async function getTutorDashboardSummary(
  ctx: ServiceContext,
  tutorId: string,
  period: Period,
): Promise<TutorDashboardSummary> {
  const [rows, payroll] = await Promise.all([
    sessionsInPeriod(ctx.db, period, eq(lessonSessions.tutor_id, tutorId)),
    getTutorPayroll(ctx, tutorId, period),
  ]);
  return {
    period,
    status_counts: statusCounts(rows),
    // Tutor hanya melihat pendapatan bersihnya (setelah potongan Admin).
    honor: { estimated_amount: payroll.net_amount },
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
    and(eq(lessonSessions.student_id, studentId), eq(lessonSessions.status, 'approved')),
  );
  return {
    period,
    student_id: studentId,
    approved_sessions: rows.length,
    approved_duration_minutes: rows.reduce((sum, row) => sum + row.duration_minutes, 0),
    subjects: [...new Set(rows.map((row) => row.subject_name))].sort(),
  };
}
