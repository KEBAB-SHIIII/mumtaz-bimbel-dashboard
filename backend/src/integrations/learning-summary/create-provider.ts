import type { Env } from '../../config/env.js';
import { HttpLearningSummaryProvider } from './http-provider.js';
import type { LearningSummaryProvider } from './types.js';

/**
 * Factory provider Generative AI dari environment.
 * Mengembalikan `null` bila `LEARNING_SUMMARY_SERVICE_URL` belum dikonfigurasi
 * (tidak ada fake success di production).
 */
export function createLearningSummaryProvider(env: Env): LearningSummaryProvider | null {
  if (!env.LEARNING_SUMMARY_SERVICE_URL) return null;
  return new HttpLearningSummaryProvider({
    baseUrl: env.LEARNING_SUMMARY_SERVICE_URL,
    model: env.LEARNING_SUMMARY_MODEL_NAME ?? null,
  });
}
