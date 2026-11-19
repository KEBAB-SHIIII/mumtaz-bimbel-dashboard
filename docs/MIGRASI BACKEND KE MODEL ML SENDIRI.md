# Panduan Migrasi *Backend*: Mengganti *Prototype* Gemini API dengan Model ML Sendiri (FastAPI)

Dokumen ini adalah daftar periksa (*checklist*) teknis yang detail dan *to the point* mengenai **file dan baris kode mana saja di aplikasi yang harus diubah** ketika `anomaly_model.pkl` dan layanan **FastAPI** sudah siap digunakan.

- **Database PostgreSQL:** **0 perubahan** (tidak perlu migrasi SQL baru).
- **Frontend UI:** **0 perubahan** (otomatis mengikuti kontrak yang sudah ada).
- **File Kode yang Diubah/Ditambah:** Hanya **7 file** (1 di `packages/contracts`, 6 di `backend`).

---

## Ringkasan 7 File yang Diubah / Ditambah

| No | Path File | Status | Tujuan Perubahan |
|---|---|---|---|
| 1 | `packages/contracts/src/attendance.ts` | Ubah 1 angka | Mengubah batas maksimal mata pelajaran per sesi dari `3` menjadi `5` (`MAX_SUBJECTS_PER_SESSION = 5`) |
| 2 | `backend/src/config/env.ts` | Ubah | Menambah variabel `.env` untuk URL FastAPI (`ANOMALY_SERVICE_URL`) serta ambang batas baru (`30` menit & `"07:00"`) |
| 3 | `backend/src/integrations/anomaly/types.ts` | Ubah | Menambah `durationMinMinutes` & `earlyStartBefore` pada `AnomalyDetectionConfig`, serta menjadikan `candidates` opsional |
| 4 | `backend/src/services/anomaly/candidates.ts` | Ubah | Mengubah jendela `COMPARISON_WINDOW_DAYS = 30`, `MAX_COMPARISONS = 500`, dan menyaring `comparisons` yang `submitted_at` lebih awal |
| 5 | `backend/src/services/anomaly/anomaly-service.ts` | Ubah | Menghapus gerbang `if (candidates.length === 0)` agar **semua sesi selalu dikirim ke FastAPI**, dan menaikkan `.limit(200)` menjadi `.limit(500)` |
| 6 | `backend/src/integrations/anomaly/http-detector.ts` | **File Baru** | Adapter HTTP pengganti Gemini yang memanggil `POST /v1/anomaly/analyze` ke FastAPI |
| 7 | `backend/src/integrations/anomaly/create-detector.ts` & `backend/src/server.ts` | Ubah | Menghubungkan `HttpAnomalyDetector` dan meneruskan 4 parameter `config` ke worker |

---

## Detail Perubahan Per File

### 1. `packages/contracts/src/attendance.ts`
**Tujuan:** Menyelaraskan validasi jumlah mata pelajaran di aplikasi (1–5 mapel) dengan aturan dataset 19 fitur.

- **Baris 44 (Sebelum):**
  ```ts
  export const MAX_SUBJECTS_PER_SESSION = 3;
  ```
- **Baris 44 (Sesudah):**
  ```ts
  export const MAX_SUBJECTS_PER_SESSION = 5;
  ```

---

### 2. `backend/src/config/env.ts` & `backend/.env`
**Tujuan:** Menambahkan konfigurasi koneksi ke layanan FastAPI dan 2 ambang batas baru (`durationMinMinutes = 30` dan `earlyStartBefore = "07:00"`).

