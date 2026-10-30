import type { AnomalyFinding, AnomalyReviewStatus, FindingSeverity, FindingType } from '@mumtaz/contracts';
import type { anomalyFlags } from '../../db/schema.js';
import { iso, isoOrNull } from '../../lib/format.js';

/** Baris `anomaly_flags` → DTO kontrak `AnomalyFinding`. */
export function toFinding(row: typeof anomalyFlags.$inferSelect): AnomalyFinding {
  return {
    ...row,
    finding_type: row.finding_type as FindingType,
    severity: row.severity as FindingSeverity,
    review_status: row.review_status as AnomalyReviewStatus,
    reviewed_at: isoOrNull(row.reviewed_at),
    created_at: iso(row.created_at),
  };
}
