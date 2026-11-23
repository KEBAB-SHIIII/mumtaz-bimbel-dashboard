import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { billingResponseSchema, payrollPreviewResponseSchema, studentSchema } from '@mumtaz/contracts';
import { SUBJECT_IDS, TUTOR_IDS, SESSION_IDS } from '@mumtaz/contracts/fixtures';
import { eq } from 'drizzle-orm';
import { lessonSessions } from '../src/db/schema.js';
import { createLogger } from '../src/lib/logger.js';
import { analyzeSession } from '../src/services/anomaly/anomaly-service.js';
import { FakeAnomalyDetector } from './fakes/fake-anomaly-detector.js';
import { as, createTestApp, type TestApp, type TestClient } from './helpers/test-app.js';

let t: TestApp;
let admin: TestClient;
beforeAll(async () => {
  t = await createTestApp();
  admin = await as.admin(t.app);
});
afterAll(() => t.close());

describe('tarif owner melalui API dan snapshot', () => {
  it.each([
    ['PAUD', 60_000], ['TK', 60_000], ['3 SD', 90_000],
    ['6 SD', 120_000], ['3 SMP', 150_000], ['3 SMA', 180_000],
  ])('%s: create siswa, approval, billing dan honor memakai potongan 91 menit', async (grade, gross) => {
    const student = studentSchema.parse((await admin.post('/admin/students', {
      full_name: `Siswa ${grade}`, grade, school_name: 'Sekolah uji',
    }).expect(201)).body);
    const input = {
      tutor_id: TUTOR_IDS.tutorA, student_id: student.id, subject_ids: [SUBJECT_IDS.matematika],
      lesson_date: '2026-11-12', start_time: '16:00', end_time: '17:31', learning_material: 'Latihan berhitung',
      learning_notes: 'Catatan latihan berhitung: siswa berlatih operasi hitung dengan cukup teliti dan menyelesaikan soal latihan tepat waktu.',
    };
    const created = await admin.post('/admin/attendance', input).expect(201);
    const id = created.body.id as string;
    await admin.patch(`/admin/attendance/${id}/validity`, { validity: 'valid' }).expect(200);
    const billing = billingResponseSchema.parse((await admin.get(`/admin/billing?period=2026-11&student_id=${student.id}`).expect(200)).body);
    expect(billing.students[0]?.total_amount).toBe(String(gross));
    const payroll = payrollPreviewResponseSchema.parse((await admin.get('/admin/payroll/preview?period=2026-11').expect(200)).body);
    expect(payroll.tutors.flatMap((tutor) => tutor.sessions).find((line) => line.session_id === id)).toMatchObject({
      gross_amount: String(gross), admin_fee: '20000', net_amount: String(gross - 20_000),
    });

    // Koreksi melewati batas berikutnya harus memperbarui kedua snapshot.
    await admin.put(`/admin/attendance/${id}`, { ...input, end_time: '18:31' }).expect(200);
    const [corrected] = await t.database.db.select().from(lessonSessions).where(eq(lessonSessions.id, id));
    expect(Number(corrected?.rate_amount_snapshot)).toBe(gross / 1.5 * 2.5);
    expect(Number(corrected?.admin_fee_snapshot)).toBe(30_000);
    await admin.patch(`/admin/attendance/${id}/validity`, { validity: 'rejected' }).expect(200);
    const [rejected] = await t.database.db.select().from(lessonSessions).where(eq(lessonSessions.id, id));
    expect(rejected).toMatchObject({ rate_amount_snapshot: null, admin_fee_snapshot: null });
    await admin.patch(`/admin/attendance/${id}/validity`, { validity: 'valid' }).expect(200);
    const [approvedAgain] = await t.database.db.select().from(lessonSessions).where(eq(lessonSessions.id, id));
    expect(Number(approvedAgain?.admin_fee_snapshot)).toBe(30_000);
  });

  it('validasi otomatis SMA mengunci tarif baru; snapshot histori tetap', async () => {
    // Aturan lama hanya dibuat di tes kompatibilitas ini, bukan fixture utama.
    await t.database.db.update(lessonSessions).set({ rate_amount_snapshot: '50000', admin_fee_snapshot: '10000' })
      .where(eq(lessonSessions.id, SESSION_IDS.s01));
    const student = studentSchema.parse((await admin.post('/admin/students', {
      full_name: 'Siswa SMA otomatis', grade: '1 SMA', school_name: 'Sekolah uji',
    }).expect(201)).body);
    const created = await admin.post('/admin/attendance', {
      tutor_id: TUTOR_IDS.tutorA, student_id: student.id, subject_ids: [SUBJECT_IDS.matematika],
      lesson_date: '2026-11-13', start_time: '16:00', end_time: '17:31', learning_material: 'Persamaan kuadrat',
      learning_notes: 'Catatan persamaan kuadrat: siswa memahami pemfaktoran dasar dan masih perlu latihan menentukan akar persamaan kuadrat.',
    }).expect(201);
    const id = created.body.id as string;
    await analyzeSession({
      db: t.database.db,
      detector: new FakeAnomalyDetector(),
      config: { durationOutlierMinutes: 180, durationMinMinutes: 30, lateStartAfter: '21:00', earlyStartBefore: '07:00' },
      timeoutMs: 2_000,
      logger: createLogger({ silent: true }),
    }, id);
    const [row] = await t.database.db.select().from(lessonSessions).where(eq(lessonSessions.id, id));
    expect(row?.status).toBe('approved');
    expect([Number(row?.rate_amount_snapshot), Number(row?.admin_fee_snapshot)]).toEqual([180_000, 20_000]);
    const [historical] = await t.database.db.select().from(lessonSessions).where(eq(lessonSessions.id, SESSION_IDS.s01));
    expect([Number(historical?.rate_amount_snapshot), Number(historical?.admin_fee_snapshot)]).toEqual([50_000, 10_000]);
  });
});