- **Tambahkan di `envSchema` (`backend/src/config/env.ts` sekitar baris 77–85):**
  ```ts
  /** URL base service FastAPI ML internal (mis. http://localhost:8000). */
  ANOMALY_SERVICE_URL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.url().optional(),
  ),
  /** Nama/versi model ML internal untuk dicatat di anomaly_flags.model. */
  ANOMALY_MODEL_NAME: optionalString,

  GEMINI_API_KEY: optionalString,
  GEMINI_MODEL: optionalString,
  /** Durasi di atas ini dilabeli Perlu revisi (> 180 menit). */
  ANOMALY_DURATION_OUTLIER_MINUTES: positiveInt(180),
  /** Durasi di bawah ini dilabeli Perlu revisi (< 30 menit). */
  ANOMALY_DURATION_MIN_MINUTES: positiveInt(30),
  /** Les yang dimulai setelah jam ini (WIB, "HH:MM") dilabeli Perlu revisi (> 21:00). */
  ANOMALY_LATE_START_AFTER: lessonTimeSchema.default('21:00'),
  /** Les yang dimulai sebelum jam ini (WIB, "HH:MM") dilabeli Perlu revisi (< 07:00). */
  ANOMALY_EARLY_START_BEFORE: lessonTimeSchema.default('07:00'),
  /** Batas waktu satu panggilan provider anomali; lewat batas -> `failed`. */
  ANOMALY_PROVIDER_TIMEOUT_MS: positiveInt(20_000),
  ```

- **Ubah fungsi `integrationStatus(env: Env)` di bagian bawah `backend/src/config/env.ts`:**
  ```ts
  export function integrationStatus(env: Env) {
    return {
      googleSheetsExport: env.GOOGLE_SHEETS_EXPORT_ENABLED ? 'configured' : 'disabled',
      anomalyProvider: env.ANOMALY_SERVICE_URL
        ? 'ml_fastapi'
        : env.GEMINI_API_KEY && env.GEMINI_MODEL
          ? 'gemini'
          : 'not_configured',
    } as const;
  }
  ```

- **Isi di file `backend/.env`:**
  ```env
  ANOMALY_SERVICE_URL=http://localhost:8000
  ANOMALY_MODEL_NAME=anomaly-lgbm-v1
  ANOMALY_DURATION_OUTLIER_MINUTES=180
  ANOMALY_DURATION_MIN_MINUTES=30
  ANOMALY_LATE_START_AFTER=21:00
  ANOMALY_EARLY_START_BEFORE=07:00
  ANOMALY_PROVIDER_TIMEOUT_MS=20000
  ```

---

### 3. `backend/src/integrations/anomaly/types.ts`
**Tujuan:** Menambahkan 2 *key* baru pada `AnomalyDetectionConfig` dan membuat `candidates` opsional karena FastAPI tidak memakai `candidates`.

- **Ubah `AnomalyDetectionConfig` & `AnomalyDetectionInput` (baris 37–50):**
  ```ts
  export interface AnomalyDetectionConfig {
    /** Durasi di atas ini Perlu revisi (> 180 menit). */
    durationOutlierMinutes: number;
    /** Durasi di bawah ini Perlu revisi (< 30 menit). */
    durationMinMinutes: number;
    /** Les yang dimulai SETELAH jam ini Perlu revisi (> 21:00). */
    lateStartAfter: string;
    /** Les yang dimulai SEBELUM jam ini Perlu revisi (< 07:00). */
    earlyStartBefore: string;
  }

  export interface AnomalyDetectionInput {
    target: AnomalySessionSnapshot;
    /** Sesi pembanding +-30 hari yang di-submit lebih dulu (maks 500 sesi). */
    comparisons: readonly AnomalySessionSnapshot[];
    /** Opsional (hanya dipakai fallback Gemini; tidak dikirim ke FastAPI). */
    candidates?: readonly AnomalyCandidate[];
    config: AnomalyDetectionConfig;
  }
  ```

---

### 4. `backend/src/services/anomaly/candidates.ts`
**Tujuan:** Mengubah jendela `comparisons` menjadi **+-30 hari** dengan batas **500 sesi**, serta memastikan `selectComparisons` hanya mengambil sesi yang di-*submit* lebih awal dari `target` (sama persis dengan perhitungan 19 fitur di CSV).

