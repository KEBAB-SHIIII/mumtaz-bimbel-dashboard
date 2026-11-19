import { sql } from 'drizzle-orm';
import { Router } from 'express';
import type { ErrorResponse, HealthResponse } from '@mumtaz/contracts';
import type { Database } from '../db/client.js';

const READY_TIMEOUT_MS = 3_000;

/**
 * `GET /health` = liveness (proses hidup; tanpa DB/session agar murah untuk probe).
 * `GET /health/ready` = readiness: database dapat di-query. Platform deploy memakai ini untuk
 * menahan traffic sampai koneksi Neon siap, dan mengeluarkan instance bila DB tidak terjangkau.
 */
export function healthRouter(db: Database) {
  const router = Router();

  router.get('/health', (_req, res) => {
    const body: HealthResponse = { status: 'ok' };
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.get('/health/ready', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        db.execute(sql`select 1`),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), READY_TIMEOUT_MS);
        }),
      ]);
      const body: HealthResponse = { status: 'ok' };
      res.json(body);
    } catch {
      const body: ErrorResponse = { error: { code: 'INTEGRATION_UNAVAILABLE', message: 'Database belum siap' } };
      res.status(503).json(body);
    } finally {
      clearTimeout(timer);
    }
  });

  return router;
}
