-- Recalculate historical admin fees for the inclusive 30-minute boundary.
-- Preserve gross snapshots and sessions without complete billing snapshots.
UPDATE lesson_sessions
SET admin_fee_snapshot = 10000 * GREATEST(1, FLOOR((duration_minutes::numeric + 30) / 60)),
    updated_at = now()
WHERE status = 'approved'
  AND rate_amount_snapshot IS NOT NULL
  AND admin_fee_snapshot IS NOT NULL
  AND admin_fee_snapshot <> 10000 * GREATEST(1, FLOOR((duration_minutes::numeric + 30) / 60));
