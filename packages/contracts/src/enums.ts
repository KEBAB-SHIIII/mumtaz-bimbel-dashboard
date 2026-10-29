import { z } from 'zod';

export const roleSchema = z.enum(['admin', 'tutor', 'parent']);
export type Role = z.infer<typeof roleSchema>;

/** `lesson_sessions.status` — docs/05 §5. */
export const sessionStatusSchema = z.enum(['pending', 'approved', 'revision_requested', 'rejected']);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

/** Keputusan Admin atas sesi `pending`. */
export const sessionDecisionSchema = z.enum(['approved', 'revision_requested', 'rejected']);
export type SessionDecision = z.infer<typeof sessionDecisionSchema>;

/** `lesson_sessions.anomaly_analysis_status` — status proses agregat yang otoritatif. */
export const anomalyAnalysisStatusSchema = z.enum(['pending', 'completed', 'failed', 'not_evaluated']);
export type AnomalyAnalysisStatus = z.infer<typeof anomalyAnalysisStatusSchema>;

export const findingTypeSchema = z.enum(['suspected_duplicate', 'duration_outlier', 'unusual_pattern']);
export type FindingType = z.infer<typeof findingTypeSchema>;

/** Label prioritas review, bukan kepastian kecurangan. */
export const findingSeveritySchema = z.enum(['low', 'medium', 'high']);
export type FindingSeverity = z.infer<typeof findingSeveritySchema>;

/** `anomaly_flags.review_status`; `superseded` hanya ditetapkan sistem. */
export const anomalyReviewStatusSchema = z.enum([
  'pending_review',
  'confirmed_anomaly',
  'false_positive',
  'resolved',
  'superseded',
]);
export type AnomalyReviewStatus = z.infer<typeof anomalyReviewStatusSchema>;

/** Nilai yang boleh dikirim Admin (tanpa `pending_review`/`superseded`). */
export const anomalyReviewDecisionSchema = z.enum(['confirmed_anomaly', 'false_positive', 'resolved']);
export type AnomalyReviewDecision = z.infer<typeof anomalyReviewDecisionSchema>;

export const SUPERSEDED_BY_REVISION_NOTE = 'superseded_by_revision';

/** MVP hanya `per_session` (docs/14 §3.7). */
export const rateTypeSchema = z.enum(['per_session']);
export type RateType = z.infer<typeof rateTypeSchema>;

export const exportRunStatusSchema = z.enum(['running', 'succeeded', 'failed']);
export type ExportRunStatus = z.infer<typeof exportRunStatusSchema>;

export const reportTypeSchema = z.enum(['attendance']);
export type ReportType = z.infer<typeof reportTypeSchema>;
