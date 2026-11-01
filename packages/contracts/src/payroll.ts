import { z } from 'zod';
import { isoDateSchema, moneyStringSchema, uuidSchema } from './common.js';
import { approvalStatusSchema, sessionStatusSchema, sessionValiditySchema } from './enums.js';
import { periodSchema } from './period.js';

/**
 * Honor (revisi PM, D-25): tarif les per sesi (kotor) dikurangi potongan Admin per sesi = pendapatan
 * bersih tutor. Hanya sesi yang dihitung (`status=approved`) dengan snapshot tarif yang bernominal.
 */
const sessionLineBase = {
  session_id: uuidSchema,
  lesson_date: isoDateSchema,
  student_name: z.string(),
  subject_name: z.string(),
  duration_minutes: z.number().int(),
  status: sessionStatusSchema,
  validity: sessionValiditySchema.nullable(),
  approval_status: approvalStatusSchema.nullable(),
  counted: z.boolean(),
};

/** Baris rincian sesi untuk Admin (crosscheck dengan tutor): tarif kotor, potongan, bersih. */
export const payrollSessionLineSchema = z.object({
  ...sessionLineBase,
  /** Tarif les sesi (kotor); `null` bila tidak dihitung. */
  gross_amount: moneyStringSchema.nullable(),
  admin_fee: moneyStringSchema.nullable(),
  net_amount: moneyStringSchema.nullable(),
});
export type PayrollSessionLine = z.infer<typeof payrollSessionLineSchema>;

export const payrollTutorSummarySchema = z.object({
  tutor_id: uuidSchema,
  tutor_name: z.string(),
  /** Sesi valid (dihitung) dan yang tidak dihitung (menunggu validasi, perlu revisi, ditolak). */
  counted_sessions: z.number().int().min(0),
  not_counted_sessions: z.number().int().min(0),
  /** Subtotal tarif les (kotor). */
  gross_amount: moneyStringSchema,
  /** Total potongan Admin. */
  admin_fee_amount: moneyStringSchema,
  /** Total pendapatan bersih tutor = kotor − potongan. */
  net_amount: moneyStringSchema,
  /** Sesi dihitung tanpa tarif valid: tidak diberi nominal palsu, tampilkan warning. */
  approved_sessions_without_rate: z.number().int().min(0),
  sessions: z.array(payrollSessionLineSchema),
});
export type PayrollTutorSummary = z.infer<typeof payrollTutorSummarySchema>;

/** `GET /admin/payroll/preview`. */
export const payrollPreviewResponseSchema = z.object({
  period: periodSchema,
  tutors: z.array(payrollTutorSummarySchema),
  totals: z.object({
    /** Total pendapatan kotor (omzet) bulan ini. */
    gross_amount: moneyStringSchema,
    /** Total pendapatan bersih bimbel = Σ potongan Admin. */
    admin_fee_amount: moneyStringSchema,
    /** Total gaji yang harus dibayarkan = Σ pendapatan bersih tutor. */
    net_amount: moneyStringSchema,
  }),
  warnings: z.array(z.string()),
});
export type PayrollPreviewResponse = z.infer<typeof payrollPreviewResponseSchema>;

/** Baris sesi untuk Tutor: HANYA nominal bersih (tanpa tarif kotor & potongan; revisi PM). */
export const tutorPayrollSessionLineSchema = z.strictObject({
  ...sessionLineBase,
  net_amount: moneyStringSchema.nullable(),
});
export type TutorPayrollSessionLine = z.infer<typeof tutorPayrollSessionLineSchema>;

/** `GET /tutor/me/payroll` — Honor Saya: pendapatan bersih tutor login saja. */
export const tutorPayrollResponseSchema = z.strictObject({
  period: periodSchema,
  counted_sessions: z.number().int().min(0),
  not_counted_sessions: z.number().int().min(0),
  net_amount: moneyStringSchema,
  sessions: z.array(tutorPayrollSessionLineSchema),
  warnings: z.array(z.string()),
});
export type TutorPayrollResponse = z.infer<typeof tutorPayrollResponseSchema>;
