import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  parentLearningSummariesResponseSchema,
  type LearningSummaryAiRequest,
  type LearningSummaryAiResponse,
} from '@mumtaz/contracts';
import { SESSION_IDS, STUDENT_IDS } from '@mumtaz/contracts/fixtures';
import { lessonSessions } from '../src/db/schema.js';
import { HttpLearningSummaryProvider } from '../src/integrations/learning-summary/http-provider.js';
import {
  LearningSummaryProviderError,
  type LearningSummaryProvider,
} from '../src/integrations/learning-summary/types.js';
import { as, createTestApp } from './helpers/test-app.js';

const SAMPLE_AI_RESPONSE: LearningSummaryAiResponse = {
  overall_status: 'good',
  summary: 'Ananda berkembang baik dalam memahami materi matematika bulan ini.',
  strengths: ['Cepat memahami penjumlahan bilangan dua digit'],
  areas_to_improve: ['Ketelitian pada pengurangan dengan meminjam'],
  subjects_covered: [
    { subject_name: 'Matematika', highlight: 'Penjumlahan lancar, perkalian dasar mulai dikuasai.' },
  ],
  model: 'gemini-2.5-flash',
};

function createSpyProvider(
  impl?: (
    input: LearningSummaryAiRequest,
    options: { signal: AbortSignal },
  ) => Promise<LearningSummaryAiResponse>,
) {
  const calls: LearningSummaryAiRequest[] = [];
  const provider: LearningSummaryProvider = {
    provider: 'genai_fastapi',
    model: 'fallback-model',
    async summarize(input, options) {
      calls.push(input);
      if (impl) return impl(input, options);
      return SAMPLE_AI_RESPONSE;
    },
  };
  return { provider, calls };
}

describe('HttpLearningSummaryProvider', () => {
  const validInput: LearningSummaryAiRequest = {
    scope: 'session',
    period: '2026-10',
    student_grade: '2 SD',
    sessions: [
      {
        lesson_date: '2026-10-01',
        subjects: ['Matematika'],
        duration_minutes: 90,
        learning_material: 'Penjumlahan bilangan dua digit',
        learning_notes: null,
      },
    ],
  };

  it('memanggil POST /v1/learning-summary/summarize dan memvalidasi response Zod', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_AI_RESPONSE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const provider = new HttpLearningSummaryProvider({
      baseUrl: 'http://internal-ai.local:8000/',
      model: 'fallback-model',
      fetchFn: fetchMock,
    });

    const controller = new AbortController();
    const res = await provider.summarize(validInput, { signal: controller.signal });

    expect(res).toEqual(SAMPLE_AI_RESPONSE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstFetchCall = fetchMock.mock.calls[0];
    expect(firstFetchCall).toBeDefined();
    expect(firstFetchCall?.[0]).toBe('http://internal-ai.local:8000/v1/learning-summary/summarize');
    expect(firstFetchCall?.[1]?.method).toBe('POST');
  });

  it('menolak HTTP non-2xx, invalid JSON, schema tidak sesuai, dan timeout tanpa membocorkan URL internal', async () => {
    const baseUrl = 'http://secret-ai-host.internal:9999';

    // HTTP 500
    const httpErrProvider = new HttpLearningSummaryProvider({
      baseUrl,
      model: null,
      fetchFn: vi.fn<typeof fetch>().mockResolvedValue(new Response('boom', { status: 500 })),
    });
    await expect(
      httpErrProvider.summarize(validInput, { signal: new AbortController().signal }),
    ).rejects.toMatchObject({
      name: 'LearningSummaryProviderError',
      kind: 'request_failed',
    });

    // Invalid JSON
    const badJsonProvider = new HttpLearningSummaryProvider({
      baseUrl,
      model: null,
      fetchFn: vi.fn<typeof fetch>().mockResolvedValue(new Response('not-json', { status: 200 })),
    });
    await expect(
      badJsonProvider.summarize(validInput, { signal: new AbortController().signal }),
    ).rejects.toMatchObject({
      kind: 'invalid_output',
    });

    // Invalid schema (includes forbidden parent_tips)
    const badSchemaProvider = new HttpLearningSummaryProvider({
      baseUrl,
      model: null,
      fetchFn: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ ...SAMPLE_AI_RESPONSE, parent_tips: ['tidak boleh'] }), {
          status: 200,
        }),
      ),
    });
    await expect(
      badSchemaProvider.summarize(validInput, { signal: new AbortController().signal }),
    ).rejects.toMatchObject({
      kind: 'invalid_output',
    });

    // Timeout / Abort
    const abortedController = new AbortController();
    abortedController.abort();
    const timeoutProvider = new HttpLearningSummaryProvider({
      baseUrl,
      model: null,
      fetchFn: vi.fn<typeof fetch>().mockRejectedValue(new DOMException('Aborted', 'AbortError')),
    });
    try {
      await timeoutProvider.summarize(validInput, { signal: abortedController.signal });
      expect.unreachable('harus throw timeout');
    } catch (err) {
      expect(err).toBeInstanceOf(LearningSummaryProviderError);
      expect((err as LearningSummaryProviderError).kind).toBe('timeout');
      expect((err as Error).message).not.toContain('secret-ai-host');
    }
  });
});

