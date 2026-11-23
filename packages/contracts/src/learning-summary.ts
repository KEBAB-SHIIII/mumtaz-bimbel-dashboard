import { z } from 'zod';
import { MAX_SUBJECTS_PER_SESSION } from './attendance.js';
import { isoDateSchema, timestampSchema, uuidSchema } from './common.js';
import { periodSchema } from './period.js';

export const LEARNING_SUMMARY_SCOPES = ['session', 'monthly'] as const;
export const learningSummaryScopeSchema = z.enum(LEARNING_SUMMARY_SCOPES);
export type LearningSummaryScope = z.infer<typeof learningSummaryScopeSchema>;

export const LEARNING_SUMMARY_STATUSES = ['very_good', 'good', 'needs_attention'] as const;
export const learningSummaryStatusSchema = z.enum(LEARNING_SUMMARY_STATUSES);
export type LearningSummaryStatus = z.infer<typeof learningSummaryStatusSchema>;

export const learningSummarySubjectHighlightSchema = z.strictObject({
  subject_name: z.string().trim().min(1).max(80),
  highlight: z.string().trim().min(1).max(240),
});
export type LearningSummarySubjectHighlight = z.infer<
  typeof learningSummarySubjectHighlightSchema
>;

/**
 * Payload sesi untuk endpoint AI `POST /v1/learning-summary/summarize`.
 * Sengaja tidak menyertakan PII (nama murid, nama tutor, sekolah, ID internal, admin_note).
 */
export const learningSummaryAiSessionInputSchema = z.strictObject({
  lesson_date: isoDateSchema,
  subjects: z.array(z.string().trim().min(1).max(80)).min(1).max(MAX_SUBJECTS_PER_SESSION),
  duration_minutes: z.number().int().positive(),
  learning_material: z.string().min(1),
  learning_notes: z.string().nullable(),
});
export type LearningSummaryAiSessionInput = z.infer<typeof learningSummaryAiSessionInputSchema>;

export const learningSummaryAiRequestSchema = z
  .strictObject({
    scope: learningSummaryScopeSchema,
    period: periodSchema,
    student_grade: z.string().trim().min(1).max(60),
    sessions: z.array(learningSummaryAiSessionInputSchema).min(1).max(100),
  })
  .superRefine((data, ctx) => {
    if (data.scope === 'session' && data.sessions.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['sessions'],
        message: 'Scope session wajib mengirim tepat 1 sesi',
      });
    }
  });
export type LearningSummaryAiRequest = z.infer<typeof learningSummaryAiRequestSchema>;

/**
 * Kontrak response dari service AI FastAPI (`POST /v1/learning-summary/summarize`).
 * Tanpa `parent_tips` sesuai keputusan final produk.
 */
export const learningSummaryAiResponseSchema = z.strictObject({
  overall_status: learningSummaryStatusSchema,
  summary: z.string().trim().min(1).max(1000),
  strengths: z.array(z.string().trim().min(1).max(240)).max(5),
  areas_to_improve: z.array(z.string().trim().min(1).max(240)).max(5),
  subjects_covered: z.array(learningSummarySubjectHighlightSchema).max(15),
  model: z.string().trim().min(1).max(80).nullable().optional(),
});
export type LearningSummaryAiResponse = z.infer<typeof learningSummaryAiResponseSchema>;

/**
 * Ringkasan yang diekspos ke Orang Tua melalui API dashboard.
 * Field internal (`provider`, `model`, `source_fingerprint`) tidak pernah diekspos.
 */
export const learningSummaryViewSchema = z.strictObject({
  overall_status: learningSummaryStatusSchema,
  summary: z.string(),
  strengths: z.array(z.string()),
  areas_to_improve: z.array(z.string()),
  subjects_covered: z.array(learningSummarySubjectHighlightSchema),
  generated_at: timestampSchema,
  is_stale: z.boolean(),
});
export type LearningSummaryView = z.infer<typeof learningSummaryViewSchema>;

export const parentLearningSummariesResponseSchema = z.strictObject({
  student_id: uuidSchema,
  period: periodSchema,
  approved_session_count: z.number().int().min(0),
  monthly: learningSummaryViewSchema.nullable(),
  sessions: z.record(uuidSchema, learningSummaryViewSchema),
});
export type ParentLearningSummariesResponse = z.infer<
  typeof parentLearningSummariesResponseSchema
>;

export const generateMonthlySummaryRequestSchema = z.strictObject({
  period: periodSchema,
});
export type GenerateMonthlySummaryRequest = z.infer<typeof generateMonthlySummaryRequestSchema>;

export const generateMonthlySummaryResponseSchema = z.strictObject({
  summary: learningSummaryViewSchema,
  cached: z.boolean(),
});
export type GenerateMonthlySummaryResponse = z.infer<typeof generateMonthlySummaryResponseSchema>;

export const generateSessionSummaryResponseSchema = z.strictObject({
  lesson_session_id: uuidSchema,
  summary: learningSummaryViewSchema,
  cached: z.boolean(),
});
export type GenerateSessionSummaryResponse = z.infer<typeof generateSessionSummaryResponseSchema>;
