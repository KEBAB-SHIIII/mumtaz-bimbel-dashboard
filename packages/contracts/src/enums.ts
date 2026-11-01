import { z } from 'zod';

export const roleSchema = z.enum(['admin', 'tutor', 'parent']);
export type Role = z.infer<typeof roleSchema>;

/** `lesson_sessions.status` — docs/05 §5. */
export const sessionStatusSchema = z.enum(['pending', 'approved', 'revision_requested', 'rejected']);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

/**
 * Validitas data sesi (revisi PM, Stand Up #6) — dilabeli AI, dapat dikoreksi Admin:
 * - `valid`: tidak ada masalah → langsung dihitung (honor & tagihan);
 * - `needs_revision`: durasi > 180 menit atau mulai setelah 21.00 → ditahan; Tutor dapat mengedit,
 *   Admin memutuskan lewat status approval;
 * - `rejected`: data duplikat → ditahan; Tutor tidak dapat mengedit, Admin dapat menghapus.
 */
export const sessionValiditySchema = z.enum(['valid', 'needs_revision', 'rejected']);
export type SessionValidity = z.infer<typeof sessionValiditySchema>;

/** Status approval, hanya untuk sesi `needs_revision`; dipilih manual oleh Admin (hasil banding via WA). */
export const approvalStatusSchema = z.enum(['pending', 'approved', 'rejected']);
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

/**
 * Status efektif (`lesson_sessions.status`) dari validitas + approval. Hanya `approved` yang dihitung.
 * valid → approved; rejected → rejected; needs_revision → menurut approval.
 */
export function sessionStatusFor(validity: SessionValidity, approval: ApprovalStatus = 'pending'): SessionStatus {
  if (validity === 'valid') return 'approved';
  if (validity === 'rejected') return 'rejected';
  return approval === 'approved' ? 'approved' : approval === 'rejected' ? 'rejected' : 'revision_requested';
}

/** Kebalikan `sessionStatusFor` untuk sesi `needs_revision`; `null` untuk validitas lain. */
export function approvalStatusOf(validity: SessionValidity | null, status: SessionStatus): ApprovalStatus | null {
  if (validity !== 'needs_revision') return null;
  return status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending';
}

/** `lesson_sessions.anomaly_analysis_status` — status proses agregat yang otoritatif. */
export const anomalyAnalysisStatusSchema = z.enum(['pending', 'completed', 'failed', 'not_evaluated']);
export type AnomalyAnalysisStatus = z.infer<typeof anomalyAnalysisStatusSchema>;

export const findingTypeSchema = z.enum(['suspected_duplicate', 'duration_outlier', 'late_start', 'unusual_pattern']);
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


export const SUPERSEDED_BY_REVISION_NOTE = 'superseded_by_revision';

export const exportRunStatusSchema = z.enum(['running', 'succeeded', 'failed']);
export type ExportRunStatus = z.infer<typeof exportRunStatusSchema>;

export const reportTypeSchema = z.enum(['attendance']);
export type ReportType = z.infer<typeof reportTypeSchema>;
