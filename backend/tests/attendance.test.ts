import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminAttendanceDetailSchema,
  adminAttendanceListItemSchema,
  paginatedSchema,
  parentProgressResponseSchema,
  submitAttendanceResponseSchema,
  tutorAssignmentOptionSchema,
  tutorSessionSchema,
} from '@mumtaz/contracts';
import {
  ASSIGNMENT_IDS,
  EXPECTED_SESSION_IDS_BY_PERIOD,
  FINDING_IDS,
  PARENT_FORBIDDEN_FIELDS,
  SESSION_IDS,
  STUDENT_IDS,
  domainInvalidSubmitCases,
  validSubmitRequest,
} from '@mumtaz/contracts/fixtures';
import { anomalyFlags, lessonSessions } from '../src/db/schema.js';
import { as, createTestApp, type TestApp, type TestClient } from './helpers/test-app.js';

let t: TestApp;
let admin: TestClient;
let tutorA: TestClient;
let tutorB: TestClient;

beforeAll(async () => {
  t = await createTestApp();
  [admin, tutorA, tutorB] = await Promise.all([as.admin(t.app), as.tutorA(t.app), as.tutorB(t.app)]);
});
afterAll(() => t.close());

const sessionCount = async () => (await t.database.db.select({ n: count() }).from(lessonSessions))[0]?.n ?? 0;
const uuid = (n: number) => `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`;

