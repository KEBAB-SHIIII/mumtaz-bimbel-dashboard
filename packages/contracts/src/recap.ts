import { z } from 'zod';
import { uuidSchema } from './common.js';
import { periodSchema } from './period.js';

export const recapGroupBySchema = z.enum(['tutor', 'student', 'subject']);
export type RecapGroupBy = z.infer<typeof recapGroupBySchema>;

export const recapQuerySchema = z.object({
  period: periodSchema,
  group_by: recapGroupBySchema.default('tutor'),
});
export type RecapQuery = z.infer<typeof recapQuerySchema>;

export const recapGroupSchema = z.object({
  key_id: uuidSchema,
  key_label: z.string(),
  total_sessions: z.number().int().min(0),
  approved_sessions: z.number().int().min(0),
  pending_sessions: z.number().int().min(0),
  revision_requested_sessions: z.number().int().min(0),
  rejected_sessions: z.number().int().min(0),
  approved_duration_minutes: z.number().int().min(0),
  session_ids: z.array(uuidSchema),
});
export type RecapGroup = z.infer<typeof recapGroupSchema>;

/** `GET /admin/recap`. */
export const recapResponseSchema = z.object({
  period: periodSchema,
  group_by: recapGroupBySchema,
  groups: z.array(recapGroupSchema),
});
export type RecapResponse = z.infer<typeof recapResponseSchema>;
