import { z } from 'zod';
import { moneyStringSchema, uuidSchema } from './common.js';
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
  /**
   * Grafik pendapatan: 6 bulan terakhir s.d. periode (urut lama → baru), dari snapshot sesi yang dihitung.
   * `tutor_salary` = Σ (kotor − potongan); `net_revenue` = Σ potongan Admin (pendapatan bersih bimbel).
   */
  revenue_by_month: z.array(
    z.object({
      period: periodSchema,
      gross_revenue: moneyStringSchema,
      tutor_salary: moneyStringSchema,
      net_revenue: moneyStringSchema,
    }),
  ),
});
export type AdminDashboardSummary = z.infer<typeof adminDashboardSummarySchema>;

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
});
export type ParentDashboardSummary = z.infer<typeof parentDashboardSummarySchema>;