- **Ubah konstanta di baris 8–10:**
  ```ts
  export const COMPARISON_WINDOW_DAYS = 30;
  export const MAX_COMPARISONS = 500;
  ```

- **Ubah fungsi `selectComparisons` (baris 91–102) agar menyaring `byEarliest(s, target) < 0`:**
  ```ts
  export function selectComparisons(
    target: AnomalySessionSnapshot,
    pool: readonly AnomalySessionSnapshot[],
    candidates: readonly AnomalyCandidate[] = [],
  ): AnomalySessionSnapshot[] {
    const related = new Set(candidates.map((c) => c.related_lesson_session_id).filter(Boolean));
    const distance = (s: AnomalySessionSnapshot) => Math.abs(Date.parse(s.lesson_date) - Date.parse(target.lesson_date));
    return pool
      .filter((s) => s.id !== target.id && byEarliest(s, target) < 0)
      .sort((a, b) => Number(related.has(b.id)) - Number(related.has(a.id)) || distance(a) - distance(b) || a.id.localeCompare(b.id))
      .slice(0, MAX_COMPARISONS);
  }
  ```

---

### 5. `backend/src/services/anomaly/anomaly-service.ts`
**Tujuan:**
1. Menaikkan `.limit(200)` pada `loadComparisonPool` menjadi `.limit(500)`.
2. Menghapus kondisi `if (candidates.length === 0) return finish('completed', { validity: 'valid', ... })` agar **setiap sesi absen selalu dikirim ke model ML di FastAPI** (karena aturan baru seperti `< 30` menit, `< 07:00`, dan 3 jenis *overlap* jadwal diperiksa langsung oleh model di FastAPI).

- **Baris 93 di `loadComparisonPool`:**
  ```ts
  // Sebelum:
  .limit(200);
  // Sesudah:
  .limit(500);
  ```

- **Baris 192–203 di `analyzeSession`:**
  ```ts
  // Sebelum:
  const pool = await loadComparisonPool(deps.db, target);
  const candidates = generateCandidates(target, pool, deps.config);
  if (candidates.length === 0) return finish('completed', { validity: 'valid', reason: null });
  if (!deps.detector) return finish('not_evaluated');

  const comparisons = selectComparisons(target, pool, candidates);
  const detector = deps.detector;
  try {
    const detection = await withTimeout(deps.timeoutMs, (signal) =>
      detector.detect({ target, comparisons, candidates, config: deps.config }, { signal }),
    );

  // Sesudah:
  if (!deps.detector) return finish('not_evaluated');
  const pool = await loadComparisonPool(deps.db, target);
  const candidates = generateCandidates(target, pool, deps.config);
  const comparisons = selectComparisons(target, pool, candidates);
  const detector = deps.detector;
  try {
    const detection = await withTimeout(deps.timeoutMs, (signal) =>
      detector.detect({ target, comparisons, candidates, config: deps.config }, { signal }),
    );
  ```

---

### 6. Buat File Baru: `backend/src/integrations/anomaly/http-detector.ts`
**Tujuan:** Adapter HTTP yang mengirim `{ target, comparisons, config }` ke FastAPI (`POST /v1/anomaly/analyze`), menyaring *field* privat (`learning_material`, `learning_notes`, `next_focus`), dan memvalidasi JSON balasan dari FastAPI.

