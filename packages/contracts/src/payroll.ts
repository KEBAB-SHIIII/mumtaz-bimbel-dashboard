import { z } from 'zod';
import { isoDateSchema, moneyStringSchema, uuidSchema } from './common.js';
import { sessionStatusSchema } from './enums.js';
import { periodSchema } from './period.js';

const statusCountsFields = {
  approved_sessions: z.number().int().min(0),
  pending_sessions: z.number().int().min(0),
  revision_requested_sessions: z.number().int().min(0),
  rejected_sessions: z.number().int().min(0),
};

/** Rincian per nilai tarif snapshot, agar nominal dapat ditelusuri ke sesi. */
export const payrollRateLineSchema = z.object({
  rate_amount: moneyStringSchema,
  is_demo_assumption: z.boolean(),
  sessions: z.number().int().min(1),
  subtotal: moneyStringSchema,
  session_ids: z.array(uuidSchema),
});
export type PayrollRateLine = z.infer<typeof payrollRateLineSchema>;

/**
 * Satu sesi sumber kalkulasi (docs/15 §2.4, §3.4). Semua sesi tutor pada periode
 * ikut ditampilkan; hanya yang `counted=true` (approved + tarif snapshot) masuk total.
 */
export const payrollSessionLineSchema = z.object({
  session_id: uuidSchema,
  lesson_date: isoDateSchema,
  student_name: z.string(),
  subject_name: z.string(),
  duration_minutes: z.number().int(),
  status: sessionStatusSchema,
  /** Tarif snapshot saat approve; `null` bila belum approved atau tarif tidak ada. */
  rate_amount: moneyStringSchema.nullable(),
  is_demo_assumption: z.boolean().nullable(),
  /** Nilai sesi yang dihitung; `null` bila tidak masuk total. */
  amount: moneyStringSchema.nullable(),
  counted: z.boolean(),
});
export type PayrollSessionLine = z.infer<typeof payrollSessionLineSchema>;

export const payrollTutorSummarySchema = z.object({
  tutor_id: uuidSchema,
  tutor_name: z.string(),
  ...statusCountsFields,
  /** Hanya dari sesi `approved` yang memiliki tarif snapshot. */
  estimated_amount: moneyStringSchema,
  rate_lines: z.array(payrollRateLineSchema),
  /** Sesi approved tanpa tarif valid: tidak diberi nominal palsu, tampilkan warning. */
  approved_sessions_without_rate: z.number().int().min(0),
  is_demo_assumption: z.boolean(),
  /** Rincian sesi (urut tanggal les); total = Σ `amount` dari sesi `counted`. */
  sessions: z.array(payrollSessionLineSchema),
});
export type PayrollTutorSummary = z.infer<typeof payrollTutorSummarySchema>;

/** `GET /admin/payroll/preview` dan (difilter ke tutor login) `GET /tutor/me/payroll`. */
export const payrollPreviewResponseSchema = z.object({
  period: periodSchema,
  tutors: z.array(payrollTutorSummarySchema),
  total_estimated_amount: moneyStringSchema,
  /** Ada nominal dari tarif demo → UI menampilkan badge "Tarif demo" (keputusan owner, CLAUDE.md §2.7). */
  is_demo_assumption: z.boolean(),
  warnings: z.array(z.string()),
});
export type PayrollPreviewResponse = z.infer<typeof payrollPreviewResponseSchema>;
