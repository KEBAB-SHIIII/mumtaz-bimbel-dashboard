import { z } from 'zod';
import { requiredText, timestampSchema, uuidSchema } from './common.js';
import {
  anomalyAnalysisStatusSchema,
  anomalyReviewDecisionSchema,
  anomalyReviewStatusSchema,
  findingSeveritySchema,
  findingTypeSchema,
} from './enums.js';

/**
 * Item hasil normalisasi anomaly service (docs/05 §6.1), bukan raw output model.
 * Hanya item `is_anomaly=true` yang disimpan sebagai `anomaly_flags`.
 */
export const anomalyFindingCandidateSchema = z.object({
  lesson_session_id: uuidSchema,
  related_lesson_session_id: uuidSchema.nullable(),
  is_anomaly: z.boolean(),
  finding_type: findingTypeSchema,
  severity: findingSeveritySchema,
  reason: z.string().min(1),
  evidence_summary: z.string().nullable(),
  /** Rekomendasi UI saja; tidak pernah dieksekusi otomatis. */
  suggested_action: z.string().min(1),
});
export type AnomalyFindingCandidate = z.infer<typeof anomalyFindingCandidateSchema>;

/** Status analisis yang dapat dihasilkan service (bukan `pending`). */
export const anomalyAnalysisOutcomeSchema = anomalyAnalysisStatusSchema.exclude(['pending']);
export type AnomalyAnalysisOutcome = z.infer<typeof anomalyAnalysisOutcomeSchema>;

export const anomalyAnalysisResultSchema = z.object({
  findings: z.array(anomalyFindingCandidateSchema),
  analysis_status: anomalyAnalysisOutcomeSchema,
  notice: z.string().optional(),
});
export type AnomalyAnalysisResult = z.infer<typeof anomalyAnalysisResultSchema>;

/** Finding tersimpan (`anomaly_flags`) untuk tampilan Admin. */
export const anomalyFindingSchema = z.object({
  id: uuidSchema,
  lesson_session_id: uuidSchema,
  related_lesson_session_id: uuidSchema.nullable(),
  finding_type: findingTypeSchema,
  severity: findingSeveritySchema,
  reason: z.string(),
  evidence_summary: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  review_status: anomalyReviewStatusSchema,
  reviewed_by_user_id: uuidSchema.nullable(),
  reviewed_at: timestampSchema.nullable(),
  review_note: z.string().nullable(),
  created_at: timestampSchema,
});
export type AnomalyFinding = z.infer<typeof anomalyFindingSchema>;

/** `PATCH /admin/anomalies/:id/review`. Tidak mengubah status sesi. */
export const anomalyReviewRequestSchema = z.strictObject({
  review_status: anomalyReviewDecisionSchema,
  review_note: requiredText(5000),
});
export type AnomalyReviewRequest = z.infer<typeof anomalyReviewRequestSchema>;
