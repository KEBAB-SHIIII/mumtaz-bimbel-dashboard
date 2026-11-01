import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { STUDENT_IDS } from '@mumtaz/contracts/fixtures';
import { API, as, createTestApp, type TestApp, type TestClient } from './helpers/test-app.js';

let t: TestApp;
let admin: TestClient;
let tutor: TestClient;
let parent: TestClient;

beforeAll(async () => {
  t = await createTestApp();
  [admin, tutor, parent] = await Promise.all([as.admin(t.app), as.tutorA(t.app), as.parentA(t.app)]);
});
afterAll(() => t.close());

const adminPaths = [
  '/admin/dashboard/summary?period=2026-10',
  '/admin/attendance?period=2026-10',
  '/admin/billing?period=2026-10',
  '/admin/payroll/preview?period=2026-10',
  '/admin/tutors',
  '/admin/students',
  '/admin/parents',
  '/admin/subjects',
];
const tutorPaths = [
  '/tutor/dashboard/summary?period=2026-10',
  '/tutor/attendance-options',
  '/tutor/me/attendance?period=2026-10',
  '/tutor/me/payroll?period=2026-10',
];
const parentPaths = [
  '/parent/me/students',
  `/parent/students/${STUDENT_IDS.murid1}/progress?period=2026-10`,
  `/parent/dashboard/summary?student_id=${STUDENT_IDS.murid1}&period=2026-10`,
];

describe('role guard backend (menyembunyikan menu bukan kontrol keamanan)', () => {
  it.each([...adminPaths, ...tutorPaths, ...parentPaths])('tanpa session → 401: %s', async (path) => {
    const res = await request(t.app).get(`${API}${path}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it.each(adminPaths)('tutor & parent → 403 pada %s', async (path) => {
    expect((await tutor.get(path)).status).toBe(403);
    expect((await parent.get(path)).status).toBe(403);
  });

  it.each(tutorPaths)('admin & parent → 403 pada %s', async (path) => {
    expect((await admin.get(path)).status).toBe(403);
    expect((await parent.get(path)).status).toBe(403);
  });

  it.each(parentPaths)('admin & tutor → 403 pada %s', async (path) => {
    expect((await admin.get(path)).status).toBe(403);
    expect((await tutor.get(path)).status).toBe(403);
  });

  it.each(adminPaths)('admin → 200 pada %s', async (path) => {
    expect((await admin.get(path)).status).toBe(200);
  });

  it.each(tutorPaths)('tutor → 200 pada %s', async (path) => {
    expect((await tutor.get(path)).status).toBe(200);
  });

  it.each(parentPaths)('parent → 200 pada %s', async (path) => {
    expect((await parent.get(path)).status).toBe(200);
  });

  it('mutasi tutor oleh admin ditolak (submit absensi)', async () => {
    const res = await admin.post('/tutor/attendance', {});
    expect(res.status).toBe(403);
  });
});
