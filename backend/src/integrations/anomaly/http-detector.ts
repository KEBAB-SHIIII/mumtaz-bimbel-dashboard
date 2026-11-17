import { z } from 'zod';
import { anomalyFindingCandidateSchema, sessionValiditySchema } from '@mumtaz/contracts';
import {
  AnomalyProviderError,
  type AnomalyDetection,
  type AnomalyDetectionInput,
  type AnomalyDetector,
  type AnomalySessionSnapshot,
} from './types.js';

/**
 * Schema validasi untuk JSON response dari service FastAPI (`POST /v1/anomaly/analyze`).
 * Output AI tidak pernah dipercaya mentah — wajib lolos validasi Zod sebelum ditulis ke DB.
 */
const fastApiResponseSchema = z.object({
  validity: sessionValiditySchema,
  validity_reason: z.string().min(1).max(600),
  findings: z.array(anomalyFindingCandidateSchema),
});

/**
 * Menyaring snapshot sesi agar hanya mengirim 8 field terstruktur sesuai kontrak API FastAPI.
 * Data privat tutor/siswa (`learning_material`, `learning_notes`, `next_focus`, `end_time`)
 * sengaja dibuang demi privasi (PII minimum) dan efisiensi payload.
 * `subject_ids` diurutkan agar pencocokan duplikat di FastAPI selalu konsisten.
 */
function toPublicSnapshot(snapshot: AnomalySessionSnapshot) {
  return {
    id: snapshot.id,
    tutor_id: snapshot.tutor_id,
    student_id: snapshot.student_id,
    subject_ids: [...snapshot.subject_ids].sort(),
    lesson_date: snapshot.lesson_date,
    start_time: snapshot.start_time,
    duration_minutes: snapshot.duration_minutes,
    submitted_at: snapshot.submitted_at,
  };
}

export interface HttpAnomalyDetectorOptions {
  /** URL dasar service FastAPI (mis. `http://localhost:8000` atau URL production). */
  baseUrl: string;
  /** Nama/versi model ML untuk dicatat di kolom `anomaly_flags.model` (mis. `anomaly-lgbm-v1`). */
  model: string | null;
  /** Opsional: injeksi fungsi `fetch` untuk kebutuhan unit test tanpa jaringan nyata. */
  fetchFn?: typeof fetch;
}

/**
 * Adapter HTTP untuk layanan FastAPI Machine Learning (`anomaly_model.pkl`).
 *
 * Alur kerja:
 * 1. Mengubah `target`, `comparisons`, dan 4 parameter `config` menjadi JSON sesuai kontrak FastAPI.
 * 2. Mengirim request `POST /v1/anomaly/analyze` dengan `AbortSignal` timeout dari `anomaly-service.ts`.
 * 3. Memvalidasi JSON balasan menggunakan Zod sebelum dikembalikan ke `analyzeSession`.
 * 4. Jika timeout, HTTP non-2xx, atau format JSON rusak, melempar `AnomalyProviderError`
 *    sehingga sesi ditandai `anomaly_analysis_status = 'failed'` dan tetap menunggu validasi manual Admin.
 */
export class HttpAnomalyDetector implements AnomalyDetector {
  readonly provider = 'ml_fastapi';
  readonly model: string | null;
  private readonly analyzeUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor({ baseUrl, model, fetchFn = globalThis.fetch }: HttpAnomalyDetectorOptions) {
    // Hilangkan trailing slash agar tidak menjadi `//v1/anomaly/analyze`.
    this.analyzeUrl = `${baseUrl.replace(/\/+$/, '')}/v1/anomaly/analyze`;
    this.model = model;
    this.fetchFn = fetchFn;
  }

  async detect(input: AnomalyDetectionInput, { signal }: { signal: AbortSignal }): Promise<AnomalyDetection> {
    // FastAPI menghitung 19 fitur langsung dari `target`, `comparisons`, dan `config`.
    // Field `candidates` tidak dikirim karena hanya dipakai FakeAnomalyDetector di test.
    const payload = {
      target: toPublicSnapshot(input.target),
      comparisons: input.comparisons.map(toPublicSnapshot),
      config: {
        durationOutlierMinutes: input.config.durationOutlierMinutes,
        durationMinMinutes: input.config.durationMinMinutes,
        lateStartAfter: input.config.lateStartAfter,
        earlyStartBefore: input.config.earlyStartBefore,
      },
    };

    let response: Response;
    try {
      response = await this.fetchFn(this.analyzeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      });
    } catch {
      // Pesan error dijaga tetap generik agar URL internal / payload tidak bocor ke log.
      if (signal.aborted) {
        throw new AnomalyProviderError('Provider anomali melebihi batas waktu', 'timeout');
      }
      throw new AnomalyProviderError('Permintaan ke service AI gagal', 'request_failed');
    }

    if (!response.ok) {
      throw new AnomalyProviderError(`Service AI mengembalikan HTTP ${response.status}`, 'request_failed');
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new AnomalyProviderError('Response service AI bukan JSON valid', 'invalid_output');
    }

    const parsed = fastApiResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new AnomalyProviderError('Response service AI tidak sesuai kontrak schema', 'invalid_output');
    }

    return {
      validity: parsed.data.validity,
      validity_reason: parsed.data.validity_reason,
      findings: parsed.data.findings,
    };
  }
}
