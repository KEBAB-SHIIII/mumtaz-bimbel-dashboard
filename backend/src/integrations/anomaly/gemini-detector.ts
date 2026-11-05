import { GoogleGenAI, type GenerateContentParameters } from '@google/genai';
import { z } from 'zod';
import { findingSeveritySchema, sessionValiditySchema, type AnomalyFindingCandidate } from '@mumtaz/contracts';
import { toGeminiJsonSchema } from './gemini-schema.js';
import { humanizeAliases, pseudonymize } from './pseudonymize.js';
import { AnomalyProviderError, type AnomalyDetection, type AnomalyDetectionInput, type AnomalyDetector } from './types.js';

/** Bentuk output yang diminta dari model (juga dikirim sebagai JSON Schema). */
const modelOutputSchema = z.object({
  validity: sessionValiditySchema,
  validity_reason: z.string().min(1).max(600),
  classifications: z.array(
    z.object({
      candidate_ref: z.string().regex(/^C\d+$/),
      is_anomaly: z.boolean(),
      severity: findingSeveritySchema,
      reason: z.string().min(1).max(600),
      evidence_summary: z.string().max(600),
    }),
  ),
  additional_findings: z
    .array(
      z.object({
        finding_type: z.literal('unusual_pattern'),
        related_ref: z.string().regex(/^S\d+$/).nullable(),
        severity: findingSeveritySchema,
        reason: z.string().min(1).max(600),
        evidence_summary: z.string().max(600),
      }),
    )
    .max(3),
});

const RESPONSE_JSON_SCHEMA = toGeminiJsonSchema(modelOutputSchema);

/** Status HTTP transien yang layak dicoba ulang sekali (dalam batas waktu yang sama). */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAY_MS = 500;

const SYSTEM_INSTRUCTION = [
  'Anda memvalidasi catatan sesi les sebuah bimbel dan memberi label validitas data.',
  'Label "validity" (pilih satu):',
  '- "rejected": data duplikat — sesi yang sama sudah tercatat (tutor, siswa, mapel, tanggal, jam mulai, jam selesai, durasi, materi, catatan pembelajaran, dan fokus berikutnya semuanya sama; kandidat sudah diverifikasi backend tanpa mengirim teks privat ke model).',
  '- "needs_revision": durasi melebihi duration_outlier_minutes, ATAU jam mulai sama dengan atau setelah late_start_after, ATAU kejanggalan lain yang perlu dikonfirmasi tutor.',
  '- "valid": tidak ada masalah.',
  'Kemiripan data bukan bukti kecurangan: siswa yang sama dengan tutor lain di hari yang sama bisa sah. Gunakan bahasa netral.',
  'Admin dapat mengoreksi label Anda; tulis "validity_reason" sebagai penjelasan singkat yang bisa dibaca tutor.',
  'Data memakai alias (S0 = sesi yang dianalisis, S1.. = pembanding, T/P/M = tutor/siswa/mapel).',
  'Klasifikasikan SETIAP kandidat pada field "candidates" tepat satu kali (candidate_ref).',
  'additional_findings wajib kosong. Hanya klasifikasikan kandidat terverifikasi pada sesi S0; masalah antar-pembanding bukan masalah S0.',
  'related_ref pada additional_findings diisi alias sesi pembanding (S1, S2, ...) atau null; jangan isi S0.',
  'Tulis validity_reason, reason, dan evidence_summary dalam Bahasa Indonesia, maksimal dua kalimat, tanpa menyebut alias.',
].join('\n');

/** Antarmuka minimal klien Gemini (di-inject agar dapat dites tanpa credential). */
export interface GenerateContentClient {
  generateContent(params: GenerateContentParameters): Promise<{ text?: string | undefined }>;
}

export interface GeminiDetectorOptions {
  model: string;
  client: GenerateContentClient;
}

/**
 * Detektor live berbasis Gemini (`@google/genai`) — baseline LLM untuk label validitas (revisi PM),
 * akan diganti model tim AI. Payload dipseudonimkan; output divalidasi Zod dan dipetakan kembali ke ID internal. Output yang tidak
 * lengkap/tidak dikenal dianggap invalid (status `failed`), bukan hasil parsial.
 */
export class GeminiAnomalyDetector implements AnomalyDetector {
  readonly provider = 'gemini';
  readonly model: string;
  private readonly client: GenerateContentClient;

