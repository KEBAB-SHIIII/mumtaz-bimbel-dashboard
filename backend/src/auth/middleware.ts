import { eq } from 'drizzle-orm';
import type { Request, RequestHandler } from 'express';
import type { Role } from '@mumtaz/contracts';
import { tutors, users } from '../db/schema.js';
import { forbidden, unauthenticated } from '../lib/http-error.js';
import type { ServiceContext } from '../services/context.js';
import { destroySession } from './session-helpers.js';
import type { AuthContext } from './session-types.js';

/**
 * Memuat identitas dari server-side session dan memvalidasinya ulang ke DB
 * pada setiap request: akun nonaktif atau credential yang sudah dirotasi
 * langsung mencabut session.
 */
export function loadAuth(ctx: ServiceContext): RequestHandler {
  return async (req, _res, next) => {
    const { userId, credentialVersion } = req.session;
    if (!userId) {
      next();
      return;
    }

    const [row] = await ctx.db
      .select({
        id: users.id,
        role: users.role,
        full_name: users.full_name,
        is_active: users.is_active,
        credential_version: users.credential_version,
        tutor_id: tutors.id,
        tutor_active: tutors.is_active,
      })
      .from(users)
      .leftJoin(tutors, eq(tutors.user_id, users.id))
      .where(eq(users.id, userId))
      .limit(1);

    if (!row || !row.is_active || row.credential_version !== credentialVersion) {
      await destroySession(req);
      next();
      return;
    }

    req.auth = {
      userId: row.id,
      role: row.role as Role,
      fullName: row.full_name,
      tutorId: row.tutor_id,
      tutorActive: row.tutor_active ?? false,
    };
    next();
  };
}

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(unauthenticated());
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(forbidden());
      return;
    }
    next();
  };
}

/** Ambil AuthContext pada handler yang sudah dilindungi `requireRole`. */
export function authOf(req: Request): AuthContext {
  if (!req.auth) throw unauthenticated();
  return req.auth;
}

/** Tutor ID dari session — satu-satunya sumber identitas tutor (bukan body/query). */
export function tutorIdOf(req: Request): string {
  const auth = authOf(req);
  if (auth.role !== 'tutor' || !auth.tutorId) throw forbidden();
  return auth.tutorId;
}
