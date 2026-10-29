import { count, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorResponseSchema, loginResponseSchema, meResponseSchema } from '@mumtaz/contracts';
import { TEST_ONLY_CREDENTIALS, USER_IDS } from '@mumtaz/contracts/fixtures';
import { digestParentAccessCode, generateParentAccessCode } from '../src/auth/parent-access-code.js';
import { appSessions, users } from '../src/db/schema.js';
import { API, ORIGIN, TestClient, as, createTestApp, type TestApp } from './helpers/test-app.js';
import { testEnvSource } from './test-env.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

const errorCode = (body: unknown) => errorResponseSchema.parse(body).error.code;

function sessionCookie(res: request.Response): string | undefined {
  const cookies = res.headers['set-cookie'] as unknown as string[] | undefined;
  return cookies?.find((cookie) => cookie.startsWith('mumtaz.sid='));
}

describe('CSRF bootstrap', () => {
  it('GET /auth/csrf membuat session anonim + token, no-store, cookie HttpOnly SameSite=Lax', async () => {
    const res = await request(t.app).get(`${API}/auth/csrf`).expect(200);
    expect(res.body.csrf_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.headers['cache-control']).toBe('no-store');
    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).not.toMatch(/Secure/); // Secure hanya di production
  });

  it('session disimpan di tabel app_sessions (bukan MemoryStore)', async () => {
    await new TestClient(t.app).init();
    const [row] = await t.database.db.select({ n: count() }).from(appSessions);
    expect(row?.n).toBeGreaterThan(0);
  });

  it('mutasi tanpa token CSRF → 403 CSRF_INVALID', async () => {
    const client = await new TestClient(t.app).init();
    const res = await client.agent
      .post(`${API}/auth/login`)
      .set('Origin', ORIGIN)
      .send({ username: 'admin.demo', password: TEST_ONLY_CREDENTIALS.adminPassword });
    expect(res.status).toBe(403);
    expect(errorCode(res.body)).toBe('CSRF_INVALID');
  });

  it('token salah atau Origin asing → 403 CSRF_INVALID', async () => {
    const client = await new TestClient(t.app).init();
    const wrongToken = await client.agent
      .post(`${API}/auth/login`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', 'x'.repeat(43))
      .send({ username: 'admin.demo', password: 'x' });
    expect(wrongToken.status).toBe(403);

    const foreignOrigin = await client.agent
      .post(`${API}/auth/login`)
      .set('Origin', 'https://evil.example')
      .set('X-CSRF-Token', client.csrf)
      .send({ username: 'admin.demo', password: 'x' });
    expect(foreignOrigin.status).toBe(403);
    expect(errorCode(foreignOrigin.body)).toBe('CSRF_INVALID');
  });
});

