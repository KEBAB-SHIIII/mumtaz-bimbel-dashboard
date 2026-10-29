import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { HttpError } from '../lib/http-error.js';

export const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function newCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

function tokensMatch(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

const csrfInvalid = () => new HttpError(403, 'CSRF_INVALID', 'Permintaan tidak dapat diverifikasi. Muat ulang halaman lalu coba lagi.');

/**
 * Proteksi CSRF untuk semua request mutasi (docs/04 §1):
 * 1. Origin (atau Referer bila Origin tidak ada) wajib sama dengan FRONTEND_ORIGIN.
 * 2. Header `X-CSRF-Token` wajib sama (constant-time) dengan token di server-side session.
 */
export function csrfProtection(allowedOrigin: string): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    const origin = req.get('origin');
    const referer = req.get('referer');
    const originOk = origin
      ? origin === allowedOrigin
      : referer !== undefined && (referer === allowedOrigin || referer.startsWith(`${allowedOrigin}/`));

    const expected = req.session.csrfToken;
    const actual = req.get(CSRF_HEADER);

    if (!originOk || !expected || !actual || !tokensMatch(expected, actual)) {
      next(csrfInvalid());
      return;
    }
    next();
  };
}
