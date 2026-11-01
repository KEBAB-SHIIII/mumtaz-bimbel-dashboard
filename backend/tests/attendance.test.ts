import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminAttendanceDetailSchema,
  adminAttendanceOptionsSchema,
  adminAttendanceListItemSchema,
  paginatedSchema,
  parentProgressResponseSchema,
  submitAttendanceResponseSchema,
  attendanceOptionsSchema,
  tutorSessionSchema,
} from '@mumtaz/contracts';
import {
  EXPECTED_SESSION_IDS_BY_PERIOD,
  FINDING_IDS,
  PARENT_FORBIDDEN_FIELDS,
  SESSION_IDS,
  STUDENT_IDS,
  SUBJECT_IDS,
  domainInvalidSubmitCases,
  validSubmitRequest,
} from '@mumtaz/contracts/fixtures';
import { anomalyFlags, lessonSessionSubjects, lessonSessions } from '../src/db/schema.js';
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
  it('opsi Form Absensi = semua murid & mapel aktif (tanpa penugasan), dengan auto-fill kelas/sekolah', async () => {
    const options = attendanceOptionsSchema.parse((await tutorA.get('/tutor/attendance-options').expect(200)).body);
    expect(options.students).toHaveLength(12);
    expect(options.subjects.map((subject) => subject.name)).toEqual(['Bahasa Indonesia', 'Bahasa Inggris', 'IPA', 'Matematika']);
    expect(options.students.find((student) => student.id === STUDENT_IDS.murid1)).toMatchObject({
      full_name: 'Aisyah',
      grade: '3 SD',
      school_name: 'SD Harapan Bangsa',
    });
    // Tutor lain melihat daftar yang sama; bukan Tutor → 403.
    expect(attendanceOptionsSchema.parse((await tutorB.get('/tutor/attendance-options').expect(200)).body)).toEqual(options);
    expect((await admin.get('/tutor/attendance-options')).status).toBe(403);
  });

  it('murid & mapel nonaktif hilang dari opsi dan ditolak saat submit (422 per field)', async () => {
    await admin.patch(`/admin/students/${STUDENT_IDS.murid3}`, { is_active: false }).expect(200);
    await admin.patch(`/admin/subjects/${SUBJECT_IDS.bahasaIndonesia}`, { is_active: false }).expect(200);
    try {
      const options = attendanceOptionsSchema.parse((await tutorA.get('/tutor/attendance-options').expect(200)).body);
      expect(options.students.map((student) => student.id)).not.toContain(STUDENT_IDS.murid3);
      expect(options.subjects.map((subject) => subject.id)).not.toContain(SUBJECT_IDS.bahasaIndonesia);

      const res = await tutorA.post('/tutor/attendance', {
        ...validSubmitRequest,
        client_submission_id: uuid(210),
        student_id: STUDENT_IDS.murid3,
        subject_ids: [SUBJECT_IDS.matematika, SUBJECT_IDS.bahasaIndonesia],
      });
      expect(res.status).toBe(422);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'student_id' }), expect.objectContaining({ field: 'subject_ids' })]),
      );
    } finally {
      await admin.patch(`/admin/students/${STUDENT_IDS.murid3}`, { is_active: true }).expect(200);
      await admin.patch(`/admin/subjects/${SUBJECT_IDS.bahasaIndonesia}`, { is_active: true }).expect(200);
    }
  });

  it('tutor mana pun boleh memilih murid & mapel aktif mana pun (tidak ada penugasan)', async () => {
    const res = await tutorB.post('/tutor/attendance', {
      ...validSubmitRequest,
      client_submission_id: uuid(211),
      student_id: STUDENT_IDS.murid1,
      subject_ids: [SUBJECT_IDS.bahasaIndonesia],
      lesson_date: '2026-08-12',
    });
    expect(res.status).toBe(201);
    const [row] = await t.database.db.select().from(lessonSessions).where(eq(lessonSessions.id, res.body.session.id));
    expect(row).toMatchObject({ tutor_id: '00000000-0000-4000-8002-000000000002', student_id: STUDENT_IDS.murid1 });
  });

  it('submit valid → 201 pending (menunggu validasi AI), durasi dihitung dari jam, mapel tersimpan', async () => {
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
      student_id: validSubmitRequest.student_id,
      lesson_date: '2026-10-20',
      start_time: '16:00:00',
      end_time: '17:30:00',
      duration_minutes: 90,
      status: 'pending',
      validity: null,
      rate_amount_snapshot: null,
      reviewed_by_user_id: null,
    });
    const subjects = await t.database.db.select().from(lessonSessionSubjects).where(eq(lessonSessionSubjects.lesson_session_id, session.id));
    expect(subjects.map((subject) => subject.subject_id)).toEqual(validSubmitRequest.subject_ids);
  });

  it('satu sesi bisa mencakup beberapa mapel (maksimal 3), tarif tetap per sesi', async () => {
    const res = await tutorA.post('/tutor/attendance', {
      ...validSubmitRequest,
      client_submission_id: uuid(212),
      lesson_date: '2026-10-19',
      subject_ids: [SUBJECT_IDS.matematika, SUBJECT_IDS.ipa, SUBJECT_IDS.bahasaIndonesia],
    });
    expect(res.status).toBe(201);
    const list = await admin.get(`/admin/attendance/${res.body.session.id}`).expect(200);
    expect(adminAttendanceDetailSchema.parse(list.body)).toMatchObject({
      subject_name: 'Bahasa Indonesia, IPA, Matematika',
      start_time: '16:00',
      end_time: '17:30',
    });
    const four = await tutorA.post('/tutor/attendance', {
      ...validSubmitRequest,
      client_submission_id: uuid(213),
      subject_ids: [SUBJECT_IDS.matematika, SUBJECT_IDS.ipa, SUBJECT_IDS.bahasaIndonesia, SUBJECT_IDS.bahasaInggris],
    });
    expect(four.status).toBe(422);
  });

  it('retry identik (client_submission_id sama) → sesi sama, tidak ada duplikat', async () => {
    const before = await sessionCount();
    const res = await tutorA.post('/tutor/attendance', validSubmitRequest);
    expect(res.status).toBe(201);
    expect(await sessionCount()).toBe(before);
  });

  it('key sama dengan payload berbeda → 409 IDEMPOTENCY_CONFLICT', async () => {
    const res = await tutorA.post('/tutor/attendance', { ...validSubmitRequest, end_time: '17:00' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('tutor lain memakai key yang sama → 409 (tidak membocorkan sesi tutor lain)', async () => {
    const res = await tutorB.post('/tutor/attendance', {
      ...validSubmitRequest,
      student_id: STUDENT_IDS.murid3,
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
    expect(body.items.every((item) => item.tutor_name === 'Farhan')).toBe(true);
    // s01, s02, s05 (31 Okt, disubmit Nov), s08, s09 + sesi baru 20 Okt & 19 Okt (multi-mapel)
    expect(body.total).toBe(7);
    expect(body.items.map((item) => item.id)).toContain(SESSION_IDS.s05);
    expect(body.items.map((item) => item.id)).not.toContain(SESSION_IDS.s03);
  });
});

describe('Admin: Data Absensi, validitas & CRUD', () => {
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

    const search = await admin.get('/admin/attendance?period=2026-10&search=Citra&page_size=100').expect(200);
    expect(search.body.items.every((i: { student_name: string }) => i.student_name === 'Citra')).toBe(true);

    const page = await admin.get('/admin/attendance?period=2026-10&page=2&page_size=4').expect(200);
    expect(page.body).toMatchObject({ page: 2, page_size: 4, total: 11 });
    expect(page.body.items).toHaveLength(4);
  });

  it('detail memuat validitas, approval, finding lengkap, dan pesan Admin', async () => {
    const res = await admin.get(`/admin/attendance/${SESSION_IDS.s03}`).expect(200);
    const detail = adminAttendanceDetailSchema.parse(res.body);
    // Status lama revision_requested dipetakan ke Perlu revisi dengan approval menunggu.
    expect(detail).toMatchObject({ validity: 'needs_revision', approval_status: 'pending', status: 'revision_requested' });
    expect(detail.last_review.admin_note).toMatch(/Durasi tidak sesuai/);
  });

  it('filter validitas: valid / belum divalidasi', async () => {
    const valid = await admin.get('/admin/attendance?period=2026-10&validity=valid&page_size=100').expect(200);
    expect(valid.body.items.length).toBeGreaterThan(0);
    expect(valid.body.items.every((i: { validity: string; status: string }) => i.validity === 'valid' && i.status === 'approved')).toBe(true);
    const unvalidated = await admin.get('/admin/attendance?period=2026-10&validity=unvalidated&page_size=100').expect(200);
    expect(unvalidated.body.items.every((i: { validity: null; status: string }) => i.validity === null && i.status === 'pending')).toBe(true);
  });

  it('Admin menetapkan Valid → langsung dihitung dengan snapshot tarif per jenjang & potongan Admin', async () => {
    // s02: Bima (5 SD), 60 menit → Rp70.000 kotor, potongan Rp10.000.
    const res = await admin.patch(`/admin/attendance/${SESSION_IDS.s02}/validity`, { validity: 'valid' });
    expect(res.status).toBe(200);
    expect(adminAttendanceDetailSchema.parse(res.body)).toMatchObject({ validity: 'valid', approval_status: null, status: 'approved' });

    const [row] = await t.database.db.select().from(lessonSessions).where(eq(lessonSessions.id, SESSION_IDS.s02));
    expect(Number(row?.rate_amount_snapshot)).toBe(70000);
    expect(Number(row?.admin_fee_snapshot)).toBe(10000);
    expect(row?.reviewed_at?.toISOString()).toBe('2026-11-15T03:00:00.000Z');
  });

  it('status approval Perlu revisi dipilih Admin: Disetujui dihitung, Ditolak ditahan', async () => {
    // s03: Citra (5 SD), 90 menit → Rp105.000.
    const approved = await admin.patch(`/admin/attendance/${SESSION_IDS.s03}/validity`, {
      validity: 'needs_revision',
      approval: 'approved',
      admin_note: 'Sudah dikonfirmasi tutor via WA',
    });
    expect(adminAttendanceDetailSchema.parse(approved.body)).toMatchObject({ approval_status: 'approved', status: 'approved' });
    let [row] = await t.database.db.select().from(lessonSessions).where(eq(lessonSessions.id, SESSION_IDS.s03));
    expect(Number(row?.rate_amount_snapshot)).toBe(105000);

    const rejected = await admin.patch(`/admin/attendance/${SESSION_IDS.s03}/validity`, { validity: 'needs_revision', approval: 'rejected' });
    expect(adminAttendanceDetailSchema.parse(rejected.body)).toMatchObject({ approval_status: 'rejected', status: 'rejected' });
    [row] = await t.database.db.select().from(lessonSessions).where(eq(lessonSessions.id, SESSION_IDS.s03));
    expect(row).toMatchObject({ rate_amount_snapshot: null, admin_fee_snapshot: null, admin_note: 'Sudah dikonfirmasi tutor via WA' });

    await admin.patch(`/admin/attendance/${SESSION_IDS.s03}/validity`, { validity: 'needs_revision', approval: 'pending' }).expect(200);
  });

  it('approval hanya untuk Perlu revisi → 422 bila dikirim untuk label lain', async () => {
    const res = await admin.patch(`/admin/attendance/${SESSION_IDS.s04}/validity`, { validity: 'valid', approval: 'approved' });
    expect(res.status).toBe(422);
  });

  it('Admin: tambah, ubah, dan hapus sesi (CRUD penuh)', async () => {
    const created = await admin.post('/admin/attendance', {
      tutor_id: '00000000-0000-4000-8002-000000000002',
      student_id: STUDENT_IDS.dimas,
      subject_ids: [SUBJECT_IDS.ipa],
      lesson_date: '2026-10-14',
      start_time: '15:00',
      end_time: '16:00',
      learning_material: 'Siklus air',
    });
    expect(created.status).toBe(201);
    const detail = adminAttendanceDetailSchema.parse(created.body);
    expect(detail).toMatchObject({ tutor_name: 'Noreen', status: 'pending', validity: null, duration_minutes: 60 });

    const updated = await admin.put(`/admin/attendance/${detail.id}`, {
      tutor_id: '00000000-0000-4000-8002-000000000002',
      student_id: STUDENT_IDS.dimas,
      subject_ids: [SUBJECT_IDS.ipa, SUBJECT_IDS.matematika],
      lesson_date: '2026-10-14',
      start_time: '15:00',
      end_time: '16:30',
      learning_material: 'Siklus air & pecahan',
    });
    expect(updated.status).toBe(200);
    expect(adminAttendanceDetailSchema.parse(updated.body)).toMatchObject({ duration_minutes: 90, subject_name: 'IPA, Matematika' });

    await admin.delete(`/admin/attendance/${detail.id}`).expect(204);
    expect((await admin.get(`/admin/attendance/${detail.id}`)).status).toBe(404);
    expect((await admin.delete(`/admin/attendance/${detail.id}`)).status).toBe(404);
  });

  it('hapus sesi duplikat yang memiliki temuan dan dirujuk temuan sesi lain', async () => {
    // s08 dirujuk temuan duplikasi s09 → rujukan dilepas, temuan s09 tetap ada.
    await admin.delete(`/admin/attendance/${SESSION_IDS.s08}`).expect(204);
    const [flag] = await t.database.db.select().from(anomalyFlags).where(eq(anomalyFlags.id, FINDING_IDS.duplicateS09));
    expect(flag?.related_lesson_session_id).toBeNull();
  });

  it('opsi form sesi Admin = murid & mapel aktif + tutor aktif; bukan Admin → 403', async () => {
    const options = adminAttendanceOptionsSchema.parse((await admin.get('/admin/attendance-options').expect(200)).body);
    expect(options.tutors.map((tutor) => tutor.full_name)).toContain('Farhan');
    expect(options.students).toHaveLength(12);
    expect((await tutorA.get('/admin/attendance-options')).status).toBe(403);
  });

  it('bukan Admin tidak bisa CRUD sesi', async () => {
    expect((await tutorA.delete(`/admin/attendance/${SESSION_IDS.s01}`)).status).toBe(403);
    expect((await tutorA.patch(`/admin/attendance/${SESSION_IDS.s01}/validity`, { validity: 'valid' })).status).toBe(403);
  });

  it('sesi yang AI-nya belum selesai tetap menunggu validasi; temuan tetap terlihat', async () => {
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
    student_id: STUDENT_IDS.murid2,
    subject_ids: [SUBJECT_IDS.bahasaInggris],
    lesson_date: '2026-10-11',
    start_time: '16:00',
    end_time: '17:00',
    learning_material: 'Numbers 1–100 (koreksi tanggal)',
    learning_notes: null,
    next_focus: 'Numbers 100–1000',
  };

  it('Perlu revisi → Tutor merevisi → menunggu validasi ulang, metadata direset, finding lama superseded', async () => {
    await admin
      .patch(`/admin/attendance/${SESSION_IDS.s09}/validity`, {
        validity: 'needs_revision',
        approval: 'pending',
        admin_note: 'Tanggal sama dengan sesi lain',
      })
      .expect(200);

    const history = await tutorA.get('/tutor/me/attendance?period=2026-10&status=revision_requested').expect(200);
    expect(history.body.items[0]).toMatchObject({
      id: SESSION_IDS.s09,
      validity: 'needs_revision',
      approval_status: 'pending',
      admin_note: 'Tanggal sama dengan sesi lain',
    });

    const res = await tutorA.patch(`/tutor/me/attendance/${SESSION_IDS.s09}`, revision);
    expect(res.status).toBe(200);
    const session = tutorSessionSchema.parse(res.body.session);
    expect(session).toMatchObject({ status: 'pending', validity: null, admin_note: null, reviewed_at: null, lesson_date: '2026-10-11' });

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
    const res = await tutorA.patch(`/tutor/me/attendance/${SESSION_IDS.s09}`, { ...revision, end_time: '16:45' });
    expect(res.status).toBe(409);
  });

  it('sesi Valid/Ditolak tidak bisa direvisi Tutor → 409', async () => {
    const res = await tutorA.patch(`/tutor/me/attendance/${SESSION_IDS.s01}`, { ...revision, student_id: STUDENT_IDS.murid1, subject_ids: [SUBJECT_IDS.matematika] });
    expect(res.status).toBe(409);
    // s04 Ditolak (data lama) milik tutor B.
    expect((await tutorB.patch(`/tutor/me/attendance/${SESSION_IDS.s04}`, revision)).status).toBe(409);
  });

  it('sesi tutor lain → 404 (tidak bisa diambil alih)', async () => {
    const res = await tutorA.patch(`/tutor/me/attendance/${SESSION_IDS.s03}`, revision);
    expect(res.status).toBe(404);
  });

  it('revisi ke murid nonaktif → 422', async () => {
    await admin.patch(`/admin/students/${STUDENT_IDS.murid2}`, { is_active: false }).expect(200);
    try {
      const res = await tutorB.patch(`/tutor/me/attendance/${SESSION_IDS.s03}`, { ...revision, student_id: STUDENT_IDS.murid2 });
      expect(res.status).toBe(422);
    } finally {
      await admin.patch(`/admin/students/${STUDENT_IDS.murid2}`, { is_active: true }).expect(200);
    }
  });
});

describe('Progress Anak (Orang Tua)', () => {
  it('hanya anak terhubung', async () => {
    const parent = await as.parentA(t.app);
    const res = await parent.get('/parent/me/students').expect(200);
    expect(res.body.items).toEqual([
      { id: STUDENT_IDS.murid1, full_name: 'Aisyah', grade: '3 SD', school_name: 'SD Harapan Bangsa', relationship: 'ibu' },
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

describe('batas durasi configurable (ATTENDANCE_MAX_DURATION_MINUTES, O-12)', () => {
  it('durasi (dari jam) di atas batas konfigurasi → 422 pada jam selesai, sesi tidak tersimpan', async () => {
    const strict = await createTestApp({ env: { ATTENDANCE_MAX_DURATION_MINUTES: '120' } });
    try {
      const tutor = await as.tutorA(strict.app);
      const res = await tutor.post('/tutor/attendance', { ...validSubmitRequest, client_submission_id: uuid(400), end_time: '18:30' });
      expect(res.status).toBe(422);
      expect(res.body.error.details).toEqual([{ field: 'end_time', message: 'Durasi maksimal 120 menit' }]);
      await tutor.post('/tutor/attendance', { ...validSubmitRequest, client_submission_id: uuid(401), end_time: '18:00' }).expect(201);
    } finally {
      await strict.close();
    }
  });

  it('default menerima durasi panjang (di atas ambang) — dilabeli Perlu revisi oleh AI, bukan ditolak', async () => {
    const res = await tutorA.post('/tutor/attendance', { ...validSubmitRequest, client_submission_id: uuid(402), start_time: '13:00', end_time: '18:00', lesson_date: '2026-10-21' });
    expect(res.status).toBe(201);
  });
});

describe('riwayat Tutor — filter siswa', () => {
  it('student_id mempersempit hasil, tetap hanya sesi milik tutor login', async () => {
    const res = await tutorA.get(`/tutor/me/attendance?period=2026-10&student_id=${STUDENT_IDS.murid2}&page_size=100`).expect(200);
    const items = paginatedSchema(tutorSessionSchema).parse(res.body).items;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.student_name === 'Bima' && item.tutor_name === 'Farhan')).toBe(true);

    // Siswa yang tidak diajar tutor ini → kosong (bukan data tutor lain).
    const other = await tutorA.get(`/tutor/me/attendance?period=2026-10&student_id=${STUDENT_IDS.murid3}`).expect(200);
    expect(other.body.total).toBe(0);
  });
});
