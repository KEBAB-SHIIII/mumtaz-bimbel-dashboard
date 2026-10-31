import type { GenerateContentParameters } from '@google/genai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { GeminiAnomalyDetector, type GenerateContentClient } from '../src/integrations/anomaly/gemini-detector.js';
import { toGeminiJsonSchema } from '../src/integrations/anomaly/gemini-schema.js';
import { humanizeAliases, pseudonymize } from '../src/integrations/anomaly/pseudonymize.js';
import { AnomalyProviderError, type AnomalyDetectionInput } from '../src/integrations/anomaly/types.js';

const target = {
  id: '00000000-0000-4000-8000-000000000009',
  tutor_id: '00000000-0000-4000-8002-000000000001',
  student_id: '00000000-0000-4000-8003-000000000002',
  subject_id: '00000000-0000-4000-8004-000000000002',
  lesson_date: '2026-10-10',
  duration_minutes: 240,
  submitted_at: '2026-10-10T10:05:00.000Z',
};
const related = { ...target, id: '00000000-0000-4000-8000-000000000008', duration_minutes: 240, submitted_at: '2026-10-10T10:00:00.000Z' };

const input: AnomalyDetectionInput = {
  target,
  comparisons: [related],
  candidates: [
    { finding_type: 'suspected_duplicate', signal: 'same_tutor_student_subject_date_duration', related_lesson_session_id: related.id, default_severity: 'medium' },
    { finding_type: 'duration_outlier', signal: 'duration_above_threshold', related_lesson_session_id: null, default_severity: 'low' },
  ],
  config: { durationOutlierMinutes: 180 },
};

/** Klien Gemini palsu: merekam request dan mengembalikan teks JSON yang ditentukan test. */
function fakeClient(text: string | undefined | ((params: GenerateContentParameters) => Promise<string>)) {
  const requests: GenerateContentParameters[] = [];
  const client: GenerateContentClient = {
    async generateContent(params) {
      requests.push(params);
      return { text: typeof text === 'function' ? await text(params) : text };
    },
  };
  return { client, requests };
}

const validOutput = {
  classifications: [
    { candidate_ref: 'C1', is_anomaly: true, severity: 'medium', reason: 'S0 identik dengan S1 pada tanggal yang sama.', evidence_summary: 'Tutor T1, murid P1, durasi sama.' },
    { candidate_ref: 'C2', is_anomaly: false, severity: 'low', reason: 'Durasi panjang masih wajar untuk persiapan ujian.', evidence_summary: '' },
  ],
  additional_findings: [],
};

const signal = new AbortController().signal;

describe('pseudonymize', () => {
  it('mengganti semua UUID dengan alias; hanya tanggal & durasi yang dikirim', () => {
    const { payload, sessionIdOf } = pseudonymize(input);
    const raw = JSON.stringify(payload);
    expect(raw).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(payload.target).toEqual({ ref: 'S0', tutor: 'T1', student: 'P1', subject: 'M1', lesson_date: '2026-10-10', duration_minutes: 240 });
    expect(payload.candidates[0]).toMatchObject({ ref: 'C1', related: 'S1' });
    expect(sessionIdOf.get('S1')).toBe(related.id);
  });

  it('alias pada teks model diganti frasa netral', () => {
    expect(humanizeAliases('S0 mirip S12 (tutor T1, siswa P3, mapel M2, C1)')).toBe(
      'sesi ini mirip sesi pembanding (tutor tutor, siswa siswa, mapel mata pelajaran, kandidat)',
    );
  });
});

