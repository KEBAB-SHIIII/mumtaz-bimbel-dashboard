import { parseEnv, type Env } from '../src/config/env.js';

/** Environment sintetis untuk test; tidak membaca `.env` dan tidak berisi credential nyata. */
export const testEnvSource = {
  NODE_ENV: 'test',
  FRONTEND_ORIGIN: 'http://localhost:5173',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/mumtaz_test',
  SESSION_SECRET: 'test-session-secret',
  PARENT_ACCESS_CODE_PEPPER: 'test-parent-pepper',
} satisfies Record<string, string>;

export function makeTestEnv(overrides: Record<string, string | undefined> = {}): Env {
  return parseEnv({ ...testEnvSource, ...overrides });
}
