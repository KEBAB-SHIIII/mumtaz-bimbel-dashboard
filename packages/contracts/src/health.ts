import { z } from 'zod';

/** `GET /health` — docs/04 §2. */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