describe('Parent learning summaries API (integration)', () => {
  it('menegakkan RBAC: menolak bukan parent dan menolak anak yang tidak terhubung', async () => {
    const { provider } = createSpyProvider();
    const t = await createTestApp({ learningSummaryProvider: provider });
    try {
      const tutor = await as.tutorA(t.app);
      await tutor
        .get(`/parent/students/${STUDENT_IDS.murid1}/summaries?period=2026-10`)
        .expect(403);

      const parentB = await as.parentB(t.app);
      await parentB
        .get(`/parent/students/${STUDENT_IDS.murid1}/summaries?period=2026-10`)
        .expect(403);
      await parentB
        .post(`/parent/students/${STUDENT_IDS.murid1}/summaries/monthly`, { period: '2026-10' })
        .expect(403);
      await parentB
        .post(`/parent/students/${STUDENT_IDS.murid1}/sessions/${SESSION_IDS.s01}/summary`, {})
        .expect(403);
    } finally {
      await t.close();
    }
  });

  it('menghasilkan ringkasan bulanan & sesi, menyimpan cache, mengirim payload zero-PII, dan mendukung legacy learning_notes null', async () => {
    const { provider, calls } = createSpyProvider();
    const t = await createTestApp({ learningSummaryProvider: provider });
    try {
      const parentA = await as.parentA(t.app);

      // 1. Awalnya cache kosong
      const initial = await parentA
        .get(`/parent/students/${STUDENT_IDS.murid1}/summaries?period=2026-10`)
        .expect(200);
      const parsedInitial = parentLearningSummariesResponseSchema.parse(initial.body);
      expect(parsedInitial.approved_session_count).toBe(2);
      expect(parsedInitial.monthly).toBeNull();
      expect(parsedInitial.sessions).toEqual({});

      // 2. Generate bulanan pertama → cached: false
      const genMonthly1 = await parentA
        .post(`/parent/students/${STUDENT_IDS.murid1}/summaries/monthly`, { period: '2026-10' })
        .expect(200);
      expect(genMonthly1.body.cached).toBe(false);
      expect(genMonthly1.body.summary.overall_status).toBe('good');
      expect(genMonthly1.body.summary.is_stale).toBe(false);
      expect(genMonthly1.body.summary).not.toHaveProperty('provider');
      expect(genMonthly1.body.summary).not.toHaveProperty('model');
      expect(genMonthly1.body.summary).not.toHaveProperty('parent_tips');
      expect(calls).toHaveLength(1);

      // Pastikan payload keluar ke AI benar-benar zero-PII dan mendukung legacy null notes (s05)
      const monthlyPayload = calls[0];
      expect(monthlyPayload).toBeDefined();
      expect(monthlyPayload?.scope).toBe('monthly');
      expect(monthlyPayload?.period).toBe('2026-10');
      expect(monthlyPayload?.sessions).toHaveLength(2);
      expect(monthlyPayload?.sessions[1]?.learning_notes).toBeNull();
      const serialized = JSON.stringify(monthlyPayload);
      expect(serialized).not.toContain('Aisyah');
      expect(serialized).not.toContain('Farhan');
      expect(serialized).not.toContain(STUDENT_IDS.murid1);
      expect(serialized).not.toContain(SESSION_IDS.s01);

      // 3. Panggil generate bulanan kedua kali → cache hit (provider tidak dipanggil lagi)
      const genMonthly2 = await parentA
        .post(`/parent/students/${STUDENT_IDS.murid1}/summaries/monthly`, { period: '2026-10' })
        .expect(200);
      expect(genMonthly2.body.cached).toBe(true);
      expect(calls).toHaveLength(1);

      // 4. Generate per sesi (s05 punya learning_notes: null)
      const genSession1 = await parentA
        .post(`/parent/students/${STUDENT_IDS.murid1}/sessions/${SESSION_IDS.s05}/summary`, {})
        .expect(200);
      expect(genSession1.body.cached).toBe(false);
      expect(genSession1.body.lesson_session_id).toBe(SESSION_IDS.s05);
      expect(calls).toHaveLength(2);
      expect(calls[1]?.scope).toBe('session');
      expect(calls[1]?.sessions).toHaveLength(1);
      expect(calls[1]?.sessions[0]?.learning_notes).toBeNull();

      // Cache hit per sesi
      const genSession2 = await parentA
        .post(`/parent/students/${STUDENT_IDS.murid1}/sessions/${SESSION_IDS.s05}/summary`, {})
        .expect(200);
      expect(genSession2.body.cached).toBe(true);
      expect(calls).toHaveLength(2);

      // 5. GET /summaries sekarang mengembalikan keduanya dengan is_stale: false
      const afterGen = await parentA
        .get(`/parent/students/${STUDENT_IDS.murid1}/summaries?period=2026-10`)
        .expect(200);
      const parsedAfter = parentLearningSummariesResponseSchema.parse(afterGen.body);
      expect(parsedAfter.monthly?.is_stale).toBe(false);
      expect(parsedAfter.sessions[SESSION_IDS.s05]?.is_stale).toBe(false);
    } finally {
      await t.close();
    }
  });

  it('menandai is_stale: true setelah catatan diubah dan menimpa cache saat di-generate ulang', async () => {
    let callCount = 0;
    const { provider } = createSpyProvider(async () => {
      callCount += 1;
      return {
        ...SAMPLE_AI_RESPONSE,
        summary: `Ringkasan versi ${callCount}`,
      };
    });
    const t = await createTestApp({ learningSummaryProvider: provider });
    try {
      const parentA = await as.parentA(t.app);

      await parentA
        .post(`/parent/students/${STUDENT_IDS.murid1}/summaries/monthly`, { period: '2026-10' })
        .expect(200);
      await parentA
        .post(`/parent/students/${STUDENT_IDS.murid1}/sessions/${SESSION_IDS.s01}/summary`, {})
        .expect(200);

      // Ubah catatan sesi s01 (seperti revisi materi/catatan oleh Admin)
      await t.database.db
        .update(lessonSessions)
        .set({
          learning_notes:
            'Catatan diperbarui: siswa kini sudah sangat lancar mengerjakan pengurangan dengan meminjam pada seluruh soal latihan.',
        })
        .where(eq(lessonSessions.id, SESSION_IDS.s01));

      const staleRes = await parentA
        .get(`/parent/students/${STUDENT_IDS.murid1}/summaries?period=2026-10`)
        .expect(200);
      expect(staleRes.body.monthly.is_stale).toBe(true);
      expect(staleRes.body.sessions[SESSION_IDS.s01].is_stale).toBe(true);

      // Regenerate bulanan → cache ditimpa, cached: false, is_stale kembali false
      const regenMonthly = await parentA
        .post(`/parent/students/${STUDENT_IDS.murid1}/summaries/monthly`, { period: '2026-10' })
        .expect(200);
      expect(regenMonthly.body.cached).toBe(false);
      expect(regenMonthly.body.summary.summary).toBe('Ringkasan versi 3');
      expect(regenMonthly.body.summary.is_stale).toBe(false);

      // Regenerate sesi → cache ditimpa
      const regenSession = await parentA
        .post(`/parent/students/${STUDENT_IDS.murid1}/sessions/${SESSION_IDS.s01}/summary`, {})
        .expect(200);
      expect(regenSession.body.cached).toBe(false);
      expect(regenSession.body.summary.summary).toBe('Ringkasan versi 4');
    } finally {
      await t.close();
    }
  });

  it('tidak membocorkan cache lama bila semua sesi approved dihapus/ditolak dan menolak sesi non-approved (404)', async () => {
    const { provider } = createSpyProvider();
    const t = await createTestApp({ learningSummaryProvider: provider });
    try {
      const parentB = await as.parentB(t.app);

      // Sesi non-approved (s03 revision_requested, s04 rejected, s10 pending) → 404
      await parentB
        .post(`/parent/students/${STUDENT_IDS.murid3}/sessions/${SESSION_IDS.s03}/summary`, {})
        .expect(404);
      await parentB
        .post(`/parent/students/${STUDENT_IDS.murid3}/sessions/${SESSION_IDS.s10}/summary`, {})
        .expect(404);

      // Citra di 2026-10 hanya punya 1 sesi approved (s11); generate bulanan & sesi
      await parentB
        .post(`/parent/students/${STUDENT_IDS.murid3}/summaries/monthly`, { period: '2026-10' })
        .expect(200);
      await parentB
        .post(`/parent/students/${STUDENT_IDS.murid3}/sessions/${SESSION_IDS.s11}/summary`, {})
        .expect(200);

      // Admin menolak satu-satunya sesi approved (s11)
      await t.database.db
        .update(lessonSessions)
        .set({
          status: 'rejected',
          validity: 'rejected',
          rate_amount_snapshot: null,
          admin_fee_snapshot: null,
        })
        .where(eq(lessonSessions.id, SESSION_IDS.s11));

      // GET /summaries wajib mengembalikan monthly: null & sessions: {}
      const afterReject = await parentB
        .get(`/parent/students/${STUDENT_IDS.murid3}/summaries?period=2026-10`)
        .expect(200);
      expect(afterReject.body.approved_session_count).toBe(0);
      expect(afterReject.body.monthly).toBeNull();
      expect(afterReject.body.sessions).toEqual({});

      // POST monthly sekarang wajib 422
      await parentB
        .post(`/parent/students/${STUDENT_IDS.murid3}/summaries/monthly`, { period: '2026-10' })
        .expect(422);
    } finally {
      await t.close();
    }
  });

  it('mengembalikan 503 bila provider belum dikonfigurasi atau gagal sementara GET tetap 200', async () => {
    // 1. Provider null (belum dikonfigurasi)
    const tNull = await createTestApp({ learningSummaryProvider: null });
    try {
      const parentA = await as.parentA(tNull.app);
      await parentA
        .get(`/parent/students/${STUDENT_IDS.murid1}/summaries?period=2026-10`)
        .expect(200);
      const res503 = await parentA
        .post(`/parent/students/${STUDENT_IDS.murid1}/summaries/monthly`, { period: '2026-10' })
        .expect(503);
      expect(res503.body.error.code).toBe('INTEGRATION_UNAVAILABLE');
    } finally {
      await tNull.close();
    }

    // 2. Provider throw error (tidak boleh bocorkan URL/stack)
    const { provider: failingProvider } = createSpyProvider(async () => {
      throw new LearningSummaryProviderError('Layanan ringkasan AI gagal', 'request_failed');
    });
    const tFail = await createTestApp({ learningSummaryProvider: failingProvider });
    try {
      const parentA = await as.parentA(tFail.app);
      const resFail = await parentA
        .post(`/parent/students/${STUDENT_IDS.murid1}/sessions/${SESSION_IDS.s01}/summary`, {})
        .expect(503);
      expect(resFail.body.error.code).toBe('INTEGRATION_UNAVAILABLE');
      expect(resFail.body.error.message).toContain('Layanan ringkasan AI sedang tidak tersedia');
    } finally {
      await tFail.close();
    }
  });
});
