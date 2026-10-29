import type { Env } from './env.js';

/**
 * Baseline konfigurasi session (docs/03 §3, docs/04 §1).
 * Middleware `express-session` + store `connect-pg-simple` (tabel `app_sessions`)
 * dipasang pada Phase 03; modul ini hanya menetapkan opsi yang akan dipakai.
 */
export const SESSION_COOKIE_NAME = 'mumtaz.sid';
export const SESSION_TABLE_NAME = 'app_sessions';

export interface SessionCookieOptions {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: '/';
  maxAge: number;
}

export interface SessionConfig {
  name: string;
  tableName: string;
  secret: string;
  /** Idle timeout: expiry diperpanjang setiap request. */
  rolling: true;
  resave: false;
  saveUninitialized: false;
  cookie: SessionCookieOptions;
}

export function buildSessionConfig(env: Env): SessionConfig {
  return {
    name: SESSION_COOKIE_NAME,
    tableName: SESSION_TABLE_NAME,
    secret: env.SESSION_SECRET,
    rolling: true,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/',
      maxAge: env.SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000,
    },
  };
}
