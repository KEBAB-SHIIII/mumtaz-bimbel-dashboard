import type { Env } from '../../config/env.js';
import { GeminiAnomalyDetector, createGeminiClient } from './gemini-detector.js';
import { HttpAnomalyDetector } from './http-detector.js';
import type { AnomalyDetector } from './types.js';

/**
 * Factory pemilihan detektor anomali aktif berdasarkan `.env`:
 * 1. Jika `ANOMALY_SERVICE_URL` diisi → pakai `HttpAnomalyDetector` (model ML FastAPI milik sendiri).
 * 2. Jika kosong, fallback ke `GeminiAnomalyDetector` bila `GEMINI_API_KEY` & `GEMINI_MODEL` diisi.
 * 3. Jika keduanya kosong → `null`, sehingga sesi ditandai `not_evaluated` (tanpa fake success).
 */
export function createAnomalyDetector(env: Env): AnomalyDetector | null {
  if (env.ANOMALY_SERVICE_URL) {
    return new HttpAnomalyDetector({
      baseUrl: env.ANOMALY_SERVICE_URL,
      model: env.ANOMALY_MODEL_NAME ?? 'anomaly-lgbm-v1',
    });
  }
  if (!env.GEMINI_API_KEY || !env.GEMINI_MODEL) return null;
  return new GeminiAnomalyDetector({
    model: env.GEMINI_MODEL,
    client: createGeminiClient(env.GEMINI_API_KEY, env.ANOMALY_PROVIDER_TIMEOUT_MS),
  });
}