```ts
import { z } from 'zod';
import { anomalyFindingCandidateSchema, sessionValiditySchema } from '@mumtaz/contracts';
import {
  AnomalyProviderError,
  type AnomalyDetection,
  type AnomalyDetectionInput,
  type AnomalyDetector,
  type AnomalySessionSnapshot,
} from './types.js';

const fastApiResponseSchema = z.object({
  validity: sessionValiditySchema,
  validity_reason: z.string().min(1).max(600),
  findings: z.array(anomalyFindingCandidateSchema),
});

/** Hanya kirim 8 field sesuai kontrak (buang catatan/materi privat). */
function toPublicSnapshot(s: AnomalySessionSnapshot) {
  return {
    id: s.id,
    tutor_id: s.tutor_id,
    student_id: s.student_id,
    subject_ids: [...s.subject_ids].sort(),
    lesson_date: s.lesson_date,
    start_time: s.start_time,
    duration_minutes: s.duration_minutes,
    submitted_at: s.submitted_at,
  };
}

export interface HttpAnomalyDetectorOptions {
  baseUrl: string;
  model: string | null;
}

export class HttpAnomalyDetector implements AnomalyDetector {
  readonly provider = 'ml_fastapi';
  readonly model: string | null;
  private readonly analyzeUrl: string;

  constructor({ baseUrl, model }: HttpAnomalyDetectorOptions) {
    this.analyzeUrl = `${baseUrl.replace(/\/+$/, '')}/v1/anomaly/analyze`;
    this.model = model;
  }

  async detect(input: AnomalyDetectionInput, { signal }: { signal: AbortSignal }): Promise<AnomalyDetection> {
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
      response = await fetch(this.analyzeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      });
    } catch (error) {
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
```

---

### 7. `backend/src/integrations/anomaly/create-detector.ts` & `backend/src/server.ts`
**Tujuan:** Mengaktifkan `HttpAnomalyDetector` saat `ANOMALY_SERVICE_URL` diisi, dan meneruskan ke-4 parameter `config`.

- **Di `backend/src/integrations/anomaly/create-detector.ts`:**
  ```ts
  import type { Env } from '../../config/env.js';
  import { GeminiAnomalyDetector, createGeminiClient } from './gemini-detector.js';
  import { HttpAnomalyDetector } from './http-detector.js';
  import type { AnomalyDetector } from './types.js';

  export function createAnomalyDetector(env: Env): AnomalyDetector | null {
    if (env.ANOMALY_SERVICE_URL) {
      return new HttpAnomalyDetector({
        baseUrl: env.ANOMALY_SERVICE_URL,
        model: env.ANOMALY_MODEL_NAME ?? 'ml-custom-v1',
      });
    }
    if (!env.GEMINI_API_KEY || !env.GEMINI_MODEL) return null;
    return new GeminiAnomalyDetector({
      model: env.GEMINI_MODEL,
      client: createGeminiClient(env.GEMINI_API_KEY, env.ANOMALY_PROVIDER_TIMEOUT_MS),
    });
  }
  ```

- **Di `backend/src/server.ts` (baris 32–35):**
  ```ts
  config: {
    durationOutlierMinutes: env.ANOMALY_DURATION_OUTLIER_MINUTES,
    durationMinMinutes: env.ANOMALY_DURATION_MIN_MINUTES,
    lateStartAfter: env.ANOMALY_LATE_START_AFTER,
    earlyStartBefore: env.ANOMALY_EARLY_START_BEFORE,
  },
  ```

---

## Ringkasan Kontrak *Endpoint* FastAPI yang Harus Cocok dengan *Backend*

Saat membuat layanan FastAPI nanti, pastikan:
1. **Endpoint:** `POST /v1/anomaly/analyze`
2. **Request Body yang Diterima FastAPI:**
   `{ target, comparisons, config }` (tanpa `candidates`, di mana `config` berisi `durationOutlierMinutes`, `durationMinMinutes`, `lateStartAfter`, `earlyStartBefore`).
3. **Response Body yang Dikembalikan FastAPI (`HTTP 200`):**
   `{ validity, validity_reason, findings }`
   - `validity`: `"valid" | "needs_revision" | "rejected"`
   - `validity_reason`: string Bahasa Indonesia (`1–600` karakter)
   - `findings[].finding_type`: wajib salah satu dari 4 nilai database (`"suspected_duplicate" | "duration_outlier" | "late_start" | "unusual_pattern"`)
   - `findings[].lesson_session_id`: wajib sama persis dengan `target.id`
   - `findings[].related_lesson_session_id`: wajib ada di dalam `comparisons[].id` atau `null`
   - `findings[].suggested_action`: `"review"`
