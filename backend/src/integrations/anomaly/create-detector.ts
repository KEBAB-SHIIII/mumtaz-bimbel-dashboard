import type { Env } from '../../config/env.js';
import { HttpAnomalyDetector } from './http-detector.js';
import type { AnomalyDetector } from './types.js';

/**
 * Factory detektor anomali aktif berdasarkan `.env`:
 * - `ANOMALY_SERVICE_URL` diisi → `HttpAnomalyDetector` (model ML FastAPI).
 * - Kosong → `null`, sehingga sesi ditandai `not_evaluated` (tanpa fake success).
 */
export function createAnomalyDetector(env: Env): AnomalyDetector | null {
  if (!env.ANOMALY_SERVICE_URL) return null;
  return new HttpAnomalyDetector({
    baseUrl: env.ANOMALY_SERVICE_URL,
    model: env.ANOMALY_MODEL_NAME ?? 'anomaly-lgbm-v1',
  });
}
