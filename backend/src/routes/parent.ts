import { listAvailablePeriods } from '../services/period-service.js';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import {
  generateMonthlySummaryRequestSchema,
  parentDashboardQuerySchema,
  periodQuerySchema,
  uuidSchema,
} from '@mumtaz/contracts';
import { authOf, requireRole } from '../auth/middleware.js';
import { createLearningSummaryRateLimiter } from '../auth/rate-limit.js';
import type { LearningSummaryProvider } from '../integrations/learning-summary/types.js';
import type { Logger } from '../lib/logger.js';
import { parseInput } from '../lib/validation.js';
import type { ServiceContext } from '../services/context.js';
import { getParentDashboardSummary } from '../services/dashboard-service.js';
import {
  generateMonthlyLearningSummary,
  generateSessionLearningSummary,
  getParentLearningSummaries,
} from '../services/learning-summary/learning-summary-service.js';
import { getParentProgress, listParentStudents } from '../services/parent-service.js';

const studentParamSchema = z.object({ student_id: uuidSchema });
const studentSessionParamSchema = z.object({
  student_id: uuidSchema,
  session_id: uuidSchema,
});

export interface ParentRouterSummaryDeps {
  provider: LearningSummaryProvider | null;
  timeoutMs: number;
  logger: Logger;
  rateLimiter?: RequestHandler;
}

/** Semua route `/parent/*` — role Orang Tua; akses anak selalu dicek via `parent_students`. */
export function parentRouter(ctx: ServiceContext, summaryDeps: ParentRouterSummaryDeps) {
  const router = Router();
  const summaryLimiter = summaryDeps.rateLimiter ?? createLearningSummaryRateLimiter();
  const serviceDeps = {
    ctx,
    provider: summaryDeps.provider,
    timeoutMs: summaryDeps.timeoutMs,
    logger: summaryDeps.logger,
  };

  router.use('/parent', requireRole('parent'));

  router.get('/parent/periods', async (req, res) => {
    res.json(await listAvailablePeriods(ctx, { parentId: authOf(req).userId }));
  });

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

  router.get('/parent/students/:student_id/summaries', async (req, res) => {
    const { student_id } = parseInput(studentParamSchema, req.params);
    const { period } = parseInput(periodQuerySchema, req.query);
    res.json(await getParentLearningSummaries(ctx, authOf(req).userId, student_id, period));
  });

  router.post(
    '/parent/students/:student_id/summaries/monthly',
    summaryLimiter,
    async (req, res) => {
      const { student_id } = parseInput(studentParamSchema, req.params);
      const { period } = parseInput(generateMonthlySummaryRequestSchema, req.body);
      res.json(await generateMonthlyLearningSummary(serviceDeps, authOf(req).userId, student_id, period));
    },
  );

  router.post(
    '/parent/students/:student_id/sessions/:session_id/summary',
    summaryLimiter,
    async (req, res) => {
      const { student_id, session_id } = parseInput(studentSessionParamSchema, req.params);
      res.json(
        await generateSessionLearningSummary(serviceDeps, authOf(req).userId, student_id, session_id),
      );
    },
  );

  return router;
}
