import { createHash } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { HttpError } from '../lib/http-error.js';

export interface AuthRateLimitConfig {
  max: number;
  windowMinutes: number;
}

type KeyFn = (req: Request) => string;

const clientIp = (req: Request) => ipKeyGenerator(req.ip ?? 'unknown');
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * Limiter percobaan autentikasi. Hanya request gagal (status ≥ 400) yang dihitung.
 * Store in-memory: valid untuk baseline satu instance API; scale-out membutuhkan
 * store bersama (mis. PostgreSQL/Redis).
 */
function authLimiter(config: AuthRateLimitConfig, key: KeyFn): RequestHandler {
  return rateLimit({
    windowMs: config.windowMinutes * 60 * 1000,
    limit: config.max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: key,
    handler: (_req, _res, next) => {
      next(new HttpError(429, 'RATE_LIMITED', 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.'));
    },
  });
}

const bodyField = (req: Request, field: string): string => {
  const body: unknown = req.body;
  if (typeof body === 'object' && body !== null && field in body) {
    const value = (body as Record<string, unknown>)[field];
    if (typeof value === 'string') return value.trim().toLowerCase().slice(0, 128);
  }
  return '';
};

export interface AuthRateLimiters {
  /** Login Admin/Tutor: per IP dan per username. */
  login: RequestHandler[];
  /** Akses Orang Tua: per IP (brute force mencoba kode berbeda) dan per IP+kode. */
  parentAccess: RequestHandler[];
  /** Ganti password: per akun. */
  passwordChange: RequestHandler[];
}

export function createAuthRateLimiters(config: AuthRateLimitConfig): AuthRateLimiters {
  return {
    login: [
      authLimiter(config, (req) => `login:ip:${clientIp(req)}`),
      authLimiter(config, (req) => `login:user:${bodyField(req, 'username')}`),
    ],
    parentAccess: [
      authLimiter(config, (req) => `parent:ip:${clientIp(req)}`),
      // Kode mentah tidak pernah dijadikan key (meski hanya di memori).
      authLimiter(config, (req) => `parent:code:${clientIp(req)}:${sha256(bodyField(req, 'access_code'))}`),
    ],
    passwordChange: [authLimiter(config, (req) => `password:user:${req.auth?.userId ?? clientIp(req)}`)],
  };
}
