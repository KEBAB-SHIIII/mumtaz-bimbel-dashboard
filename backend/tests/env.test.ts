import { describe, expect, it } from 'vitest';
import { EnvValidationError, integrationStatus, parseEnv } from '../src/config/env.js';
import { buildSessionConfig } from '../src/config/session.js';
import { makeTestEnv, testEnvSource } from './test-env.js';

/** Konfigurasi production minimal yang valid (nilai sintetis). */
const PRODUCTION_OK = {
  NODE_ENV: 'production',
  FRONTEND_ORIGIN: 'https://bimbel.example',
  DATABASE_URL: 'postgresql://u:p@db.example/neondb?sslmode=verify-full',
  SESSION_SECRET: 'a'.repeat(40),
  PARENT_ACCESS_CODE_PEPPER: 'b'.repeat(40),
};

describe('parseEnv', () => {
  it('menerapkan default teknis dari .env.example', () => {
    const env = makeTestEnv();

    expect(env.PORT).toBe(3001);
    expect(env.API_PREFIX).toBe('/api/v1');
    expect(env.SESSION_IDLE_TIMEOUT_MINUTES).toBe(480);
    expect(env.AUTH_RATE_LIMIT_MAX).toBe(5);
    expect(env.AUTH_RATE_LIMIT_WINDOW_MINUTES).toBe(15);
    expect(env.ANOMALY_DURATION_OUTLIER_MINUTES).toBe(180);
    expect(env.GOOGLE_SHEETS_EXPORT_ENABLED).toBe(false);
  });

  it('menolak variabel wajib yang hilang tanpa mencetak nilai lain', () => {
    const { DATABASE_URL: _omit, ...rest } = testEnvSource;

    expect(() => parseEnv(rest)).toThrow(EnvValidationError);
    try {
      parseEnv(rest);
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('DATABASE_URL');
      expect(message).not.toContain(testEnvSource.SESSION_SECRET);
    }
  });

  it('menolak DATABASE_URL non-PostgreSQL', () => {
    expect(() => makeTestEnv({ DATABASE_URL: 'mysql://x@localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('mewajibkan SESSION_SECRET dan PARENT_ACCESS_CODE_PEPPER berbeda', () => {
    expect(() =>
      makeTestEnv({ PARENT_ACCESS_CODE_PEPPER: testEnvSource.SESSION_SECRET }),
    ).toThrow(/PARENT_ACCESS_CODE_PEPPER/);
  });

  it('mewajibkan spreadsheet ID dan key file bila ekspor Sheets diaktifkan', () => {
    expect(() => makeTestEnv({ GOOGLE_SHEETS_EXPORT_ENABLED: 'true' })).toThrow(
      /GOOGLE_SHEETS_SPREADSHEET_ID/,
    );
  });

  it('menolak secret placeholder/pendek di production', () => {
    expect(() =>
      makeTestEnv({
        NODE_ENV: 'production',
        SESSION_SECRET: 'replace_with_random_secret_string',
      }),
    ).toThrow(/SESSION_SECRET/);
  });

  it('production menolak origin HTTP, DB tanpa TLS, dan password Admin lemah; konfigurasi benar diterima', () => {
    expect(() => makeTestEnv({ ...PRODUCTION_OK, FRONTEND_ORIGIN: 'http://bimbel.example' })).toThrow(/FRONTEND_ORIGIN/);
    // Satu mode production: laptop owner memakai http://localhost.
    expect(makeTestEnv({ ...PRODUCTION_OK, FRONTEND_ORIGIN: 'http://localhost:3001' }).NODE_ENV).toBe('production');
    expect(makeTestEnv({ ...PRODUCTION_OK, FRONTEND_ORIGIN: 'http://127.0.0.1:3001' }).NODE_ENV).toBe('production');
    expect(() => makeTestEnv({ ...PRODUCTION_OK, DATABASE_URL: 'postgresql://u:p@db.example/neondb' })).toThrow(/DATABASE_URL/);
    expect(() => makeTestEnv({ ...PRODUCTION_OK, BOOTSTRAP_ADMIN_PASSWORD: 'pendek' })).toThrow(/BOOTSTRAP_ADMIN_PASSWORD/);
    expect(() => makeTestEnv({ ...PRODUCTION_OK, SEED_TUTOR_PASSWORD: 'x'.repeat(20) })).toThrow(/SEED_TUTOR_PASSWORD/);
    const env = makeTestEnv({ ...PRODUCTION_OK, BOOTSTRAP_ADMIN_PASSWORD: 'p'.repeat(16) });
    expect(env.NODE_ENV).toBe('production');
  });

  it('TRUST_PROXY default 0 (X-Forwarded-For tidak dipercaya) dan FRONTEND_ORIGIN dinormalisasi', () => {
    const env = makeTestEnv({ FRONTEND_ORIGIN: 'http://localhost:5173/' });
    expect(env.TRUST_PROXY).toBe(0);
    expect(env.FRONTEND_ORIGIN).toBe('http://localhost:5173');
    expect(makeTestEnv({ TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
    expect(() => makeTestEnv({ TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
  });

  it('memperlakukan nilai kosong sebagai tidak diset', () => {
    const env = makeTestEnv({ GEMINI_API_KEY: '', DATABASE_MIGRATION_URL: '' });
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.DATABASE_MIGRATION_URL).toBeUndefined();
  });
});

describe('integrationStatus', () => {
  it('tidak melaporkan integrasi aktif bila credential belum ada', () => {
    expect(integrationStatus(makeTestEnv())).toEqual({
      googleSheetsExport: 'disabled',
      anomalyProvider: 'not_configured',
    });
  });
});

describe('buildSessionConfig', () => {
  it('memakai cookie HttpOnly + SameSite=Lax, Secure mengikuti protokol origin (bukan NODE_ENV)', () => {
    const dev = buildSessionConfig(makeTestEnv());
    expect(dev.cookie).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: false });
    expect(dev.cookie.maxAge).toBe(480 * 60 * 1000);
    expect(dev.tableName).toBe('app_sessions');
    expect(dev.saveUninitialized).toBe(false);

    const prod = buildSessionConfig(
      makeTestEnv({ ...PRODUCTION_OK }),
    );
    expect(prod.cookie.secure).toBe(true);
    const localProd = buildSessionConfig(makeTestEnv({ ...PRODUCTION_OK, FRONTEND_ORIGIN: 'http://localhost:3001' }));
    expect(localProd.cookie.secure).toBe(false);
  });
});
