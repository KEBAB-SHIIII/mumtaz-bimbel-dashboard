import { Router } from 'express';
import {
  changePasswordRequestSchema,
  idParamSchema,
  periodQuerySchema,
  reviseAttendanceRequestSchema,
  submitAttendanceRequestSchema,
  tutorAttendanceListQuerySchema,
  type CsrfResponse,
} from '@mumtaz/contracts';
import { authOf, requireRole, tutorIdOf } from '../auth/middleware.js';
import type { AuthRateLimiters } from '../auth/rate-limit.js';
import { establishSession } from '../auth/session-helpers.js';
import { parseInput } from '../lib/validation.js';
import {
  listAttendanceOptions,
  listTutorAttendance,
  reviseAttendance,
  submitAttendance,
} from '../services/attendance/attendance-service.js';
import { changePassword } from '../services/auth-service.js';
import type { AnomalyQueue } from '../services/anomaly/anomaly-worker.js';
import type { ServiceContext } from '../services/context.js';
import { getTutorDashboardSummary } from '../services/dashboard-service.js';
import { getPayrollPreview } from '../services/payroll-service.js';

/**
 * Semua route `/tutor/*` — role Tutor saja. Identitas tutor SELALU dari session,
 * tidak pernah dari body/query.
 */
export function tutorRouter(ctx: ServiceContext, limiters: AuthRateLimiters, anomalyQueue: AnomalyQueue) {
  const router = Router();
  router.use('/tutor', requireRole('tutor'));

  router.get('/tutor/dashboard/summary', async (req, res) => {
    const { period } = parseInput(periodQuerySchema, req.query);
    res.json(await getTutorDashboardSummary(ctx, tutorIdOf(req), period));
  });

  /** Murid & mata pelajaran aktif yang dapat dipilih Tutor di Form Absensi (tanpa penugasan, D-24). */
  router.get('/tutor/attendance-options', async (_req, res) => {
    res.json(await listAttendanceOptions(ctx));
  });

  /** Submit Form Absensi → Neon `pending`. Tidak ada panggilan Google Sheets. */
  router.post('/tutor/attendance', async (req, res) => {
    const input = parseInput(submitAttendanceRequestSchema, req.body);
    const auth = authOf(req);
    const { response } = await submitAttendance(
      ctx,
      { tutorId: tutorIdOf(req), tutorActive: auth.tutorActive },
      input,
    );
    // Analisis anomali berjalan SETELAH commit; kegagalannya tidak memengaruhi submit.
    anomalyQueue.enqueue(response.session.id);
    res.status(201).json(response);
  });

  router.get('/tutor/me/attendance', async (req, res) => {
    res.json(await listTutorAttendance(ctx, tutorIdOf(req), parseInput(tutorAttendanceListQuerySchema, req.query)));
  });

  router.patch('/tutor/me/attendance/:id', async (req, res) => {
    const { id } = parseInput(idParamSchema, req.params);
    const input = parseInput(reviseAttendanceRequestSchema, req.body);
    const session = await reviseAttendance(ctx, tutorIdOf(req), id, input);
    // Payload baru → analisis ulang (no-op bila retry identik yang sudah dianalisis).
    anomalyQueue.enqueue(session.id);
    res.json({ session });
  });

  router.get('/tutor/me/payroll', async (req, res) => {
    const { period } = parseInput(periodQuerySchema, req.query);
    res.json(await getPayrollPreview(ctx, period, { tutorId: tutorIdOf(req) }));
  });

  /** Tab Profil: ganti password → session diregenerasi, session lain dicabut. */
  router.patch('/tutor/me/password', ...limiters.passwordChange, async (req, res) => {
    const input = parseInput(changePasswordRequestSchema, req.body);
    const auth = authOf(req);
    const { credentialVersion } = await changePassword(ctx, auth.userId, input);
    const csrfToken = await establishSession(req, { userId: auth.userId, role: auth.role, credentialVersion });
    const body: CsrfResponse = { csrf_token: csrfToken };
    res.set('Cache-Control', 'no-store').json(body);
  });

  return router;
}
