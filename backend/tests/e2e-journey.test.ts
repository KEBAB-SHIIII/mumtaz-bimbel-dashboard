import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminAttendanceListItemSchema,
  paginatedSchema,
  payrollPreviewResponseSchema,
  recapResponseSchema,
} from '@mumtaz/contracts';
import { STUDENT_IDS, validSubmitRequest, SUBJECT_IDS } from '@mumtaz/contracts/fixtures';
import { lessonSessions } from '../src/db/schema.js';
import { FakeGoogleSheetsExporter } from './fakes/fake-google-sheets-exporter.js';
import { as, createTestApp, type TestApp, type TestClient } from './helpers/test-app.js';

/**
 * Phase 09 — satu perjalanan lintas role (docs/phases/phase-09 §3–§8), berurutan dan saling
 * bergantung: submit Tutor → review Admin (revisi → approve) → Orang Tua → honor → rekap →
 * ekspor + re-export. Offline & deterministik (PGlite + fake exporter).
 */
const PERIOD = '2026-10';
const { client_submission_id: _key, ...REVISABLE } = {
  ...validSubmitRequest,
  student_id: STUDENT_IDS.murid1, subject_id: SUBJECT_IDS.matematika,
  lesson_date: '2026-10-29',
  learning_material: 'Pecahan senilai (QA journey)',
};
const SUBMIT = {
  ...validSubmitRequest,
  client_submission_id: '00000000-0000-4000-9000-000000000e2e',
  student_id: STUDENT_IDS.murid1, subject_id: SUBJECT_IDS.matematika,
  lesson_date: '2026-10-29',
  duration_minutes: 75,
  learning_material: 'Pecahan senilai (QA journey)',
};

let t: TestApp;
let admin: TestClient;
let farhan: TestClient;
let noreen: TestClient;
let sari: TestClient;
let budi: TestClient;
const exporter = new FakeGoogleSheetsExporter('journey-spreadsheet');
let sessionId = '';

const sessionsInOctober = async () =>
  paginatedSchema(adminAttendanceListItemSchema).parse((await admin.get(`/admin/attendance?period=${PERIOD}&page_size=100`).expect(200)).body).total;
const payrollOf = async (client: TestClient, path: string) => payrollPreviewResponseSchema.parse((await client.get(`${path}?period=${PERIOD}`).expect(200)).body);
const progressOfAisyah = async () =>
  (await sari.get(`/parent/students/${STUDENT_IDS.murid1}/progress?period=${PERIOD}`).expect(200)).body.sessions as { id: string; duration_minutes: number }[];

beforeAll(async () => {
  t = await createTestApp({ sheetsExporter: exporter });
  [admin, farhan, noreen, sari, budi] = await Promise.all([as.admin(t.app), as.tutorA(t.app), as.tutorB(t.app), as.parentA(t.app), as.parentB(t.app)]);
});
afterAll(() => t.close());

