import {
  learningSummaryAiRequestSchema,
  learningSummaryAiResponseSchema,
  type LearningSummaryAiRequest,
  type LearningSummaryAiResponse,
} from '@mumtaz/contracts';
import { LearningSummaryProviderError, type LearningSummaryProvider } from './types.js';

export interface HttpLearningSummaryProviderOptions {
  /** URL dasar service FastAPI (mis. `http://localhost:8000`). */
  baseUrl: string;
  /** Nama model fallback bila service AI tidak mengembalikan field `model`. */
  model: string | null;
  /** Opsional: injeksi fungsi `fetch` untuk unit test offline. */
  fetchFn?: typeof fetch;
}

/**
 * Adapter HTTP untuk endpoint Generative AI FastAPI (`POST /v1/learning-summary/summarize`).
 * Memvalidasi payload keluar & response masuk dengan Zod (zero-PII, tanpa `parent_tips`).
 */
export class HttpLearningSummaryProvider implements LearningSummaryProvider {
  readonly provider = 'genai_fastapi';
  readonly model: string | null;
  private readonly summarizeUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor({
    baseUrl,
    model,
    fetchFn = globalThis.fetch,
  }: HttpLearningSummaryProviderOptions) {
    this.summarizeUrl = `${baseUrl.replace(/\/+$/, '')}/v1/learning-summary/summarize`;
    this.model = model;
    this.fetchFn = fetchFn;
  }

  async summarize(
    input: LearningSummaryAiRequest,
    { signal }: { signal: AbortSignal },
  ): Promise<LearningSummaryAiResponse> {
    // Validasi defensif agar payload keluar selalu mematuhi kontrak zero-PII.
    const payload = learningSummaryAiRequestSchema.parse(input);

    let response: Response;
    try {
      response = await this.fetchFn(this.summarizeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      });
    } catch {
      if (signal.aborted) {
        throw new LearningSummaryProviderError(
          'Layanan ringkasan AI melebihi batas waktu',
          'timeout',
        );
      }
      throw new LearningSummaryProviderError(
        'Permintaan ke layanan ringkasan AI gagal',
        'request_failed',
      );
    }

    if (!response.ok) {
      throw new LearningSummaryProviderError(
        `Layanan ringkasan AI mengembalikan HTTP ${response.status}`,
        'request_failed',
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new LearningSummaryProviderError(
        'Response layanan ringkasan AI bukan JSON valid',
        'invalid_output',
      );
    }

    const parsed = learningSummaryAiResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new LearningSummaryProviderError(
        'Response layanan ringkasan AI tidak sesuai kontrak schema',
        'invalid_output',
      );
    }

    return parsed.data;
  }
}
