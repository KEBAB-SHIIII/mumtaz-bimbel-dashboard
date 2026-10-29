import { z } from 'zod';

/** Envelope error seragam — docs/04 §1. */
export const errorCodeSchema = z.enum([
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'CSRF_INVALID',
  'NOT_FOUND',
  'RATE_LIMITED',
  'SESSION_STATE_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'EMPTY_EXPORT_CONFIRMATION_REQUIRED',
  'INTEGRATION_UNAVAILABLE',
  'INTERNAL_ERROR',
]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const errorResponseSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z
      .array(z.object({ field: z.string(), message: z.string() }))
      .optional(),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