describe('perjalanan end-to-end lintas role', () => {
  let totalBefore = 0;
  let honorBefore = 0;

  it('1. Tutor submit → pending di Neon, tanpa panggilan Sheets', async () => {
    totalBefore = await sessionsInOctober();
    honorBefore = Number((await payrollOf(farhan, '/tutor/me/payroll')).total_estimated_amount);
    const res = await farhan.post('/tutor/attendance', SUBMIT).expect(201);
    sessionId = res.body.session.id;
    expect(res.body.session).toMatchObject({ status: 'pending', anomaly_analysis_status: 'pending' });
    const [row] = await t.database.db.select().from(lessonSessions).where(eq(lessonSessions.id, sessionId));
    expect(row?.status).toBe('pending');
    expect(exporter.calls).toHaveLength(0);
  });

  it('2. Tutor lain tidak dapat melihat/mengubah sesi itu; Orang Tua belum melihat sesi pending', async () => {
    const list = (await noreen.get(`/tutor/me/attendance?period=${PERIOD}&page_size=100`).expect(200)).body.items as { id: string }[];
    expect(list.map((item) => item.id)).not.toContain(sessionId);
    expect((await noreen.patch(`/tutor/me/attendance/${sessionId}`, { ...REVISABLE, duration_minutes: 30 })).status).toBe(404);
    expect((await noreen.get(`/admin/attendance/${sessionId}`)).status).toBe(403);
    expect((await progressOfAisyah()).map((s) => s.id)).not.toContain(sessionId);
  });

  it('3. Admin filter bulan → minta revisi → Tutor merevisi → Admin approve', async () => {
    expect(await sessionsInOctober()).toBe(totalBefore + 1);
    await admin.patch(`/admin/attendance/${sessionId}/decision`, { decision: 'revision_requested', admin_note: 'Durasi sesuai jadwal 60 menit.' }).expect(200);
    const mine = (await farhan.get(`/tutor/me/attendance?period=${PERIOD}&page_size=100`).expect(200)).body.items as { id: string; status: string }[];
    expect(mine.find((item) => item.id === sessionId)?.status).toBe('revision_requested');

    await farhan.patch(`/tutor/me/attendance/${sessionId}`, { ...REVISABLE, duration_minutes: 60 }).expect(200);
    const approved = await admin.patch(`/admin/attendance/${sessionId}/decision`, { decision: 'approved' }).expect(200);
    expect(approved.body.status).toBe('approved');
  });

  it('4. Orang Tua melihat sesi approved anaknya saja; wali lain ditolak', async () => {
    expect((await progressOfAisyah()).find((s) => s.id === sessionId)?.duration_minutes).toBe(60);
    expect((await budi.get(`/parent/students/${STUDENT_IDS.murid1}/progress?period=${PERIOD}`)).status).toBe(403);
  });

  it('5. Honor naik tepat satu tarif tunggal dan dapat ditelusuri ke sesi + tarif; Admin & Tutor konsisten', async () => {
    const own = await payrollOf(farhan, '/tutor/me/payroll');
    expect(Number(own.total_estimated_amount) - honorBefore).toBe(50_000);
    const line = own.tutors.flatMap((tutor) => tutor.sessions).find((s) => s.session_id === sessionId);
    expect(line).toMatchObject({ counted: true, amount: '50000', rate_amount: '50000' });

    const all = await payrollOf(admin, '/admin/payroll/preview');
    const farhanRow = all.tutors.find((tutor) => tutor.sessions.some((s) => s.session_id === sessionId));
    expect(farhanRow?.estimated_amount).toBe(own.tutors[0]?.estimated_amount);
    for (const tutor of all.tutors) {
      const sum = tutor.sessions.filter((s) => s.counted).reduce((total, s) => total + Number(s.amount), 0);
      expect(sum).toBe(Number(tutor.estimated_amount));
    }
  });

  it('6. Rekap periode konsisten dengan Data Absensi (filter bulan sama di semua halaman)', async () => {
    const recap = recapResponseSchema.parse((await admin.get(`/admin/recap?period=${PERIOD}&group_by=tutor`).expect(200)).body);
    expect(recap.totals.total_sessions).toBe(await sessionsInOctober());
    const dashboard = (await admin.get(`/admin/dashboard/summary?period=${PERIOD}`).expect(200)).body;
    expect(dashboard.total_sessions).toBe(recap.totals.total_sessions);
  });

  it('7. Ekspor bulan = jumlah sesi Neon (semua status), 8 kolom; re-export setelah perubahan tanpa duplikasi', async () => {
    const first = await admin.post('/admin/reports/google-sheets/attendance', { period: PERIOD }).expect(200);
    const total = await sessionsInOctober();
    expect(first.body.export.records_exported).toBe(total);
    const tab = exporter.getTab('Absensi 2026-10') ?? [];
    expect(tab).toHaveLength(total + 1);
    expect(tab.every((row) => row.length === 8)).toBe(true);
    expect(tab.filter((row) => row[6] === '29/10/2026' && row[7] === '60 menit')).toHaveLength(1);

    // Perubahan data setelah ekspor: submit sesi baru lalu re-export.
    await farhan.post('/tutor/attendance', { ...SUBMIT, client_submission_id: '00000000-0000-4000-9000-000000000e2f', lesson_date: '2026-10-30', duration_minutes: 90 }).expect(201);
    const second = await admin.post('/admin/reports/google-sheets/attendance', { period: PERIOD }).expect(200);
    expect(second.body.export.records_exported).toBe(total + 1);
    expect(exporter.getTab('Absensi 2026-10')).toHaveLength(total + 2);
    expect(exporter.tabTitles().filter((title) => title === 'Absensi 2026-10')).toHaveLength(1);
  });
});
