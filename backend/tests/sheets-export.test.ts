import { and, count, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  SHEET_EXPORT_HEADERS,
  errorResponseSchema,
  paginatedSchema,
  sheetExportResponseSchema,
  sheetExportRunSchema,
} from '@mumtaz/contracts';
import { EXPECTED_EXPORT_ROWS_2026_10, USER_IDS, validSubmitRequest, STUDENT_IDS, SUBJECT_IDS } from '@mumtaz/contracts/fixtures';
import { lessonSessions, sheetExportRuns } from '../src/db/schema.js';
import { expireStaleRuns } from '../src/services/exports/attendance-export-service.js';
import { FakeGoogleSheetsExporter } from './fakes/fake-google-sheets-exporter.js';
import { API, FIXED_NOW, as, createTestApp, type TestApp, type TestClient } from './helpers/test-app.js';

const PATH = '/admin/reports/google-sheets/attendance';

let t: TestApp;
let admin: TestClient;
const exporter = new FakeGoogleSheetsExporter('demo-spreadsheet-id');

beforeAll(async () => {
  t = await createTestApp({ sheetsExporter: exporter });
  admin = await as.admin(t.app);
});
afterAll(() => t.close());

const runCount = async () => (await t.database.db.select({ n: count() }).from(sheetExportRuns))[0]?.n ?? 0;
const sessionSnapshot = () => t.database.db.select().from(lessonSessions).orderBy(lessonSessions.id);

