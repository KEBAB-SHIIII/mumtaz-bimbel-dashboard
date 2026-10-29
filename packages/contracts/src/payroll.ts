import { z } from 'zod';
import { moneyStringSchema, uuidSchema } from './common.js';
import { periodSchema } from './period.js';

/** Label wajib UI untuk nominal demo (CLAUDE.md §2.7). */
export const DEMO_RATE_LABEL = 'Simulasi — bukan tarif resmi UMKM';

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
});
export type PayrollTutorSummary = z.infer<typeof payrollTutorSummarySchema>;

/** `GET /admin/payroll/preview` dan (difilter ke tutor login) `GET /tutor/me/payroll`. */
export const payrollPreviewResponseSchema = z.object({
  period: periodSchema,
  tutors: z.array(payrollTutorSummarySchema),
  total_estimated_amount: moneyStringSchema,
  is_demo_assumption: z.boolean(),
  /** `DEMO_RATE_LABEL` bila ada tarif demo; null bila tidak. */
  demo_label: z.string().nullable(),
  warnings: z.array(z.string()),
});
export type PayrollPreviewResponse = z.infer<typeof payrollPreviewResponseSchema>;
