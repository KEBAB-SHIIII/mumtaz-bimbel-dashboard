import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FAKE_DETECTOR_PROVIDER, SESSION_IDS, STUDENT_IDS, SUBJECT_IDS } from '@mumtaz/contracts/fixtures';
import { anomalyFlags, lessonSessions } from '../src/db/schema.js';
import { createLogger } from '../src/lib/logger.js';
import type { AnomalyDetectionInput, AnomalyDetector } from '../src/integrations/anomaly/types.js';
import { analyzeSession, listPendingAnalysis, type AnomalyServiceDeps } from '../src/services/anomaly/anomaly-service.js';
import { AnomalyWorker } from '../src/services/anomaly/anomaly-worker.js';
import { FakeAnomalyDetector } from './fakes/fake-anomaly-detector.js';
import { as, createTestApp, type TestApp, type TestClient } from './helpers/test-app.js';

let t: TestApp;
let tutorA: TestClient;
let counter = 0;

beforeAll(async () => {
  t = await createTestApp();
  tutorA = await as.tutorA(t.app);
});
afterAll(() => t.close());

const logger = createLogger({ silent: true });
const deps = (detector: AnomalyDetector | null, timeoutMs = 2_000): AnomalyServiceDeps => ({
  db: t.database.db,
  detector,
  config: { durationOutlierMinutes: 180, lateStartAfter: '21:00' },
  timeoutMs,
  logger,
});

/** Jam mulai–selesai untuk durasi tertentu (hari yang sama). */
function lessonTimes(minutes: number, start = '16:00') {
  const total = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) + minutes;
  const pad = (n: number) => String(n).padStart(2, '0');
  return { start_time: start, end_time: `${pad(Math.floor(total / 60))}:${pad(total % 60)}` };
}

/** Submit lewat API (tanpa worker) → sesi baru `anomaly_analysis_status=pending`. */
async function submit(overrides: Record<string, unknown> = {}): Promise<string> {
  counter += 1;
  const res = await tutorA
    .post('/tutor/attendance', {
      client_submission_id: `00000000-0000-4000-9000-${String(700 + counter).padStart(12, '0')}`,
      student_id: STUDENT_IDS.murid2, subject_ids: [SUBJECT_IDS.bahasaInggris],
      lesson_date: '2026-11-03',
      ...lessonTimes(45),
      learning_material: 'Sesi uji anomali',
      ...overrides,
    })
    .expect(201);
  return res.body.session.id as string;
}

/** Duplikat persis dari s08 (tutor Farhan, Bima, Bahasa Inggris, 10 Okt, 60 menit). */
const duplicateOfS08 = { lesson_date: '2026-10-10', ...lessonTimes(60) };

const sessionRow = async (id: string) => (await t.database.db.select().from(lessonSessions).where(eq(lessonSessions.id, id)))[0];
const flagsOf = (id: string) => t.database.db.select().from(anomalyFlags).where(eq(anomalyFlags.lesson_session_id, id));

