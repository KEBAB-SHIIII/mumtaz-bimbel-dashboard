import { and, eq, ne } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { STUDENT_IDS, SUBJECT_IDS } from '@mumtaz/contracts/fixtures';
import { anomalyFlags, lessonSessions } from '../src/db/schema.js';
import { createLogger } from '../src/lib/logger.js';
import { analyzeSession } from '../src/services/anomaly/anomaly-service.js';
import { AnomalyWorker } from '../src/services/anomaly/anomaly-worker.js';
import { FakeAnomalyDetector } from './fakes/fake-anomaly-detector.js';
import { FIXED_NOW, as, createTestApp, type TestApp, type TestClient } from './helpers/test-app.js';

/**
 * Sesi B punya temuan yang merujuk sesi A (mis. duplikat/bentrok). Bila A direvisi Tutor,
 * dikoreksi Admin, atau dihapus, temuan B yang merujuk A sudah basi: B harus dianalisis ulang.
 */
let t: TestApp;
let worker: AnomalyWorker | undefined;
let tutor: TestClient;
let admin: TestClient;
let counter = 0;
// Jam bergerak agar urutan `submitted_at` deterministik (A selalu lebih dulu dari B).
let clock = FIXED_NOW.getTime();

beforeAll(async () => {
  t = await createTestApp({
    now: () => new Date((clock += 1_000)),
    anomalyQueue: (database) => {
      worker = new AnomalyWorker(
        (id) =>
          analyzeSession(
            {
              db: database.db,
              detector: new FakeAnomalyDetector(),
              config: { durationOutlierMinutes: 180, durationMinMinutes: 30, lateStartAfter: '21:00', earlyStartBefore: '07:00' },
              timeoutMs: 2_000,
              logger: createLogger({ silent: true }),
            },
            id,
          ),
        createLogger({ silent: true }),
      );
      return worker;
    },
  });
  tutor = await as.tutorA(t.app);
  admin = await as.admin(t.app);
});
afterAll(async () => {
  await worker?.stop();
  await t.close();
});

const editable = (lesson_date: string, start_time: string, end_time: string) => ({
  student_id: STUDENT_IDS.murid2,
  subject_ids: [SUBJECT_IDS.bahasaInggris],
  lesson_date,
  start_time,
  end_time,
  learning_material: 'Sesi uji dependen',
  learning_notes:
    'Catatan pembelajaran untuk pengujian sesi dependen: siswa mengikuti materi bahasa Inggris dasar dan berlatih menyusun kalimat sederhana.',
});

async function submit(lessonDate: string, start: string, end: string): Promise<string> {
  counter += 1;
  const res = await tutor
    .post('/tutor/attendance', {
      client_submission_id: `00000000-0000-4000-9000-${String(900 + counter).padStart(12, '0')}`,
      ...editable(lessonDate, start, end),
    })
    .expect(201);
  await worker?.onIdle();
  return res.body.session.id as string;
}

const row = async (id: string) => (await t.database.db.select().from(lessonSessions).where(eq(lessonSessions.id, id)))[0];
const activeFlags = (id: string) =>
  t.database.db
    .select()
    .from(anomalyFlags)
    .where(and(eq(anomalyFlags.lesson_session_id, id), ne(anomalyFlags.review_status, 'superseded')));

/** A = 240 menit (Perlu revisi); B = duplikat persis A → Ditolak dengan temuan merujuk A. */
async function duplicatePair(lessonDate: string) {
  const a = await submit(lessonDate, '13:00', '17:00');
  const b = await submit(lessonDate, '13:00', '17:00');
  expect(await row(a)).toMatchObject({ validity: 'needs_revision' });
  expect(await row(b)).toMatchObject({ validity: 'rejected' });
  expect((await activeFlags(b)).some((f) => f.related_lesson_session_id === a)).toBe(true);
  return { a, b };
}

describe('analisis ulang sesi dependen', () => {
  it('Tutor merevisi A → temuan B yang merujuk A superseded dan B dianalisis ulang', async () => {
    const { a, b } = await duplicatePair('2026-11-12');
    const submittedB = (await row(b))?.submitted_at;

    await tutor.patch(`/tutor/me/attendance/${a}`, editable('2026-11-12', '13:00', '14:00')).expect(200);
    await worker?.onIdle();

    expect(await row(a)).toMatchObject({ validity: 'valid' });
    // B tidak lagi duplikat A; tersisa temuan miliknya sendiri (durasi 240 menit).
    expect(await row(b)).toMatchObject({ validity: 'needs_revision', anomaly_analysis_status: 'completed' });
    expect((await row(b))?.submitted_at).toEqual(submittedB);
    expect((await activeFlags(b)).map((f) => f.finding_type)).toEqual(['duration_outlier']);
  });

  it('Admin menghapus A → B dianalisis ulang', async () => {
    const { a, b } = await duplicatePair('2026-11-13');

    await admin.delete(`/admin/attendance/${a}`).expect(204);
    await worker?.onIdle();

    expect(await row(b)).toMatchObject({ validity: 'needs_revision' });
    expect((await activeFlags(b)).map((f) => f.finding_type)).toEqual(['duration_outlier']);
  });

  it('Admin mengoreksi data A → B dianalisis ulang', async () => {
    const { a, b } = await duplicatePair('2026-11-14');

    await admin
      .put(`/admin/attendance/${a}`, { tutor_id: (await row(a))?.tutor_id, ...editable('2026-11-14', '08:00', '09:00') })
      .expect(200);
    await worker?.onIdle();

    expect(await row(b)).toMatchObject({ validity: 'needs_revision' });
    expect((await activeFlags(b)).map((f) => f.finding_type)).toEqual(['duration_outlier']);
  });

  it('keputusan Admin pada B tidak disentuh', async () => {
    const { a, b } = await duplicatePair('2026-11-11');
    await admin.patch(`/admin/attendance/${b}/validity`, { validity: 'rejected' }).expect(200);
    const decided = await row(b);

    await tutor.patch(`/tutor/me/attendance/${a}`, editable('2026-11-11', '13:00', '14:00')).expect(200);
    await worker?.onIdle();

    expect(await row(b)).toMatchObject({ validity: 'rejected', reviewed_by_user_id: decided?.reviewed_by_user_id });
    expect((await activeFlags(b)).some((f) => f.related_lesson_session_id === a)).toBe(true);
  });
});
