import { and, eq, ne } from 'drizzle-orm';
import type { AnomalyFinding, AnomalyReviewRequest } from '@mumtaz/contracts';
import { anomalyFlags } from '../../db/schema.js';
import { HttpError, notFound } from '../../lib/http-error.js';
import type { ServiceContext } from '../context.js';
import { toFinding } from './finding-mapper.js';

/**
 * `PATCH /admin/anomalies/:id/review`. Hanya mencatat hasil review temuan;
 * TIDAK mengubah status sesi atau honor (keputusan sesi lewat endpoint absensi).
 * Temuan `superseded` (payload lama yang sudah direvisi) tidak dapat direview.
 */
export async function reviewFinding(
  ctx: ServiceContext,
  adminUserId: string,
  findingId: string,
  input: AnomalyReviewRequest,
): Promise<AnomalyFinding> {
  const [updated] = await ctx.db
    .update(anomalyFlags)
    .set({
      review_status: input.review_status,
      review_note: input.review_note,
      reviewed_by_user_id: adminUserId,
      reviewed_at: ctx.now(),
    })
    .where(and(eq(anomalyFlags.id, findingId), ne(anomalyFlags.review_status, 'superseded')))
    .returning();
  if (updated) return toFinding(updated);

  const [existing] = await ctx.db.select({ id: anomalyFlags.id }).from(anomalyFlags).where(eq(anomalyFlags.id, findingId)).limit(1);
  if (!existing) throw notFound('Temuan anomali');
  throw new HttpError(409, 'SESSION_STATE_CONFLICT', 'Temuan sudah digantikan oleh revisi sesi dan tidak dapat direview');
}
