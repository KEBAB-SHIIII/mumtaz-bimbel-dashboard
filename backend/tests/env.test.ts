import { describe, expect, it } from 'vitest';
import { EnvValidationError, integrationStatus, parseEnv } from '../src/config/env.js';
import { buildSessionConfig } from '../src/config/session.js';
import { makeTestEnv, testEnvSource } from './test-env.js';

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
  it('memakai cookie HttpOnly + SameSite=Lax, Secure hanya di production', () => {
    const dev = buildSessionConfig(makeTestEnv());
    expect(dev.cookie).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: false });
    expect(dev.cookie.maxAge).toBe(480 * 60 * 1000);
    expect(dev.tableName).toBe('app_sessions');
    expect(dev.saveUninitialized).toBe(false);

    const prod = buildSessionConfig(
      makeTestEnv({
        NODE_ENV: 'production',
        SESSION_SECRET: 'a'.repeat(40),
        PARENT_ACCESS_CODE_PEPPER: 'b'.repeat(40),
      }),
    );
    expect(prod.cookie.secure).toBe(true);
  });
});