describe('login Admin/Tutor (username + password)', () => {
  it('berhasil: meregenerasi session ID dan mengganti CSRF token', async () => {
    const client = await new TestClient(t.app).init();
    const anonymousToken = client.csrf;
    const anonymousCookie = sessionCookie(await client.get('/auth/csrf'));

    const res = await client.post('/auth/login', {
      username: 'tutor-a.demo',
      password: TEST_ONLY_CREDENTIALS.tutorPassword,
    });
    expect(res.status).toBe(200);
    const body = loginResponseSchema.parse(res.body);
    expect(body.user).toMatchObject({ id: USER_IDS.tutorA, role: 'tutor', username: 'tutor-a.demo' });
    expect(body.csrf_token).not.toBe(anonymousToken);
    expect(sessionCookie(res)).toBeDefined();
    expect(sessionCookie(res)).not.toBe(anonymousCookie);
    expect(JSON.stringify(res.body)).not.toMatch(/hash|password/i);
  });

  it('username tak dikenal dan password salah → pesan generik identik (401)', async () => {
    const unknown = await (await new TestClient(t.app).init()).post('/auth/login', { username: 'tidak.ada', password: 'x' });
    const wrong = await (await new TestClient(t.app).init()).post('/auth/login', { username: 'tutor-a.demo', password: 'salah' });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it('akun parent tidak bisa login lewat /auth/login', async () => {
    const res = await (await new TestClient(t.app).init()).post('/auth/login', { username: 'parent-a', password: 'x' });
    expect(res.status).toBe(401);
  });

  it('password tersimpan sebagai hash Argon2id', async () => {
    const [row] = await t.database.db.select().from(users).where(eq(users.id, USER_IDS.tutorA));
    expect(row?.password_hash).toMatch(/^\$argon2id\$/);
  });

  it('GET /auth/me mengembalikan identitas tanpa hash; tutor menyertakan username/phone', async () => {
    const tutor = await as.tutorA(t.app);
    const res = await tutor.get('/auth/me').expect(200);
    const body = meResponseSchema.parse(res.body);
    expect(body.user).toEqual({
      id: USER_IDS.tutorA,
      full_name: 'Tutor Demo A',
      role: 'tutor',
      username: 'tutor-a.demo',
      phone: '080000000001',
    });
  });

  it('logout menghapus session; request berikutnya 401', async () => {
    const admin = await as.admin(t.app);
    await admin.post('/auth/logout').expect(204);
    const me = await admin.get('/auth/me');
    expect(me.status).toBe(401);
    expect(errorCode(me.body)).toBe('UNAUTHENTICATED');
  });
});

describe('login Orang Tua (satu ID Akses)', () => {
  it('berhasil dengan kode fixture; normalisasi huruf kecil/spasi/tanda hubung', async () => {
    const res = await (await new TestClient(t.app).init()).post('/auth/parent-access', {
      access_code: '  mumtaz demo-parent access-only ',
    });
    expect(res.status).toBe(200);
    expect(loginResponseSchema.parse(res.body).user).toEqual({
      id: USER_IDS.parentA,
      full_name: 'Orang Tua Demo A',
      role: 'parent',
    });
  });

  it('kode salah → 401 generik', async () => {
    const res = await (await new TestClient(t.app).init()).post('/auth/parent-access', { access_code: 'SALAH-1234' });
    expect(res.status).toBe(401);
    expect(errorCode(res.body)).toBe('UNAUTHENTICATED');
  });

  it('DB hanya menyimpan digest HMAC-SHA-256 (64 hex), bukan kode mentah', async () => {
    const [row] = await t.database.db.select().from(users).where(eq(users.id, USER_IDS.parentA));
    expect(row?.parent_access_code_hash).toBe(
      digestParentAccessCode('MUMTAZ-DEMO-PARENT-ACCESS-ONLY', testEnvSource.PARENT_ACCESS_CODE_PEPPER),
    );
    expect(row?.parent_access_code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain('MUMTAZ-DEMO');
  });

  it('kode baru: 128-bit base32 Crockford berkelompok, unik', () => {
    const codes = new Set(Array.from({ length: 50 }, generateParentAccessCode));
    expect(codes.size).toBe(50);
    for (const code of codes) {
      expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){6}[0-9A-HJKMNP-TV-Z]{2}$/);
    }
  });
});

describe('rate limit autentikasi', () => {
  it('percobaan gagal melebihi batas → 429 RATE_LIMITED (per username)', async () => {
    const limited = await createTestApp({ env: { AUTH_RATE_LIMIT_MAX: '3' } });
    try {
      for (let i = 0; i < 3; i += 1) {
        const res = await (await new TestClient(limited.app).init()).post('/auth/login', { username: 'tutor-b.demo', password: 'salah' });
        expect(res.status).toBe(401);
      }
      const blocked = await (await new TestClient(limited.app).init()).post('/auth/login', {
        username: 'tutor-b.demo',
        password: TEST_ONLY_CREDENTIALS.tutorPassword,
      });
      expect(blocked.status).toBe(429);
      expect(errorCode(blocked.body)).toBe('RATE_LIMITED');
    } finally {
      await limited.close();
    }
  });

  it('parent-access dibatasi per IP walau kode berbeda-beda', async () => {
    const limited = await createTestApp({ env: { AUTH_RATE_LIMIT_MAX: '3' } });
    try {
      for (let i = 0; i < 3; i += 1) {
        await (await new TestClient(limited.app).init()).post('/auth/parent-access', { access_code: `TEBAK-${i}` }).expect(401);
      }
      const blocked = await (await new TestClient(limited.app).init()).post('/auth/parent-access', {
        access_code: 'MUMTAZ-DEMO-PARENT-ACCESS-ONLY',
      });
      expect(blocked.status).toBe(429);
    } finally {
      await limited.close();
    }
  });
});

describe('PATCH /tutor/me/password (tab Profil)', () => {
  it('password lama salah → 401; sama dengan lama → 422', async () => {
    const tutor = await as.tutorB(t.app);
    const wrong = await tutor.patch('/tutor/me/password', { current_password: 'salah', new_password: 'password-baru-123' });
    expect(wrong.status).toBe(401);
    const same = await tutor.patch('/tutor/me/password', {
      current_password: TEST_ONLY_CREDENTIALS.tutorPassword,
      new_password: TEST_ONLY_CREDENTIALS.tutorPassword,
    });
    expect(same.status).toBe(422);
  });

  it('berhasil: CSRF baru, session lain dicabut, password baru berlaku', async () => {
    const isolated = await createTestApp();
    try {
      const device1 = await as.tutorA(isolated.app);
      const device2 = await as.tutorA(isolated.app);

      const res = await device1.patch('/tutor/me/password', {
        current_password: TEST_ONLY_CREDENTIALS.tutorPassword,
        new_password: 'password-baru-yang-panjang',
      });
      expect(res.status).toBe(200);
      expect(res.body.csrf_token).not.toBe(device1.csrf);
      device1.csrf = res.body.csrf_token as string;

      await device1.get('/auth/me').expect(200);
      await device2.get('/auth/me').expect(401);

      await new TestClient(isolated.app).login('tutor-a.demo', 'password-baru-yang-panjang');
      const old = await (await new TestClient(isolated.app).init()).post('/auth/login', {
        username: 'tutor-a.demo',
        password: TEST_ONLY_CREDENTIALS.tutorPassword,
      });
      expect(old.status).toBe(401);
    } finally {
      await isolated.close();
    }
  });

  it('hanya untuk role tutor', async () => {
    const admin = await as.admin(t.app);
    const res = await admin.patch('/tutor/me/password', { current_password: 'a', new_password: 'b'.repeat(10) });
    expect(res.status).toBe(403);
  });
});
