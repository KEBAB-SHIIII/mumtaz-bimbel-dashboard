import type { Env } from '../../config/env.js';
import { GeminiAnomalyDetector, createGeminiClient } from './gemini-detector.js';
import type { AnomalyDetector } from './types.js';

/**
 * Detektor live hanya aktif bila `GEMINI_API_KEY` dan `GEMINI_MODEL` diisi.
 * Tanpa itu → `null`, dan service menandai sesi `not_evaluated` (bukan fake success).
 */
export function createAnomalyDetector(env: Env): AnomalyDetector | null {
  if (!env.GEMINI_API_KEY || !env.GEMINI_MODEL) return null;
  return new GeminiAnomalyDetector({
    model: env.GEMINI_MODEL,
    client: createGeminiClient(env.GEMINI_API_KEY, env.ANOMALY_PROVIDER_TIMEOUT_MS),
  });
}
