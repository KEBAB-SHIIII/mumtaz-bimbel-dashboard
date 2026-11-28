import { and, asc, count, countDistinct, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { Decimal } from 'decimal.js';
import { GRADE_TIERS, REGISTRATION_SOURCE_OPTIONS, todayInBusinessTimeZone, trailingPeriods } from '@mumtaz/contracts';
import type {
  AdminDashboardCharts,
  AdminDashboardSummary,
  AdminRegistrationSources,
  AdminRevenue,
  AdminStudentGrowth,
  ParentDashboardSummary,
  Period,
  SessionStatusCounts,
  TutorDashboardSummary,
} from '@mumtaz/contracts';
import { lessonSessions, students, tutors, users } from '../db/schema.js';
import { money } from '../lib/format.js';
import { gradeTier } from './billing/tariff.js';
import { gradeAtDate } from './master-data/grade-history.js';
import type { ServiceContext } from './context.js';
import { lessonDateInPeriod, sessionsInPeriod, type SessionView } from './attendance/session-query.js';
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

/**
 * Grafik dashboard dari sesi yang dihitung (`approved`): peringkat tutor & komposisi jenjang untuk
 * `period`, pertumbuhan murid aktif 12 bulan s.d. `period` (lihat `adminDashboardChartsSchema`).
 */
export async function getAdminDashboardCharts(ctx: ServiceContext, period: Period): Promise<AdminDashboardCharts> {
  const inPeriod = and(eq(lessonSessions.status, 'approved'), lessonDateInPeriod(period));
  const sessionsCount = count(lessonSessions.id);
  const ranking = await ctx.db
    .select({ tutor_id: tutors.id, name: users.full_name, sessions: sessionsCount })
    .from(lessonSessions)
    .innerJoin(tutors, eq(tutors.id, lessonSessions.tutor_id))
    .innerJoin(users, eq(users.id, tutors.user_id))
    .where(inPeriod)
    .groupBy(tutors.id, users.full_name)
    .orderBy(desc(sessionsCount), asc(users.full_name))
    .limit(6);

  // Kelas saat les (snapshot; sesi lama tanpa snapshot → riwayat kelas pada tanggal les). Murid dengan
  // beberapa kelas dalam sebulan dihitung pada kelas terakhirnya.
  const studentGrades = await ctx.db
    .selectDistinctOn([lessonSessions.student_id], {
      student_id: lessonSessions.student_id,
      grade: sql<string>`coalesce(${lessonSessions.grade_snapshot}, ${gradeAtDate(sql`${lessonSessions.lesson_date}`)})`,
    })
    .from(lessonSessions)
    .innerJoin(students, eq(students.id, lessonSessions.student_id))
    .where(inPeriod)
    .orderBy(lessonSessions.student_id, desc(lessonSessions.lesson_date));
  const tiers = new Map<string, number>();
  for (const row of studentGrades) {
    const tier = row.grade ? gradeTier(row.grade) : null;
    if (tier) tiers.set(tier, (tiers.get(tier) ?? 0) + 1);
  }

  return {
    period,
    tutor_ranking: ranking,
    grade_composition: GRADE_TIERS.map((tier) => ({ tier, students: tiers.get(tier) ?? 0 })),
  };
}

/** Tahun yang punya sesi dihitung (baru → lama). */
async function countedYears(ctx: ServiceContext): Promise<number[]> {
  const yearOf = sql<number>`extract(year from ${lessonSessions.lesson_date})::int`;
  return (await ctx.db.selectDistinct({ year: yearOf }).from(lessonSessions)
    .where(eq(lessonSessions.status, 'approved')).orderBy(desc(yearOf))).map((row) => Number(row.year));
}

/**
 * Pertumbuhan murid aktif Januari–Desember satu tahun (lihat `adminStudentGrowthSchema`).
 * Tanpa `year` dipakai tahun terbaru yang punya sesi dihitung (atau tahun berjalan bila belum ada).
 */
export async function getAdminStudentGrowth(ctx: ServiceContext, requestedYear?: number): Promise<AdminStudentGrowth> {
  const years = await countedYears(ctx);
  const year = requestedYear ?? years[0] ?? Number(todayInBusinessTimeZone(ctx.now()).slice(0, 4));
  // Desember tahun lalu ikut dihitung sebagai pembanding Januari.
  const months = trailingPeriods(`${year}-12`, 13);
  const month = sql<string>`to_char(${lessonSessions.lesson_date}, 'YYYY-MM')`;
  const active = await ctx.db
    .select({ period: month, students: countDistinct(lessonSessions.student_id) })
    .from(lessonSessions)
    .where(and(eq(lessonSessions.status, 'approved'), gte(lessonSessions.lesson_date, `${year - 1}-12-01`), lt(lessonSessions.lesson_date, `${year + 1}-01-01`)))
    .groupBy(month);
  const activeOf = (p: string) => active.find((row) => row.period === p)?.students ?? 0;
  return {
    year,
    years,
    months: months.slice(1).map((p, i) => ({ period: p, students: activeOf(p), change: activeOf(p) - activeOf(months[i] as string) })),
  };
}

/**
 * Jumlah murid aktif per sumber pendaftaran. Semua kanal selalu tampil (0 bila kosong) agar urutan
 * grafik stabil; murid lama tanpa sumber dikelompokkan `null` dan hanya tampil bila ada.
 */
export async function getAdminRegistrationSources(ctx: ServiceContext): Promise<AdminRegistrationSources> {
  const rows = await ctx.db
    .select({ source: students.registration_source, n: count() })
    .from(students)
    .where(eq(students.is_active, true))
    .groupBy(students.registration_source);
  const countOf = (source: string | null) => rows.find((row) => row.source === source)?.n ?? 0;
  const unknown = countOf(null);
  return {
    sources: [
      ...REGISTRATION_SOURCE_OPTIONS.map((source) => ({ source, students: countOf(source) })),
      ...(unknown > 0 ? [{ source: null, students: unknown }] : []),
    ],
  };
}

/**
 * Pendapatan satu tahun penuh (Januari–Desember) dari snapshot sesi yang dihitung; bulan tanpa sesi = 0.
 * Tanpa `year` dipakai tahun terbaru yang punya sesi dihitung (atau tahun berjalan bila belum ada).
 */
export async function getAdminRevenue(ctx: ServiceContext, requestedYear?: number): Promise<AdminRevenue> {
  const years = await countedYears(ctx);
  const year = requestedYear ?? years[0] ?? Number(todayInBusinessTimeZone(ctx.now()).slice(0, 4));
  const periods = trailingPeriods(`${year}-12`, 12);
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
        gte(lessonSessions.lesson_date, `${year}-01-01`),
        lt(lessonSessions.lesson_date, `${year + 1}-01-01`),
      ),
    )
    .groupBy(month);
  return {
    year,
    years,
    months: periods.map((item) => {
      const row = rows.find((r) => r.period === item);
      const gross = new Decimal(row?.gross ?? 0);
      const fee = new Decimal(row?.fee ?? 0);
      return { period: item, gross_revenue: money(gross), tutor_salary: money(gross.minus(fee)), net_revenue: money(fee) };
    }),
  };
}

export async function getAdminDashboardSummary(ctx: ServiceContext, period: Period): Promise<AdminDashboardSummary> {
  const [rows, [activeTutors]] = await Promise.all([
    sessionsInPeriod(ctx.db, period),
    ctx.db
      .select({ value: count() })
      .from(tutors)
      .innerJoin(users, eq(users.id, tutors.user_id))
      .where(and(eq(tutors.is_active, true), eq(users.is_active, true))),
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
  const perSubject = new Map<string, number>();
  for (const row of rows) for (const name of new Set(row.subject_names)) perSubject.set(name, (perSubject.get(name) ?? 0) + 1);
  return {
    period,
    student_id: studentId,
    approved_sessions: rows.length,
    approved_duration_minutes: rows.reduce((sum, row) => sum + row.duration_minutes, 0),
    subjects: [...perSubject.keys()].sort((a, b) => a.localeCompare(b, 'id')),
    subject_sessions: [...perSubject].map(([name, sessions]) => ({ name, sessions }))
      .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name, 'id')),
  };
}