describe('POST /tutor/attendance', () => {
  it('opsi assignment hanya milik tutor login (aktif), dengan auto-fill kelas/sekolah', async () => {
    const res = await tutorA.get('/tutor/me/assignments').expect(200);
    const items = tutorAssignmentOptionSchema.array().parse(res.body.items);
    expect(items.map((item) => item.assignment_id).sort()).toEqual(
      [ASSIGNMENT_IDS.tutorAMurid1Matematika, ASSIGNMENT_IDS.tutorAMurid2BahasaInggris].sort(),
    );
    expect(items.find((i) => i.assignment_id === ASSIGNMENT_IDS.tutorAMurid1Matematika)?.student).toMatchObject({
      grade: '3 SD',
      school_name: 'Sekolah Demo A',
    });
  });

  it('submit valid → 201 pending + anomaly pending, tersimpan di DB', async () => {
    const res = await tutorA.post('/tutor/attendance', validSubmitRequest);
    expect(res.status).toBe(201);
    const { session } = submitAttendanceResponseSchema.parse(res.body);
    expect(session).toMatchObject({
      client_submission_id: validSubmitRequest.client_submission_id,
      status: 'pending',
      anomaly_analysis_status: 'pending',
    });

    const [row] = await t.database.db.select().from(lessonSessions).where(eq(lessonSessions.id, session.id));
    expect(row).toMatchObject({
      assignment_id: validSubmitRequest.assignment_id,
      lesson_date: '2026-10-20',
      duration_minutes: 90,
      status: 'pending',
      rate_amount_snapshot: null,
      reviewed_by_user_id: null,
    });
  });

  it('retry identik (client_submission_id sama) → sesi sama, tidak ada duplikat', async () => {
    const before = await sessionCount();
    const res = await tutorA.post('/tutor/attendance', validSubmitRequest);
    expect(res.status).toBe(201);
    expect(await sessionCount()).toBe(before);
  });

  it('key sama dengan payload berbeda → 409 IDEMPOTENCY_CONFLICT', async () => {
    const res = await tutorA.post('/tutor/attendance', { ...validSubmitRequest, duration_minutes: 60 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('tutor lain memakai key yang sama → 409 (tidak membocorkan sesi tutor lain)', async () => {
    const res = await tutorB.post('/tutor/attendance', {
      ...validSubmitRequest,
      assignment_id: ASSIGNMENT_IDS.tutorBMurid3Ipa,
    });
    expect(res.status).toBe(409);
  });

  it.each(Object.entries(domainInvalidSubmitCases))('aturan domain: %s → 422', async (_name, body) => {
    const res = await tutorA.post('/tutor/attendance', body);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('tanggal masa depan menurut Asia/Jakarta → 422 (O-14 working default)', async () => {
    // FIXED_NOW = 2026-11-15T03:00Z = 15 Nov 10:00 WIB
    const res = await tutorA.post('/tutor/attendance', {
      ...validSubmitRequest,
      client_submission_id: uuid(200),
      lesson_date: '2026-11-16',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ field: 'lesson_date' }));
  });

  it('tutor_id/status dari body ditolak (identitas hanya dari session)', async () => {
    const res = await tutorA.post('/tutor/attendance', {
      ...validSubmitRequest,
      client_submission_id: uuid(201),
      tutor_id: '00000000-0000-4000-8002-000000000002',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.details).toContainEqual({ field: 'tutor_id', message: 'Field tidak dikenal' });
  });

  it('arsitektur: alur submit tidak mengimpor integrasi Google Sheets', () => {
    const srcDir = fileURLToPath(new URL('../src', import.meta.url));
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? files(path) : [path];
      });
    const submitPath = files(join(srcDir, 'services', 'attendance')).concat(join(srcDir, 'routes', 'tutor.ts'));
    for (const file of submitPath) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/google-sheets|googleapis/);
    }
  });
});

describe('riwayat Tutor', () => {
  it('hanya sesi milik tutor login, difilter lesson_date', async () => {
    const res = await tutorA.get('/tutor/me/attendance?period=2026-10&page_size=100').expect(200);
    const body = paginatedSchema(tutorSessionSchema).parse(res.body);
    expect(body.items.every((item) => item.tutor_name === 'Tutor Demo A')).toBe(true);
    // s01, s02, s05 (31 Okt, disubmit Nov), s08, s09 + sesi baru 20 Okt
    expect(body.total).toBe(6);
    expect(body.items.map((item) => item.id)).toContain(SESSION_IDS.s05);
    expect(body.items.map((item) => item.id)).not.toContain(SESSION_IDS.s03);
  });
});

describe('Admin: Data Absensi & keputusan review', () => {
  it('list periode berbasis lesson_date, semua status, dengan ringkasan finding', async () => {
    const res = await admin.get('/admin/attendance?period=2026-10&page_size=100').expect(200);
    const body = paginatedSchema(adminAttendanceListItemSchema).parse(res.body);
    const ids = body.items.map((item) => item.id);
    const expected = EXPECTED_SESSION_IDS_BY_PERIOD['2026-10'] ?? [];
    expect(expected).toHaveLength(9);
    for (const id of expected) expect(ids).toContain(id);
    expect(ids).not.toContain(SESSION_IDS.s06);
    expect(ids).not.toContain(SESSION_IDS.s07);
    expect(body.items.find((i) => i.id === SESSION_IDS.s09)?.findings).toEqual([
      { id: FINDING_IDS.duplicateS09, finding_type: 'suspected_duplicate', review_status: 'pending_review' },
    ]);
  });

  it('filter status + pencarian + pagination', async () => {
    const pending = await admin.get('/admin/attendance?period=2026-10&status=pending&page_size=100').expect(200);
    expect(pending.body.items.every((i: { status: string }) => i.status === 'pending')).toBe(true);

    const search = await admin.get('/admin/attendance?period=2026-10&search=Murid%20Demo%203&page_size=100').expect(200);
    expect(search.body.items.every((i: { student_name: string }) => i.student_name === 'Murid Demo 3')).toBe(true);

    const page = await admin.get('/admin/attendance?period=2026-10&page=2&page_size=4').expect(200);
    expect(page.body).toMatchObject({ page: 2, page_size: 4, total: 10 });
    expect(page.body.items).toHaveLength(4);
  });

  it('detail memuat finding lengkap dan keputusan terakhir', async () => {
    const res = await admin.get(`/admin/attendance/${SESSION_IDS.s03}`).expect(200);
    const detail = adminAttendanceDetailSchema.parse(res.body);
    expect(detail.last_review.admin_note).toMatch(/Durasi tidak sesuai/);
  });

  it('approve sesi pending → snapshot tarif demo dari tutor_rates', async () => {
    const res = await admin.patch(`/admin/attendance/${SESSION_IDS.s02}/decision`, { decision: 'approved' });
    expect(res.status).toBe(200);
    expect(adminAttendanceDetailSchema.parse(res.body).status).toBe('approved');

    const [row] = await t.database.db.select().from(lessonSessions).where(eq(lessonSessions.id, SESSION_IDS.s02));
    expect(row).toMatchObject({ rate_type_snapshot: 'per_session', rate_is_demo_snapshot: true });
    expect(Number(row?.rate_amount_snapshot)).toBe(50000);
    expect(row?.reviewed_at?.toISOString()).toBe('2026-11-15T03:00:00.000Z');
  });

  it('approved/rejected terminal → 409 SESSION_STATE_CONFLICT (O-15 working default)', async () => {
    const again = await admin.patch(`/admin/attendance/${SESSION_IDS.s02}/decision`, { decision: 'rejected', admin_note: 'x' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('SESSION_STATE_CONFLICT');
    const rejected = await admin.patch(`/admin/attendance/${SESSION_IDS.s04}/decision`, { decision: 'approved' });
    expect(rejected.status).toBe(409);
  });

  it('revisi/penolakan tanpa alasan → 422', async () => {
    const res = await admin.patch(`/admin/attendance/${SESSION_IDS.s10}/decision`, { decision: 'revision_requested' });
    expect(res.status).toBe(422);
  });

  it('finding anomali tidak mengubah status sesi; keputusan tetap di tangan Admin', async () => {
    const res = await admin.get(`/admin/attendance/${SESSION_IDS.s10}`).expect(200);
    const detail = adminAttendanceDetailSchema.parse(res.body);
    expect(detail.status).toBe('pending');
    expect(detail.findings.map((f) => f.finding_type)).toEqual(['duration_outlier']);
  });

  it('sesi tidak ada → 404', async () => {
    expect((await admin.get('/admin/attendance/00000000-0000-4000-8000-000000000999')).status).toBe(404);
  });
});

describe('revisi oleh Tutor', () => {
  const revision = {
    assignment_id: ASSIGNMENT_IDS.tutorAMurid2BahasaInggris,
    lesson_date: '2026-10-11',
    duration_minutes: 60,
    learning_material: 'Numbers 1–100 (koreksi tanggal)',
    learning_notes: null,
    next_focus: 'Numbers 100–1000',
  };

  it('Admin minta revisi → Tutor merevisi → pending, metadata review direset, finding lama superseded', async () => {
    await admin
      .patch(`/admin/attendance/${SESSION_IDS.s09}/decision`, { decision: 'revision_requested', admin_note: 'Tanggal sama dengan sesi lain' })
      .expect(200);

    const history = await tutorA.get('/tutor/me/attendance?period=2026-10&status=revision_requested').expect(200);
    expect(history.body.items[0]).toMatchObject({ id: SESSION_IDS.s09, admin_note: 'Tanggal sama dengan sesi lain' });

    const res = await tutorA.patch(`/tutor/me/attendance/${SESSION_IDS.s09}`, revision);
    expect(res.status).toBe(200);
    const session = tutorSessionSchema.parse(res.body.session);
    expect(session).toMatchObject({ status: 'pending', admin_note: null, reviewed_at: null, lesson_date: '2026-10-11' });

    const [row] = await t.database.db.select().from(lessonSessions).where(eq(lessonSessions.id, SESSION_IDS.s09));
    expect(row).toMatchObject({ anomaly_analysis_status: 'pending', reviewed_by_user_id: null });

    const [flag] = await t.database.db.select().from(anomalyFlags).where(eq(anomalyFlags.id, FINDING_IDS.duplicateS09));
    expect(flag).toMatchObject({ review_status: 'superseded', review_note: 'superseded_by_revision' });
  });

  it('retry identik setelah respons hilang → 200 tanpa mengubah submitted_at', async () => {
    const [before] = await t.database.db.select().from(lessonSessions).where(eq(lessonSessions.id, SESSION_IDS.s09));
    const res = await tutorA.patch(`/tutor/me/attendance/${SESSION_IDS.s09}`, revision);
    expect(res.status).toBe(200);
    const [after] = await t.database.db.select().from(lessonSessions).where(eq(lessonSessions.id, SESSION_IDS.s09));
    expect(after?.submitted_at.toISOString()).toBe(before?.submitted_at.toISOString());
  });

  it('payload berbeda pada sesi yang sudah pending → 409', async () => {
    const res = await tutorA.patch(`/tutor/me/attendance/${SESSION_IDS.s09}`, { ...revision, duration_minutes: 45 });
    expect(res.status).toBe(409);
  });

  it('sesi approved tidak bisa direvisi → 409', async () => {
    const res = await tutorA.patch(`/tutor/me/attendance/${SESSION_IDS.s01}`, { ...revision, assignment_id: ASSIGNMENT_IDS.tutorAMurid1Matematika });
    expect(res.status).toBe(409);
  });

  it('sesi tutor lain → 404 (tidak bisa diambil alih)', async () => {
    const res = await tutorA.patch(`/tutor/me/attendance/${SESSION_IDS.s03}`, revision);
    expect(res.status).toBe(404);
  });

  it('revisi ke assignment milik tutor lain → 422', async () => {
    const res = await tutorB.patch(`/tutor/me/attendance/${SESSION_IDS.s03}`, {
      ...revision,
      assignment_id: ASSIGNMENT_IDS.tutorAMurid2BahasaInggris,
    });
    expect(res.status).toBe(422);
  });
});

describe('Progress Anak (Orang Tua)', () => {
  it('hanya anak terhubung', async () => {
    const parent = await as.parentA(t.app);
    const res = await parent.get('/parent/me/students').expect(200);
    expect(res.body.items).toEqual([
      { id: STUDENT_IDS.murid1, full_name: 'Murid Demo 1', grade: '3 SD', school_name: 'Sekolah Demo A', relationship: 'orang tua' },
    ]);
  });

  it('hanya sesi approved, tanpa field internal (admin_note/anomali/tarif)', async () => {
    const parent = await as.parentA(t.app);
    const res = await parent.get(`/parent/students/${STUDENT_IDS.murid1}/progress?period=2026-10`).expect(200);
    const body = parentProgressResponseSchema.parse(res.body);
    // Murid 1 Okt: s01 & s05 approved; sesi baru 20 Okt masih pending.
    expect(body.sessions.map((s) => s.id).sort()).toEqual([SESSION_IDS.s01, SESSION_IDS.s05].sort());
    const raw = JSON.stringify(res.body);
    for (const field of PARENT_FORBIDDEN_FIELDS) expect(raw).not.toContain(`"${field}"`);
  });

  it('anak lain (mengganti ID di URL) → 403', async () => {
    const parent = await as.parentA(t.app);
    const res = await parent.get(`/parent/students/${STUDENT_IDS.murid3}/progress?period=2026-10`);
    expect(res.status).toBe(403);
    const summary = await parent.get(`/parent/dashboard/summary?student_id=${STUDENT_IDS.murid3}&period=2026-10`);
    expect(summary.status).toBe(403);
  });
});