describe('GeminiAnomalyDetector (klien di-mock, tanpa credential)', () => {
  it('meminta JSON terstruktur (schema + temperature 0) dan memetakan alias ke ID', async () => {
    const { client, requests } = fakeClient(JSON.stringify(validOutput));
    const detector = new GeminiAnomalyDetector({ model: 'gemini-test-model', client });
    const findings = await detector.detect(input, { signal });

    const config = requests[0]?.config;
    expect(requests[0]?.model).toBe('gemini-test-model');
    expect(config).toMatchObject({ responseMimeType: 'application/json', temperature: 0 });
    expect(config?.responseJsonSchema).toBeTruthy();
    expect(JSON.stringify(requests[0]?.contents)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);

    expect(findings).toEqual([
      {
        lesson_session_id: target.id,
        related_lesson_session_id: related.id,
        is_anomaly: true,
        finding_type: 'suspected_duplicate',
        severity: 'medium',
        reason: 'sesi ini identik dengan sesi pembanding pada tanggal yang sama.',
        evidence_summary: 'Tutor tutor, murid siswa, durasi sama.',
        suggested_action: 'review',
      },
      expect.objectContaining({ finding_type: 'duration_outlier', is_anomaly: false, evidence_summary: null }),
    ]);
    expect(detector.provider).toBe('gemini');
  });

  it('additional unusual_pattern dipetakan; referensi sesi asing ditolak', async () => {
    const withExtra = {
      ...validOutput,
      additional_findings: [{ finding_type: 'unusual_pattern', related_ref: 'S1', severity: 'low', reason: 'Dua sesi berurutan.', evidence_summary: '' }],
    };
    // S1 sudah tercakup kandidat duplikasi → temuan tambahan yang sama dibuang (tidak berulang).
    const redundant = await new GeminiAnomalyDetector({ model: 'm', client: fakeClient(JSON.stringify(withExtra)).client }).detect(input, { signal });
    expect(redundant.map((f) => f.finding_type)).toEqual(['suspected_duplicate', 'duration_outlier']);

    const self = { ...withExtra, additional_findings: [{ ...withExtra.additional_findings[0], related_ref: 'S0' }] };
    const selfResult = await new GeminiAnomalyDetector({ model: 'm', client: fakeClient(JSON.stringify(self)).client }).detect(input, { signal });
    expect(selfResult.at(-1)).toMatchObject({ finding_type: 'unusual_pattern', related_lesson_session_id: null });

    const bad = { ...withExtra, additional_findings: [{ ...withExtra.additional_findings[0], related_ref: 'S9' }] };
    await expect(new GeminiAnomalyDetector({ model: 'm', client: fakeClient(JSON.stringify(bad)).client }).detect(input, { signal })).rejects.toMatchObject({ reason: 'invalid_output' });
  });

  it.each([
    ['bukan JSON', 'bukan json'],
    ['schema salah', JSON.stringify({ classifications: [{ candidate_ref: 'C1' }], additional_findings: [] })],
    ['kandidat tidak lengkap', JSON.stringify({ ...validOutput, classifications: validOutput.classifications.slice(0, 1) })],
    ['kandidat tak dikenal', JSON.stringify({ ...validOutput, classifications: [...validOutput.classifications, { ...validOutput.classifications[0], candidate_ref: 'C9' }] })],
    ['kandidat ganda', JSON.stringify({ ...validOutput, classifications: [validOutput.classifications[0], validOutput.classifications[0]] })],
    ['output kosong', undefined],
  ])('%s → AnomalyProviderError invalid_output (bukan hasil parsial)', async (_name, text) => {
    const detector = new GeminiAnomalyDetector({ model: 'm', client: fakeClient(text).client });
    const error = await detector.detect(input, { signal }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AnomalyProviderError);
    expect(error).toMatchObject({ reason: 'invalid_output' });
  });

  it('request gagal → request_failed; dibatalkan → timeout', async () => {
    const failing: GenerateContentClient = { generateContent: () => Promise.reject(new Error('quota exceeded: key=SECRET')) };
    const error = await new GeminiAnomalyDetector({ model: 'm', client: failing }).detect(input, { signal }).catch((e: unknown) => e);
    expect(error).toMatchObject({ reason: 'request_failed' });
    expect((error as Error).message).not.toContain('SECRET');

    const controller = new AbortController();
    controller.abort();
    const aborted = await new GeminiAnomalyDetector({ model: 'm', client: failing }).detect(input, { signal: controller.signal }).catch((e: unknown) => e);
    expect(aborted).toMatchObject({ reason: 'timeout' });
  });
});

describe('toGeminiJsonSchema', () => {
  it('hanya keyword yang didukung Gemini; const → enum', () => {
    const schema = toGeminiJsonSchema(
      z.object({ ref: z.string().regex(/^C\d+$/).min(1).max(9), kind: z.literal('unusual_pattern'), list: z.array(z.boolean()).max(3) }),
    );
    const raw = JSON.stringify(schema);
    expect(raw).not.toMatch(/"\$schema"|"pattern"|"minLength"|"maxLength"|"const"/);
    expect(schema).toMatchObject({
      type: 'object',
      properties: { kind: { type: 'string', enum: ['unusual_pattern'] }, list: { type: 'array', maxItems: 3 } },
      required: ['ref', 'kind', 'list'],
    });
  });
});

describe('retry error transien', () => {
  it('503 lalu sukses → satu retry berhasil', async () => {
    let calls = 0;
    const client: GenerateContentClient = {
      generateContent: async () => {
        calls += 1;
        if (calls === 1) throw Object.assign(new Error('unavailable'), { status: 503 });
        return { text: JSON.stringify(validOutput) };
      },
    };
    const findings = await new GeminiAnomalyDetector({ model: 'm', client }).detect(input, { signal });
    expect(calls).toBe(2);
    expect(findings).toHaveLength(2);
  });

  it('400 (error permanen) tidak di-retry dan menyebut status HTTP saja', async () => {
    let calls = 0;
    const client: GenerateContentClient = {
      generateContent: async () => {
        calls += 1;
        throw Object.assign(new Error('bad request with payload'), { status: 400 });
      },
    };
    const error = await new GeminiAnomalyDetector({ model: 'm', client }).detect(input, { signal }).catch((e: unknown) => e);
    expect(calls).toBe(1);
    expect(error).toMatchObject({ reason: 'request_failed', message: 'Permintaan ke provider anomali gagal (HTTP 400)' });
  });
});
