import { z } from 'zod';
import { moneyStringSchema, uuidSchema } from './common.js';
import { registrationSourceSchema } from './master-data.js';
import { periodSchema } from './period.js';

export const sessionStatusCountsSchema = z.object({
  pending: z.number().int().min(0),
  approved: z.number().int().min(0),
  revision_requested: z.number().int().min(0),
  rejected: z.number().int().min(0),
});
export type SessionStatusCounts = z.infer<typeof sessionStatusCountsSchema>;

const honorEstimateSchema = z.object({
  estimated_amount: moneyStringSchema,
});

/**
 * `GET /admin/dashboard/summary` — empat metrik inti (revisi PM, Stand Up #6).
 * `students_with_sessions`: siswa yang punya sesi pada periode. `gross_revenue`: omzet kotor
 * (jumlah tarif les sesi yang dihitung, sebelum potongan Admin dan honor tutor).
 */
export const adminDashboardSummarySchema = z.object({
  period: periodSchema,
  active_tutors: z.number().int().min(0),
  students_with_sessions: z.number().int().min(0),
  total_sessions: z.number().int().min(0),
  gross_revenue: moneyStringSchema,
});
export type AdminDashboardSummary = z.infer<typeof adminDashboardSummarySchema>;

const yearSchema = z.coerce.number().int().min(2000).max(2100);

/** `GET /admin/dashboard/revenue?year=2026` — tanpa `year` dipakai tahun terbaru yang punya sesi dihitung. */
export const adminRevenueQuerySchema = z.object({ year: yearSchema.optional() });

/**
 * Grafik pendapatan satu tahun penuh (Januari–Desember, bulan tanpa sesi = 0) dari snapshot sesi yang dihitung.
 * `tutor_salary` = Σ (kotor − potongan); `net_revenue` = Σ potongan Admin (pendapatan bersih bimbel).
 * `years`: tahun yang punya sesi dihitung (baru → lama), untuk filter tahun.
 */
export const adminRevenueSchema = z.object({
  year: yearSchema,
  years: z.array(yearSchema),
  months: z.array(
    z.object({
      period: periodSchema,
      gross_revenue: moneyStringSchema,
      tutor_salary: moneyStringSchema,
      net_revenue: moneyStringSchema,
    }),
  ).length(12),
});
export type AdminRevenue = z.infer<typeof adminRevenueSchema>;

/**
 * `GET /admin/dashboard/registration-sources` — jumlah murid aktif per sumber pendaftaran,
 * urut sesuai `REGISTRATION_SOURCE_OPTIONS`; `source: null` = belum diisi (hanya bila > 0).
 */
export const adminRegistrationSourcesSchema = z.object({
  sources: z.array(z.object({ source: registrationSourceSchema.nullable(), students: z.number().int().min(0) })),
});
export type AdminRegistrationSources = z.infer<typeof adminRegistrationSourcesSchema>;

/** Jenjang tarif (sama dengan `gradeTier` backend), urutan PAUD → SMA. */
export const GRADE_TIERS = ['PAUD-TK', 'SD 1-3', 'SD 4-6', 'SMP', 'SMA'] as const;
export const gradeTierSchema = z.enum(GRADE_TIERS);

/**
 * `GET /admin/dashboard/charts?period=YYYY-MM` — grafik dashboard dari sesi yang dihitung (`approved`):
 * - `tutor_ranking`: maks. 6 tutor dengan sesi terbanyak pada `period` (seri → nama).
 * - `grade_composition`: murid bersesi pada `period` per jenjang (kelas saat les); semua jenjang tampil.
 */
export const adminDashboardChartsSchema = z.object({
  period: periodSchema,
  tutor_ranking: z.array(z.object({ tutor_id: uuidSchema, name: z.string(), sessions: z.number().int().min(0) })).max(6),
  grade_composition: z.array(z.object({ tier: gradeTierSchema, students: z.number().int().min(0) })).length(GRADE_TIERS.length),
});
export type AdminDashboardCharts = z.infer<typeof adminDashboardChartsSchema>;

/**
 * `GET /admin/dashboard/student-growth?year=2026` — murid aktif Januari–Desember (bulan tanpa sesi = 0):
 * `students` = murid berbeda dengan sesi dihitung di bulan itu, `change` = selisih dari bulan sebelumnya
 * (Januari dibandingkan Desember tahun lalu) — definisi sama dengan dataset DS. `years` = tahun yang punya
 * sesi dihitung (baru → lama); tanpa `year` dipakai tahun terbaru.
 */
export const adminStudentGrowthSchema = z.object({
  year: yearSchema,
  years: z.array(yearSchema),
  months: z.array(z.object({ period: periodSchema, students: z.number().int().min(0), change: z.number().int() })).length(12),
});
export type AdminStudentGrowth = z.infer<typeof adminStudentGrowthSchema>;

/** `GET /tutor/dashboard/summary` — hanya tutor dari session. */
export const tutorDashboardSummarySchema = z.object({
  period: periodSchema,
  status_counts: sessionStatusCountsSchema,
  honor: honorEstimateSchema,
});
export type TutorDashboardSummary = z.infer<typeof tutorDashboardSummarySchema>;

export const parentDashboardQuerySchema = z.object({
  student_id: uuidSchema,
  period: periodSchema,
});

/** `GET /parent/dashboard/summary` — hanya sesi `approved` anak terhubung; tanpa honor/anomali. */
export const parentDashboardSummarySchema = z.strictObject({
  period: periodSchema,
  student_id: uuidSchema,
  approved_sessions: z.number().int().min(0),
  approved_duration_minutes: z.number().int().min(0),
  subjects: z.array(z.string()),
  /** Jumlah sesi approved per mapel (sesi multi-mapel dihitung di tiap mapelnya); sesi terbanyak dulu, lalu nama. */
  subject_sessions: z.array(z.strictObject({ name: z.string(), sessions: z.number().int().min(0) })),
});
export type ParentDashboardSummary = z.infer<typeof parentDashboardSummarySchema>;