describe('POST /admin/reports/google-sheets/attendance', () => {
  it('ekspor pertama membuat tab Absensi 2026-10 dengan 8 kolom & SEMUA status (O-08)', async () => {
    const res = await admin.post(PATH, { period: '2026-10' });
    expect(res.status).toBe(200);
    const { export: run } = sheetExportResponseSchema.parse(res.body);
    expect(run).toMatchObject({
      period: '2026-10',
      sheet_title: 'Absensi 2026-10',
      spreadsheet_id: 'demo-spreadsheet-id',
      spreadsheet_url: 'https://docs.google.com/spreadsheets/d/demo-spreadsheet-id/edit',
      records_exported: 9,
      status: 'succeeded',
    });

    const tab = exporter.getTab('Absensi 2026-10');
    expect(tab?.[0]).toEqual([...SHEET_EXPORT_HEADERS]);
    expect(tab?.slice(1)).toEqual(EXPECTED_EXPORT_ROWS_2026_10);
    // Tidak ada status, materi, ID internal, atau honor di laporan.
    expect(JSON.stringify(tab)).not.toMatch(/pending|approved|rejected|Numbers 1–100|00000000-|50000/);
  });

  it('re-export bulan sama mengganti isi tab (tanpa duplikasi) dan membuat run baru', async () => {
    const before = await runCount();
    await admin.post(PATH, { period: '2026-10' }).expect(200);
    expect(exporter.getTab('Absensi 2026-10')).toHaveLength(10);
    expect(exporter.tabTitles().filter((title) => title === 'Absensi 2026-10')).toHaveLength(1);
    expect(await runCount()).toBe(before + 1);
  });

  it('periode memakai lesson_date: sesi 31 Okt (disubmit Nov) masuk Oktober, bukan November', async () => {
    await admin.post(PATH, { period: '2026-11' }).expect(200);
    const november = exporter.getTab('Absensi 2026-11') ?? [];
    expect(november.slice(1).map((row) => row[6])).toEqual(['01/11/2026']);
  });

  it('periode kosong + tab berisi → 409 tanpa menulis dan TANPA meninggalkan log run', async () => {
    exporter.seedTab('Absensi 2026-12', [[...SHEET_EXPORT_HEADERS], [1, 'Lama', 'Lama', '1 SD', 'X', 'IPA', '01/12/2026', '60 menit']]);
    const before = await runCount();

    const res = await admin.post(PATH, { period: '2026-12' });
    expect(res.status).toBe(409);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('EMPTY_EXPORT_CONFIRMATION_REQUIRED');
    expect(exporter.getTab('Absensi 2026-12')).toHaveLength(2);
    expect(await runCount()).toBe(before);

    // Konfirmasi eksplisit → tab diganti header saja.
    const confirmed = await admin.post(PATH, { period: '2026-12', confirm_empty_replace: true }).expect(200);
    expect(confirmed.body.export).toMatchObject({ records_exported: 0, status: 'succeeded' });
    expect(exporter.getTab('Absensi 2026-12')).toEqual([[...SHEET_EXPORT_HEADERS]]);
  });

  it('periode kosong + tab belum ada → langsung membuat tab header saja (tidak perlu konfirmasi)', async () => {
    const res = await admin.post(PATH, { period: '2027-01' }).expect(200);
    expect(res.body.export.records_exported).toBe(0);
    expect(exporter.getTab('Absensi 2027-01')).toEqual([[...SHEET_EXPORT_HEADERS]]);
  });

  it('write gagal → 503 pesan aman, run `failed`, laporan lama utuh, data Neon tidak berubah', async () => {
    const tabBefore = exporter.getTab('Absensi 2026-10');
    const neonBefore = await sessionSnapshot();
    exporter.failNext('write');

    const res = await admin.post(PATH, { period: '2026-10' });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatchObject({ code: 'INTEGRATION_UNAVAILABLE' });
    expect(JSON.stringify(res.body)).not.toMatch(/stack|key|token/i);
    expect(exporter.getTab('Absensi 2026-10')).toEqual(tabBefore);
    expect(await sessionSnapshot()).toEqual(neonBefore);

    const failed = await t.database.db
      .select()
      .from(sheetExportRuns)
      .where(and(eq(sheetExportRuns.period, '2026-10'), eq(sheetExportRuns.status, 'failed')));
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ records_exported: 0, safe_error_message: expect.any(String) });
    expect(failed[0]?.completed_at).not.toBeNull();
  });

  it('preflight read gagal → run `failed` (bukan 409/sukses palsu); retry membuat run baru yang sukses', async () => {
    exporter.failNext('read');
    expect((await admin.post(PATH, { period: '2026-10' })).status).toBe(503);
    await admin.post(PATH, { period: '2026-10' }).expect(200);
  });

  it('ekspor periode sama yang masih berjalan → 409 CONFLICT (kunci DB per periode)', async () => {
    await t.database.db.insert(sheetExportRuns).values({
      exported_by_user_id: USER_IDS.admin,
      period: '2026-09',
      spreadsheet_id: 'demo-spreadsheet-id',
      sheet_title: 'Absensi 2026-09',
      status: 'running',
      started_at: FIXED_NOW,
    });
    const res = await admin.post(PATH, { period: '2026-09' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('run `running` yang terhenti (> 10 menit) kedaluwarsa otomatis sehingga periode tidak terkunci', async () => {
    const later = new Date(FIXED_NOW.getTime() + 11 * 60_000);
    expect(await expireStaleRuns(t.database.db, later)).toBe(1);
    const [stale] = await t.database.db.select().from(sheetExportRuns).where(eq(sheetExportRuns.period, '2026-09'));
    expect(stale).toMatchObject({ status: 'failed', safe_error_message: expect.stringContaining('terhenti') });
    await admin.post(PATH, { period: '2026-09' }).expect(200);
  });

  it('validasi & role guard: periode invalid 422, field asing 422, non-Admin 403, tanpa sesi 401', async () => {
    expect((await admin.post(PATH, { period: '2026-13' })).status).toBe(422);
    expect((await admin.post(PATH, { period: '2026-10', status: 'approved' })).status).toBe(422);
    const tutor = await as.tutorA(t.app);
    expect((await tutor.post(PATH, { period: '2026-10' })).status).toBe(403);
    const parent = await as.parentA(t.app);
    expect((await parent.post(PATH, { period: '2026-10' })).status).toBe(403);
    expect((await request(t.app).get(`${API}${PATH}/history`)).status).toBe(401);
  });

  it('submit Tutor TIDAK memanggil Google Sheets', async () => {
    const callsBefore = exporter.calls.length;
    const tutor = await as.tutorA(t.app);
    await tutor
      .post('/tutor/attendance', { ...validSubmitRequest, client_submission_id: '00000000-0000-4000-9000-000000000900', student_id: STUDENT_IDS.murid1, subject_ids: [SUBJECT_IDS.matematika] })
      .expect(201);
    expect(exporter.calls.length).toBe(callsBefore);
  });
});

describe('GET /admin/reports/google-sheets/attendance/history', () => {
  it('terbaru dulu, terpaginasi, filter periode, tanpa credential', async () => {
    const res = await admin.get(`${PATH}/history?page_size=100`).expect(200);
    const body = paginatedSchema(sheetExportRunSchema).parse(res.body);
    expect(body.total).toBeGreaterThanOrEqual(6);
    const started = body.items.map((item) => item.started_at);
    expect(started).toEqual([...started].sort().reverse());
    expect(body.items.some((item) => item.status === 'failed' && item.safe_error_message)).toBe(true);

    const october = paginatedSchema(sheetExportRunSchema).parse((await admin.get(`${PATH}/history?period=2026-10`).expect(200)).body);
    expect(october.items.every((item) => item.period === '2026-10')).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/private_key|client_email|token/);
  });
});

describe('integrasi belum dikonfigurasi', () => {
  it('→ 503 INTEGRATION_UNAVAILABLE dan tidak membuat run', async () => {
    const plain = await createTestApp();
    try {
      const adminPlain = await as.admin(plain.app);
      const res = await adminPlain.post(PATH, { period: '2026-10' });
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('INTEGRATION_UNAVAILABLE');
      expect((await plain.database.db.select({ n: count() }).from(sheetExportRuns))[0]?.n).toBe(0);
    } finally {
      await plain.close();
    }
  });
});
