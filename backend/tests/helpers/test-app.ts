import request from 'supertest';
import { TEST_ONLY_CREDENTIALS } from '@mumtaz/contracts/fixtures';
import { createApp } from '../../src/app.js';
import { createSessionStore } from '../../src/config/session.js';
import type { DatabaseHandle } from '../../src/db/client.js';
import { seedSyntheticData } from '../../src/db/seed.js';
import type { AnomalyQueue } from '../../src/services/anomaly/anomaly-worker.js';
import { createLogger } from '../../src/lib/logger.js';
import { makeTestEnv, testEnvSource } from '../test-env.js';
import { createTestDatabase } from './test-db.js';

export const API = '/api/v1';
export const ORIGIN = testEnvSource.FRONTEND_ORIGIN;

/** Jam tetap: semua fixture Sep–Nov 2026 berada di masa lalu. */
export const FIXED_NOW = new Date('2026-11-15T03:00:00Z');

export interface TestApp {
  app: ReturnType<typeof createApp>;
  database: DatabaseHandle;
  close(): Promise<void>;
}

export async function createTestApp(
  options: {
    seed?: boolean;
    env?: Record<string, string>;
    now?: () => Date;
    /** Factory antrean anomali (mis. worker dengan fake detector) yang memakai DB test. */
    anomalyQueue?: (database: DatabaseHandle) => AnomalyQueue;
  } = {},
): Promise<TestApp> {
  const database = await createTestDatabase();
  if (options.seed ?? true) {
    await seedSyntheticData(database.db, {
      adminPassword: TEST_ONLY_CREDENTIALS.adminPassword,
      tutorPassword: TEST_ONLY_CREDENTIALS.tutorPassword,
      parentAccessCodePepper: testEnvSource.PARENT_ACCESS_CODE_PEPPER,
    });
  }
  const env = makeTestEnv(options.env);
  const sessionStore = createSessionStore(database.sessionPool, { pruneIntervalSeconds: false });
  const app = createApp({
    env,
    db: database.db,
    sessionStore,
    logger: createLogger({ silent: true }),
    now: options.now ?? (() => FIXED_NOW),
    ...(options.anomalyQueue ? { anomalyQueue: options.anomalyQueue(database) } : {}),
  });
  return { app, database, close: () => database.close() };
}

/**
 * Client browser tiruan: cookie session persisten (agent), header Origin,
 * dan CSRF token di memory — seperti Axios client frontend.
 */
export class TestClient {
  csrf = '';
  readonly agent: ReturnType<typeof request.agent>;

  constructor(app: TestApp['app']) {
    this.agent = request.agent(app);
  }

  async init(): Promise<this> {
    const res = await this.agent.get(`${API}/auth/csrf`).expect(200);
    this.csrf = (res.body as { csrf_token: string }).csrf_token;
    return this;
  }

  get(path: string) {
    return this.agent.get(`${API}${path}`);
  }

  post(path: string, body?: object) {
    return this.withHeaders(this.agent.post(`${API}${path}`)).send(body ?? {});
  }

  patch(path: string, body?: object) {
    return this.withHeaders(this.agent.patch(`${API}${path}`)).send(body ?? {});
  }

  private withHeaders(req: request.Test) {
    return req.set('Origin', ORIGIN).set('X-CSRF-Token', this.csrf);
  }

  /** Login dan pakai CSRF token baru dari session terautentikasi. */
  async login(username: string, password: string): Promise<this> {
    await this.init();
    const res = await this.post('/auth/login', { username, password }).expect(200);
    this.csrf = (res.body as { csrf_token: string }).csrf_token;
    return this;
  }

  async loginParent(accessCode: string): Promise<this> {
    await this.init();
    const res = await this.post('/auth/parent-access', { access_code: accessCode }).expect(200);
    this.csrf = (res.body as { csrf_token: string }).csrf_token;
    return this;
  }
}

export const as = {
  admin: (app: TestApp['app']) =>
    new TestClient(app).login(TEST_ONLY_CREDENTIALS.adminUsername, TEST_ONLY_CREDENTIALS.adminPassword),
  tutorA: (app: TestApp['app']) => new TestClient(app).login('farhan', TEST_ONLY_CREDENTIALS.tutorPassword),
  tutorB: (app: TestApp['app']) => new TestClient(app).login('noreen', TEST_ONLY_CREDENTIALS.tutorPassword),
  parentA: (app: TestApp['app']) => new TestClient(app).loginParent('MUMTAZ-DEMO-PARENT-ACCESS-ONLY'),
  parentB: (app: TestApp['app']) => new TestClient(app).loginParent('MUMTAZ-DEMO-PARENT-B-ACCESS-ONLY'),
};
