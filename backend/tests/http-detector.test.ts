import { describe, expect, it } from 'vitest';
import { createAnomalyDetector } from '../src/integrations/anomaly/create-detector.js';
import { HttpAnomalyDetector } from '../src/integrations/anomaly/http-detector.js';
import { AnomalyProviderError, type AnomalyDetectionInput } from '../src/integrations/anomaly/types.js';
import { makeTestEnv } from './test-env.js';

const targetId = '00000000-0000-4000-8000-000000000009';
const relatedId = '00000000-0000-4000-8000-000000000008';

const input: AnomalyDetectionInput = {
  target: {
    id: targetId,
    tutor_id: '00000000-0000-4000-8002-000000000001',
    student_id: '00000000-0000-4000-8003-000000000002',
    subject_ids: ['00000000-0000-4000-8004-000000000003', '00000000-0000-4000-8004-000000000001'],
    lesson_date: '2026-10-10',
    start_time: '16:00',
    end_time: '20:00',
    learning_material: 'Materi privat yang tidak boleh dikirim',
    learning_notes: 'Catatan privat',
    next_focus: 'Fokus privat',
    duration_minutes: 240,
    submitted_at: '2026-10-10T10:05:00.000Z',
  },
  comparisons: [
    {
      id: relatedId,
      tutor_id: '00000000-0000-4000-8002-000000000001',
      student_id: '00000000-0000-4000-8003-000000000002',
      subject_ids: ['00000000-0000-4000-8004-000000000001'],
      lesson_date: '2026-10-10',
      start_time: '14:00',
      end_time: '15:00',
      learning_material: 'Materi pembanding',
      duration_minutes: 60,
      submitted_at: '2026-10-10T09:00:00.000Z',
    },
  ],
  candidates: [
    {
      finding_type: 'duration_outlier',
      signal: 'duration_above_threshold',
      related_lesson_session_id: null,
      default_severity: 'low',
    },
  ],
  config: {
    durationOutlierMinutes: 180,
    durationMinMinutes: 30,
    lateStartAfter: '21:00',
    earlyStartBefore: '07:00',
  },
};

const signal = new AbortController().signal;

describe('HttpAnomalyDetector (adapter FastAPI ML)', () => {
  it('mengirim payload 8 field tanpa materi/catatan privat & tanpa candidates, lalu mem-parsing response FastAPI', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchFn: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(
        JSON.stringify({
          validity: 'needs_revision',
          validity_reason: 'Durasi sesi 240 menit melebihi batas maksimal 180 menit.',
          findings: [
            {
              lesson_session_id: targetId,
              related_lesson_session_id: null,
              is_anomaly: true,
              finding_type: 'duration_outlier',
              severity: 'low',
              reason: 'Durasi melebihi 180 menit.',
              evidence_summary: 'Durasi tercatat 240 menit.',
              suggested_action: 'review',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const detector = new HttpAnomalyDetector({
      baseUrl: 'http://localhost:8000/',
      model: 'anomaly-lgbm-v1',
      fetchFn,
    });

    const result = await detector.detect(input, { signal });
    expect(detector.provider).toBe('ml_fastapi');
    expect(detector.model).toBe('anomaly-lgbm-v1');
    expect(calls[0]?.url).toBe('http://localhost:8000/v1/anomaly/analyze');

    const sent = calls[0]?.body as Record<string, unknown>;
    expect(sent).not.toHaveProperty('candidates');
    expect(sent.config).toEqual({
      durationOutlierMinutes: 180,
      durationMinMinutes: 30,
      lateStartAfter: '21:00',
      earlyStartBefore: '07:00',
    });

    // Pastikan field privat tidak ikut terkirim dan subject_ids sudah terurut.
    const rawSent = JSON.stringify(sent);
    expect(rawSent).not.toMatch(/learning_material|learning_notes|next_focus|end_time|Materi privat|Catatan privat/);
    expect((sent.target as { subject_ids: string[] }).subject_ids).toEqual([
      '00000000-0000-4000-8004-000000000001',
      '00000000-0000-4000-8004-000000000003',
    ]);

    expect(result.validity).toBe('needs_revision');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.finding_type).toBe('duration_outlier');
  });

  it('HTTP non-2xx → AnomalyProviderError request_failed', async () => {
    const detector = new HttpAnomalyDetector({
      baseUrl: 'http://localhost:8000',
      model: 'anomaly-lgbm-v1',
      fetchFn: async () => new Response('Internal Server Error', { status: 500 }),
    });
    const error = await detector.detect(input, { signal }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AnomalyProviderError);
    expect(error).toMatchObject({ reason: 'request_failed', message: 'Service AI mengembalikan HTTP 500' });
  });

  it('response bukan JSON atau tidak sesuai kontrak → AnomalyProviderError invalid_output', async () => {
    const badJson = new HttpAnomalyDetector({
      baseUrl: 'http://localhost:8000',
      model: null,
      fetchFn: async () => new Response('bukan json', { status: 200 }),
    });
    expect(await badJson.detect(input, { signal }).catch((e: unknown) => e)).toMatchObject({ reason: 'invalid_output' });

    const badSchema = new HttpAnomalyDetector({
      baseUrl: 'http://localhost:8000',
      model: null,
      fetchFn: async () => new Response(JSON.stringify({ validity: 'approved', validity_reason: 'ok', findings: [] }), { status: 200 }),
    });
    expect(await badSchema.detect(input, { signal }).catch((e: unknown) => e)).toMatchObject({ reason: 'invalid_output' });
  });

  it('abort/timeout → AnomalyProviderError timeout; network error → request_failed', async () => {
    const failing = new HttpAnomalyDetector({
      baseUrl: 'http://localhost:8000',
      model: null,
      fetchFn: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    expect(await failing.detect(input, { signal }).catch((e: unknown) => e)).toMatchObject({ reason: 'request_failed' });

    const controller = new AbortController();
    controller.abort();
    expect(await failing.detect(input, { signal: controller.signal }).catch((e: unknown) => e)).toMatchObject({ reason: 'timeout' });
  });
});

describe('createAnomalyDetector (pemilihan provider dari env)', () => {
  it('memilih HttpAnomalyDetector bila ANOMALY_SERVICE_URL diisi', () => {
    const detector = createAnomalyDetector(
      makeTestEnv({
        ANOMALY_SERVICE_URL: 'http://localhost:8000',
        ANOMALY_MODEL_NAME: 'anomaly-lgbm-v1',
      }),
    );
    expect(detector).toBeInstanceOf(HttpAnomalyDetector);
    expect(detector?.provider).toBe('ml_fastapi');
    expect(detector?.model).toBe('anomaly-lgbm-v1');
  });

  it('mengembalikan null (not_evaluated) bila ANOMALY_SERVICE_URL kosong', () => {
    expect(createAnomalyDetector(makeTestEnv())).toBeNull();
    expect(createAnomalyDetector(makeTestEnv({ ANOMALY_SERVICE_URL: '' }))).toBeNull();
  });
});