  constructor({ model, client }: GeminiDetectorOptions) {
    this.model = model;
    this.client = client;
  }

  async detect(input: AnomalyDetectionInput, { signal }: { signal: AbortSignal }): Promise<AnomalyDetection> {
    const { payload, candidateIndexOf } = pseudonymize(input);

    const request: GenerateContentParameters = {
      model: this.model,
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseJsonSchema: RESPONSE_JSON_SCHEMA,
        temperature: 0,
        abortSignal: signal,
      },
    };
    const text = await this.generateWithRetry(request, signal);

    const output = parseOutput(text);
    const classified = new Set<number>();
    const findings: AnomalyFindingCandidate[] = [];

    for (const item of output.classifications) {
      const index = candidateIndexOf.get(item.candidate_ref);
      const candidate = index === undefined ? undefined : input.candidates[index];
      if (index === undefined || !candidate || classified.has(index)) {
        throw new AnomalyProviderError('Output model merujuk kandidat yang tidak dikenal', 'invalid_output');
      }
      classified.add(index);
      findings.push({
        lesson_session_id: input.target.id,
        related_lesson_session_id: candidate.related_lesson_session_id,
        is_anomaly: item.is_anomaly,
        finding_type: candidate.finding_type,
        severity: item.severity,
        reason: humanizeAliases(item.reason),
        evidence_summary: humanizeAliases(item.evidence_summary) || null,
        suggested_action: 'review',
      });
    }
    if (classified.size !== input.candidates.length) {
      throw new AnomalyProviderError('Output model tidak mengklasifikasikan semua kandidat', 'invalid_output');
    }

    // Tidak ada aturan bukti untuk unusual_pattern: narasi bebas tidak boleh
    // menjadi temuan atau menentukan status sesi target.
    const active = findings.filter((finding) => finding.is_anomaly);
    const exactDuplicate = active.some((finding) => finding.finding_type === 'suspected_duplicate' &&
      input.candidates.some((candidate) => candidate.signal === 'same_tutor_student_subject_date_duration' &&
        candidate.related_lesson_session_id === finding.related_lesson_session_id));
    const validity = exactDuplicate ? 'rejected' : active.length ? 'needs_revision' : 'valid';
    const validity_reason = output.additional_findings.length || validity !== output.validity
      ? (active.map((finding) => finding.reason).join(' ').slice(0, 600) || 'Tidak ditemukan anomali pada sesi ini.')
      : humanizeAliases(output.validity_reason);
    return { findings, validity, validity_reason };
  }

  /** Satu retry untuk error transien (429/5xx); pesan error tidak memuat payload/credential. */
  private async generateWithRetry(request: GenerateContentParameters, signal: AbortSignal): Promise<string | undefined> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return (await this.client.generateContent(request)).text;
      } catch (error) {
        if (signal.aborted) throw new AnomalyProviderError('Provider anomali melebihi batas waktu', 'timeout');
        const status = httpStatusOf(error);
        if (attempt === 0 && status !== undefined && RETRYABLE_STATUS.has(status)) {
          await delay(RETRY_DELAY_MS, signal).catch(() => undefined);
          if (!signal.aborted) continue;
          throw new AnomalyProviderError('Provider anomali melebihi batas waktu', 'timeout');
        }
        throw new AnomalyProviderError(`Permintaan ke provider anomali gagal${status ? ` (HTTP ${status})` : ''}`, 'request_failed');
      }
    }
  }
}

function httpStatusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    }, { once: true });
  });
}

function parseOutput(text: string | undefined): z.output<typeof modelOutputSchema> {
  if (!text) throw new AnomalyProviderError('Output model kosong', 'invalid_output');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AnomalyProviderError('Output model bukan JSON valid', 'invalid_output');
  }
  const result = modelOutputSchema.safeParse(json);
  if (!result.success) throw new AnomalyProviderError('Output model tidak sesuai schema', 'invalid_output');
  return result.data;
}

/** Klien produksi; timeout HTTP dibatasi selain AbortSignal dari service. */
export function createGeminiClient(apiKey: string, timeoutMs: number): GenerateContentClient {
  return new GoogleGenAI({ apiKey, httpOptions: { timeout: timeoutMs } }).models;
}
