import type { LearningSummaryAiRequest, LearningSummaryAiResponse } from '@mumtaz/contracts';

export type LearningSummaryErrorKind = 'timeout' | 'request_failed' | 'invalid_output';

/**
 * Error terkontrol dari adapter AI ringkasan belajar.
 * Pesan selalu generik agar URL internal / payload / detail upstream tidak bocor ke client atau log.
 */
export class LearningSummaryProviderError extends Error {
  readonly kind: LearningSummaryErrorKind;

  constructor(message: string, kind: LearningSummaryErrorKind) {
    super(message);
    this.name = 'LearningSummaryProviderError';
    this.kind = kind;
  }
}

export interface LearningSummaryProvider {
  readonly provider: string;
  readonly model: string | null;
  summarize(
    input: LearningSummaryAiRequest,
    options: { signal: AbortSignal },
  ): Promise<LearningSummaryAiResponse>;
}