describe('analyzeSession — validasi oleh AI (baseline LLM, fake detector di test)', () => {
  it('ada kandidat tapi provider belum dikonfigurasi → not_evaluated, tetap menunggu validasi Admin', async () => {
    const id = await submit(duplicateOfS08);
    expect(await analyzeSession(deps(null), id)).toBe('not_evaluated');
    expect(await sessionRow(id)).toMatchObject({ anomaly_analysis_status: 'not_evaluated', status: 'pending', validity: null });
    expect(await flagsOf(id)).toEqual([]);
  });

  it('duplikat → Ditolak (ditahan dari rekap) + finding dengan sesi pembanding & label provider', async () => {
    const id = await submit(duplicateOfS08);
    expect(await analyzeSession(deps(new FakeAnomalyDetector()), id)).toBe('completed');
    expect(await sessionRow(id)).toMatchObject({ validity: 'rejected', status: 'rejected', rate_amount_snapshot: null, reviewed_by_user_id: null });
    expect((await sessionRow(id))?.validity_reason).toMatch(/FAKE/);

    const [flag] = await flagsOf(id);
    expect(flag).toMatchObject({
      finding_type: 'suspected_duplicate',
      related_lesson_session_id: SESSION_IDS.s08,
      severity: 'medium',
      provider: FAKE_DETECTOR_PROVIDER,
      review_status: 'pending_review',
    });
  });

  it('durasi > 180 menit → Perlu revisi (approval menunggu), tanpa snapshot', async () => {
    const id = await submit({ lesson_date: '2026-11-04', ...lessonTimes(240, '13:00') });
    await analyzeSession(deps(new FakeAnomalyDetector()), id);
    const row = await sessionRow(id);
    expect(row).toMatchObject({ validity: 'needs_revision', status: 'revision_requested', rate_amount_snapshot: null, reviewed_by_user_id: null });
    expect(row?.reviewed_at).not.toBeNull();
    expect((await flagsOf(id)).map((f) => f.finding_type)).toEqual(['duration_outlier']);
  });

  it('mulai di atas jam 21.00 → Perlu revisi (temuan late_start); tepat 21.00 tidak', async () => {
    const late = await submit({ lesson_date: '2026-11-07', ...lessonTimes(60, '21:15') });
    await analyzeSession(deps(new FakeAnomalyDetector()), late);
    expect(await sessionRow(late)).toMatchObject({ validity: 'needs_revision', status: 'revision_requested' });
    expect((await flagsOf(late)).map((f) => f.finding_type)).toEqual(['late_start']);

    const onTime = await submit({ lesson_date: '2026-11-08', ...lessonTimes(60, '21:00') });
    await analyzeSession(deps(new FakeAnomalyDetector()), onTime);
    expect(await sessionRow(onTime)).toMatchObject({ validity: 'valid', status: 'approved' });
  });

  it('detektor menilai tidak bermasalah → Valid, langsung dihitung (snapshot per jenjang)', async () => {
    const id = await submit(duplicateOfS08);
    expect(await analyzeSession(deps(new FakeAnomalyDetector('dismiss_all')), id)).toBe('completed');
    expect(await flagsOf(id)).toEqual([]);
    // Bima 5 SD, 60 menit → Rp70.000 kotor, potongan Rp10.000.
    const row = await sessionRow(id);
    expect(row).toMatchObject({ validity: 'valid', status: 'approved' });
    expect([Number(row?.rate_amount_snapshot), Number(row?.admin_fee_snapshot)]).toEqual([70000, 10000]);
  });

  it('tanpa kandidat → Valid tanpa memanggil model (hemat & PII minimum), juga tanpa provider', async () => {
    const detector = new FakeAnomalyDetector();
    const id = await submit({ lesson_date: '2026-11-05', ...lessonTimes(30) });
    expect(await analyzeSession(deps(detector), id)).toBe('completed');
    expect(detector.calls).toHaveLength(0);
    expect(await sessionRow(id)).toMatchObject({ validity: 'valid', status: 'approved', validity_reason: null });

    const noProvider = await submit({ lesson_date: '2026-11-09', ...lessonTimes(30) });
    expect(await analyzeSession(deps(null), noProvider)).toBe('completed');
    expect(await sessionRow(noProvider)).toMatchObject({ validity: 'valid', status: 'approved' });
  });

  it('keputusan Admin saat AI belum selesai tidak ditimpa hasil AI', async () => {
    const admin = await as.admin(t.app);
    const id = await submit({ lesson_date: '2026-11-10', ...lessonTimes(240, '13:00') });
    await admin.patch(`/admin/attendance/${id}/validity`, { validity: 'valid' }).expect(200);
    await analyzeSession(deps(new FakeAnomalyDetector()), id);
    expect(await sessionRow(id)).toMatchObject({ validity: 'valid', status: 'approved', anomaly_analysis_status: 'completed' });
  });

  it.each([
    ['error', 'provider error'],
    ['invalid_output', 'output tidak valid'],
  ] as const)('%s → failed, sesi tetap tersimpan (%s)', async (mode, _label) => {
    const id = await submit(duplicateOfS08);
    expect(await analyzeSession(deps(new FakeAnomalyDetector(mode)), id)).toBe('failed');
    expect(await sessionRow(id)).toMatchObject({ status: 'pending', validity: null, anomaly_analysis_status: 'failed' });
    expect(await flagsOf(id)).toEqual([]);
  });

  it('timeout provider → failed (tidak menggantung)', async () => {
    const id = await submit(duplicateOfS08);
    expect(await analyzeSession(deps(new FakeAnomalyDetector('hang'), 50), id)).toBe('failed');
  });

  it('sesi sudah dianalisis → skipped (idempoten)', async () => {
    const id = await submit(duplicateOfS08);
    await analyzeSession(deps(new FakeAnomalyDetector()), id);
    expect(await analyzeSession(deps(new FakeAnomalyDetector()), id)).toBe('skipped');
    expect(await flagsOf(id)).toHaveLength(1);
  });

  it('payload direvisi selama analisis → hasil lama dibuang (stale)', async () => {
    const id = await submit(duplicateOfS08);
    const revising: AnomalyDetector = {
      provider: 'test-revising',
      model: null,
      async detect(input: AnomalyDetectionInput) {
        // Simulasi revisi Tutor yang commit di tengah analisis.
        await t.database.db.update(lessonSessions).set({ submitted_at: new Date('2026-11-20T00:00:00Z') }).where(eq(lessonSessions.id, id));
        return new FakeAnomalyDetector().detect(input, { signal: new AbortController().signal });
      },
    };
    expect(await analyzeSession(deps(revising), id)).toBe('stale');
    expect((await sessionRow(id))?.anomaly_analysis_status).toBe('pending');
    expect(await flagsOf(id)).toEqual([]);
  });

  it('input ke detektor pseudonymous: tanpa nama, kontak, materi, atau kode akses', async () => {
    const detector = new FakeAnomalyDetector();
    const id = await submit({ ...duplicateOfS08, learning_material: 'Materi rahasia Bima' });
    await analyzeSession(deps(detector), id);
    const payload = JSON.stringify(detector.calls);
    expect(payload).not.toMatch(/Farhan|Noreen|Aisyah|Bima|Citra|Materi rahasia|@example\.test|0800000|MUMTAZ-DEMO/);
  });
});

