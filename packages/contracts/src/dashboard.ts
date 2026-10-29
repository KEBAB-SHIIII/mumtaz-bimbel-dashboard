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
  is_demo_assumption: z.boolean(),
  demo_label: z.string().nullable(),
});

/** `GET /admin/dashboard/summary`. */
export const adminDashboardSummarySchema = z.object({
  period: periodSchema,
  active_tutors: z.number().int().min(0),
  active_students: z.number().int().min(0),
  total_sessions: z.number().int().min(0),
  status_counts: sessionStatusCountsSchema,
  anomaly_findings_pending_review: z.number().int().min(0),
  honor: honorEstimateSchema,
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
