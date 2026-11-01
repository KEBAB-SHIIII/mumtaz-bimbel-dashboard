import { z } from 'zod';
import { isoDateSchema, moneyStringSchema, uuidSchema } from './common.js';
import { lessonTimeSchema } from './attendance.js';
import { periodSchema } from './period.js';

/**
 * Penagihan Orang Tua (revisi PM, menggantikan Rekap): sesi yang DIHITUNG (approved) per murid
 * pada periode `lesson_date`, dengan tarif les per sesi (snapshot kotor) dan total tagihan.
 */
export const billingQuerySchema = z.object({
  period: periodSchema,
  student_id: uuidSchema.optional(),
});
export type BillingQuery = z.infer<typeof billingQuerySchema>;

export const billingLineSchema = z.object({
  session_id: uuidSchema,
  lesson_date: isoDateSchema,
  start_time: lessonTimeSchema.nullable(),
  end_time: lessonTimeSchema.nullable(),
  tutor_name: z.string(),
  subject_name: z.string(),
  duration_minutes: z.number().int(),
  /** Tarif les sesi ini (subtotal per sesi). */
  amount: moneyStringSchema,
});
export type BillingLine = z.infer<typeof billingLineSchema>;

export const billingStudentSchema = z.object({
  student_id: uuidSchema,
  student_name: z.string(),
  grade: z.string(),
  school_name: z.string(),
  /** Nama orang tua/wali terhubung (untuk "Kepada" di invoice); kosong bila belum ada. */
  parent_names: z.array(z.string()),
  sessions: z.number().int().min(1),
  total_amount: moneyStringSchema,
  lines: z.array(billingLineSchema),
});
export type BillingStudent = z.infer<typeof billingStudentSchema>;

/** `GET /admin/billing?period=&student_id=`. */
export const billingResponseSchema = z.object({
  period: periodSchema,
  students: z.array(billingStudentSchema),
  total_sessions: z.number().int().min(0),
  total_amount: moneyStringSchema,
  /** Sesi dihitung tanpa tarif (kelas tidak didukung): tidak ditagih, perlu dicek Admin. */
  warnings: z.array(z.string()),
});
export type BillingResponse = z.infer<typeof billingResponseSchema>;

/** `GET /admin/billing/:student_id/invoice.pdf?period=` — query invoice satu murid. */
export const invoiceQuerySchema = z.object({ period: periodSchema });
