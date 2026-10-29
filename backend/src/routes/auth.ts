import { Router } from 'express';
import {
  loginRequestSchema,
  parentAccessRequestSchema,
  type CsrfResponse,
  type LoginResponse,
  type MeResponse,
} from '@mumtaz/contracts';
import { newCsrfToken } from '../auth/csrf.js';
import { authOf, requireRole } from '../auth/middleware.js';
import type { AuthRateLimiters } from '../auth/rate-limit.js';
import { destroySession, establishSession, saveSession } from '../auth/session-helpers.js';
import type { SessionConfig } from '../config/session.js';
import { parseInput } from '../lib/validation.js';
import { authenticateParent, authenticateStaff, getAuthUser } from '../services/auth-service.js';
import type { ServiceContext } from '../services/context.js';

export function authRouter(ctx: ServiceContext, limiters: AuthRateLimiters, sessionConfig: SessionConfig) {
  const router = Router();

  /** Bootstrap synchronizer token; membuat session anonim bila belum ada. */
  router.get('/auth/csrf', async (req, res) => {
    req.session.csrfToken ??= newCsrfToken();
    await saveSession(req);
    const body: CsrfResponse = { csrf_token: req.session.csrfToken };
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.post('/auth/login', ...limiters.login, async (req, res) => {
    const input = parseInput(loginRequestSchema, req.body);
    const identity = await authenticateStaff(ctx, input);
    const csrfToken = await establishSession(req, identity);
    const body: LoginResponse = { user: identity.user, csrf_token: csrfToken };
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.post('/auth/parent-access', ...limiters.parentAccess, async (req, res) => {
    const input = parseInput(parentAccessRequestSchema, req.body);
    const identity = await authenticateParent(ctx, input.access_code);
    const csrfToken = await establishSession(req, identity);
    const body: LoginResponse = { user: identity.user, csrf_token: csrfToken };
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.post('/auth/logout', requireRole('admin', 'tutor', 'parent'), async (req, res) => {
    await destroySession(req);
    const { maxAge: _maxAge, ...cookieOptions } = sessionConfig.cookie;
    res.clearCookie(sessionConfig.name, cookieOptions).status(204).end();
  });

  router.get('/auth/me', requireRole('admin', 'tutor', 'parent'), async (req, res) => {
    const body: MeResponse = { user: await getAuthUser(ctx, authOf(req).userId) };
    res.set('Cache-Control', 'no-store').json(body);
  });

  return router;
}