describe('AnomalyWorker', () => {
  it('memproses setelah submit tanpa memblokir respons API, lalu menulis finding', async () => {
    let worker: AnomalyWorker | undefined;
    const app = await createTestApp({
      anomalyQueue: (database) => {
        worker = new AnomalyWorker(
          (sessionId) => analyzeSession({ ...deps(new FakeAnomalyDetector()), db: database.db }, sessionId),
          logger,
        );
        return worker;
      },
    });
    try {
      const tutor = await as.tutorA(app.app);
      const res = await tutor
        .post('/tutor/attendance', {
          client_submission_id: '00000000-0000-4000-9000-000000000800',
          student_id: STUDENT_IDS.murid2, subject_ids: [SUBJECT_IDS.bahasaInggris],
          ...duplicateOfS08,
          learning_material: 'Duplikat untuk worker',
        })
        .expect(201);
      expect(res.body.session.anomaly_analysis_status).toBe('pending');

      await worker?.onIdle();
      const id = res.body.session.id as string;
      const [row] = await app.database.db.select().from(lessonSessions).where(eq(lessonSessions.id, id));
      expect(row?.anomaly_analysis_status).toBe('completed');
      const flags = await app.database.db.select().from(anomalyFlags).where(eq(anomalyFlags.lesson_session_id, id));
      expect(flags.map((f) => f.finding_type)).toEqual(['suspected_duplicate']);
    } finally {
      await worker?.stop();
      await app.close();
    }
  });

  it('melanjutkan sesi pending saat startup (resume)', async () => {
    const pendingId = await submit({ lesson_date: '2026-11-06', ...lessonTimes(200, '13:00') });
    expect(await listPendingAnalysis(t.database.db)).toContain(pendingId);

    const worker = new AnomalyWorker((sessionId) => analyzeSession(deps(new FakeAnomalyDetector()), sessionId), logger);
    expect(await worker.resume(() => listPendingAnalysis(t.database.db))).toBeGreaterThan(0);
    await worker.onIdle();
    expect(await listPendingAnalysis(t.database.db)).toEqual([]);
    expect((await sessionRow(pendingId))?.anomaly_analysis_status).toBe('completed');
  });

  it('deduplikasi: enqueue ganda diproses sekali; enqueue saat berjalan → diulang sekali', async () => {
    const calls: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const worker = new AnomalyWorker(async (id) => {
      calls.push(id);
      if (calls.length === 1) await gate;
      return 'completed';
    }, logger);

    worker.enqueue('a');
    worker.enqueue('a'); // sedang berjalan → tandai rerun
    worker.enqueue('b');
    worker.enqueue('b'); // sudah di antrean → diabaikan
    release();
    await worker.onIdle();
    expect(calls).toEqual(['a', 'b', 'a']);
  });

  it('error analisis tidak menjatuhkan worker', async () => {
    const worker = new AnomalyWorker(async (id) => {
      if (id === 'rusak') throw new Error('boom');
      return 'completed';
    }, logger);
    worker.enqueue('rusak');
    worker.enqueue('sehat');
    await expect(worker.onIdle()).resolves.toBeUndefined();
  });
});
