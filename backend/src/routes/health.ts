import { Router } from 'express';
import type { HealthResponse } from '@mumtaz/contracts';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  const body: HealthResponse = { status: 'ok' };
  res.set('Cache-Control', 'no-store').json(body);
});
