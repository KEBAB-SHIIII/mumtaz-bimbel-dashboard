import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';
import type { Pool } from 'pg';
import type { SessionStorePool } from '../db/client.js';
import { isHttpsOrigin, type Env } from './env.js';

/**
 * Konfigurasi session (docs/03 §2.1, docs/04 §1): cookie opaque HttpOnly,
 * SameSite=Lax, Secure bila origin HTTPS; idle timeout bergulir; store PostgreSQL
 * `app_sessions` (bukan MemoryStore).
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
      // Mengikuti protokol origin, bukan NODE_ENV: production di http://localhost tetap bisa login.
      secure: isHttpsOrigin(env.FRONTEND_ORIGIN),
      path: '/',
      maxAge: env.SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000,
    },
  };
}

const PgSessionStore = connectPgSimple(session);

/**
 * Store `connect-pg-simple` di atas tabel hasil migration (tanpa auto-create).
 * `pruneIntervalSeconds: false` mematikan timer pembersihan (dipakai di test).
 */
export function createSessionStore(
  pool: SessionStorePool,
  options: { pruneIntervalSeconds: number | false; onError?: (message: string) => void },
): session.Store {
  return new PgSessionStore({
    // connect-pg-simple hanya memakai `pool.query(text, params)`; PGlite di test memenuhi antarmuka yang sama.
    pool: pool as unknown as Pool,
    tableName: SESSION_TABLE_NAME,
    createTableIfMissing: false,
    pruneSessionInterval: options.pruneIntervalSeconds,
    errorLog: (...args: unknown[]) => options.onError?.(args.map(String).join(' ')),
  });
}
