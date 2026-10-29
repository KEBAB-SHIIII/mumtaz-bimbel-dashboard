import { Router } from 'express';
import { z } from 'zod';
import { parentDashboardQuerySchema, periodQuerySchema, uuidSchema } from '@mumtaz/contracts';
import { authOf, requireRole } from '../auth/middleware.js';
import { parseInput } from '../lib/validation.js';
import type { ServiceContext } from '../services/context.js';
import { getParentDashboardSummary } from '../services/dashboard-service.js';
import { getParentProgress, listParentStudents } from '../services/parent-service.js';

const studentParamSchema = z.object({ student_id: uuidSchema });

/** Semua route `/parent/*` — role Orang Tua; akses anak selalu dicek via `parent_students`. */
export function parentRouter(ctx: ServiceContext) {
  const router = Router();
  router.use('/parent', requireRole('parent'));

  router.get('/parent/me/students', async (req, res) => {
    res.json({ items: await listParentStudents(ctx, authOf(req).userId) });
  });

  router.get('/parent/dashboard/summary', async (req, res) => {
    const { student_id, period } = parseInput(parentDashboardQuerySchema, req.query);
    res.json(await getParentDashboardSummary(ctx, authOf(req).userId, student_id, period));
  });

  router.get('/parent/students/:student_id/progress', async (req, res) => {
    const { student_id } = parseInput(studentParamSchema, req.params);
    const { period } = parseInput(periodQuerySchema, req.query);
    res.json(await getParentProgress(ctx, authOf(req).userId, student_id, period));
  });

  return router;
}
