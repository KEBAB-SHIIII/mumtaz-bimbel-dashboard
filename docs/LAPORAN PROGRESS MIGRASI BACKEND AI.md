# Laporan Progress Integrasi AI Anomaly Detection (Backend, Contracts, & Frontend)

Dokumen ini ditujukan untuk rekan tim **Fullstack Developer** agar dapat memahami dengan cepat **apa saja yang sudah diubah di repositori `mumtaz-bimbel-dashboard` (branch `feat/backend-aii`)**, **mengapa perubahan tersebut dilakukan**, dan **bagaimana cara mengaktifkan koneksi ke layanan FastAPI ML**.

---

## 1. Ringkasan Eksekutif (TL;DR untuk Tim Fullstack)

- **Database PostgreSQL (`schema.ts` & migrasi Drizzle):** **0 perubahan** (tidak perlu jalankan `db:generate` atau `db:migrate` baru). Semua 9 kondisi aturan bisnis dari model ML dipetakan ke 4 nilai enum `finding_type` yang sudah ada (`suspected_duplicate`, `duration_outlier`, `late_start`, `unusual_pattern`).
- **Arsitektur Integrasi AI:** Backend kini memiliki adapter HTTP baru **`HttpAnomalyDetector`** (`provider = 'ml_fastapi'`) yang menembak endpoint `POST /v1/anomaly/analyze` pada layanan FastAPI ML (`anomaly_model.pkl`).
- **Kompatibilitas Mundur (*Backward-Compatible*):** Selama `ANOMALY_SERVICE_URL` di `backend/.env` belum diisi (atau masih dikomentari `#`), backend otomatis *fallback* ke `GeminiAnomalyDetector` (atau `not_evaluated` jika tanpa kredensial). Jadi tidak akan merusak jalannya aplikasi saat pengembangan lokal.

---

## 2. Daftar Commit yang Sudah Di-*push* ke Branch `feat/backend-aii`

| Commit Hash | Pesan Commit | Lingkup |
|---|---|---|
| `5de9054` | `docs: add 181-minute boundary analysis and FastAPI guardrail spec` | Dokumentasi AI |
| `4d9c8c3` | `feat(contracts): increase max subjects per session from 3 to 5 for ML alignment` | `packages/contracts` & Test |
| `090bc93` | `feat(backend): add FastAPI ML service URL and 4-threshold anomaly env config` | Konfigurasi `.env` |
| `bd57034` | `feat(backend): add HttpAnomalyDetector adapter for FastAPI ML service` | Adapter HTTP FastAPI |
| `fe7cb5f` | `feat(backend): update anomaly pipeline for 30-day/500 comparison window and full ML evaluation` | Service & Worker Anomali |
| `257e832` | `feat(frontend): update anomaly finding labels and add ml_fastapi provider label` | Label UI Admin |

---

## 3. Rincian File yang Diubah / Ditambahkan & Alasannya

### A. `packages/contracts` (1 File)

#### 1. `packages/contracts/src/attendance.ts`
- **Apa yang diubah:** Konstanta `MAX_SUBJECTS_PER_SESSION` dinaikkan dari `3` menjadi `5`.
- **Untuk apa:** Menyelaraskan batas jumlah mata pelajaran per sesi di form absensi dengan aturan bisnis terbaru dan fitur `subject_count` (`1–5` mapel) pada model ML (tarif tetap dihitung per sesi, bukan per mapel). Karena Frontend mengimpor konstanta ini secara langsung, batas pilihan checkbox mapel di UI otomatis ikut menjadi 5.

---

### B. `backend` — Konfigurasi & Environment (2 File)

#### 2. `backend/src/config/env.ts` & `backend/.env.example`
- **Apa yang diubah:**
  - Menambahkan variabel baru di `envSchema`:
    - `ANOMALY_SERVICE_URL` (URL opsional ke service FastAPI, mis. `http://localhost:8000`).
    - `ANOMALY_MODEL_NAME` (nama/versi model untuk dicatat di kolom `anomaly_flags.model`, default `anomaly-lgbm-v1`).
    - `ANOMALY_DURATION_MIN_MINUTES` (batas bawah durasi normal, default `30` menit).
    - `ANOMALY_EARLY_START_BEFORE` (batas bawah jam mulai pagi, default `"07:00"` WIB).
  - Memperbarui fungsi `integrationStatus(env)` agar mengembalikan `anomalyProvider: 'ml_fastapi'` jika `ANOMALY_SERVICE_URL` diisi (mengalahkan Gemini).
- **Untuk apa:** Agar URL layanan FastAPI dan ke-4 ambang batas validasi (`30–180` menit dan `07:00–21:00` WIB) bisa dikonfigurasi lewat `.env` tanpa *hardcode*.

---

### C. `backend` — Integrasi Detektor Anomali (5 File)

#### 3. `backend/src/integrations/anomaly/types.ts`
- **Apa yang diubah:**
  - Menambahkan `durationMinMinutes: number` dan `earlyStartBefore: string` ke dalam interface `AnomalyDetectionConfig`.
  - Mengubah properti `candidates` pada `AnomalyDetectionInput` menjadi opsional (`candidates?: readonly AnomalyCandidate[]`).
- **Untuk apa:** Layanan FastAPI menghitung sendiri 19 fitur numerik dari `target`, `comparisons`, dan ke-4 parameter `config`, sehingga tidak membutuhkan daftar `candidates` dari *rule engine* lama.

#### 4. `backend/src/integrations/anomaly/http-detector.ts` (**File Baru**)
- **Apa yang dibuat:** Class `HttpAnomalyDetector` (`provider = 'ml_fastapi'`).
- **Untuk apa:**
  - Menjadi jembatan HTTP yang mengirim request `POST /v1/anomaly/analyze` ke layanan FastAPI dengan `AbortSignal` timeout.
  - Menyaring *field* sesi lewat `toPublicSnapshot()` agar **hanya 8 atribut terstruktur** yang dikirim (`id`, `tutor_id`, `student_id`, `subject_ids` terurut, `lesson_date`, `start_time`, `duration_minutes`, `submitted_at`) dan **membuang data privat** (`learning_material`, `learning_notes`, `next_focus`, `end_time`).
  - Memvalidasi JSON balasan dari FastAPI (`{ validity, validity_reason, findings }`) menggunakan schema Zod sebelum diteruskan ke database. Jika HTTP error, timeout, atau format JSON tidak sesuai kontrak, melempar `AnomalyProviderError` sehingga status sesi menjadi `failed` (aman dan tidak menjatuhkan worker).

#### 5. `backend/src/integrations/anomaly/create-detector.ts`
- **Apa yang diubah:** Mengatur prioritas pemilihan detektor:
  1. Jika `env.ANOMALY_SERVICE_URL` ada -> gunakan `HttpAnomalyDetector` (`ml_fastapi`).
  2. Jika tidak ada tapi `GEMINI_API_KEY` & `GEMINI_MODEL` ada -> gunakan `GeminiAnomalyDetector` (`gemini`).
  3. Jika kosong semua -> `null` (`not_evaluated`).
- **Untuk apa:** Memudahkan perpindahan dari prototype Gemini ke layanan FastAPI cukup dengan mengatur 1 baris di `.env`.

#### 6. `backend/src/integrations/anomaly/pseudonymize.ts` & `gemini-detector.ts`
- **Apa yang diubah:** Menambahkan fallback `input.candidates ?? []`.
- **Untuk apa:** Menjaga agar kompiler TypeScript (`npm run typecheck`) dan fallback Gemini tetap berjalan aman setelah `candidates` dijadikan opsional di `types.ts`.

---

### D. `backend` — Service & Worker Anomali (3 File)

#### 7. `backend/src/services/anomaly/candidates.ts`
- **Apa yang diubah:**
  - Mengubah `COMPARISON_WINDOW_DAYS` dari `7` menjadi `30` hari.
  - Mengubah `MAX_COMPARISONS` dari `30` menjadi `500` sesi.
  - Memperbarui `selectComparisons()` agar memfilter `byEarliest(s, target) < 0` (hanya mengambil sesi pembanding yang di-*submit* **lebih awal** dari sesi `target`, dengan `id` sebagai *tie-breaker*).
- **Untuk apa:** Menyamakan cara Backend mengambil `comparisons` dari PostgreSQL supaya **100% identik** dengan cara 19 fitur dihitung saat pelatihan model ML di Google Colab (yaitu: sesi yang di-*submit* pertama kali dianggap sah, sedangkan sesi duplikat/bentrok yang di-*submit* belakangan yang ditandai anomali, serta menghitung statistik 30 hari tutor/siswa).

#### 8. `backend/src/services/anomaly/anomaly-service.ts`
- **Apa yang diubah:**
  - Menaikkan `.limit(200)` pada query database `loadComparisonPool()` menjadi `.limit(MAX_COMPARISONS)` (`500`).
  - **Menghapus kondisi *short-circuit* lama `if (candidates.length === 0) return finish('completed', { validity: 'valid', ... })`**.
  - Menambahkan penyaringan `toDetectorSnapshot()` tepat sebelum memanggil `detector.detect(...)`.
- **Untuk apa:**
  - Pada kode lama, jika `generateCandidates` tidak menemukan duplikat persis / `> 180` menit / `>= 21:00`, sesi langsung diloloskan sebagai `valid` tanpa memanggil AI. Padahal aturan baru kita mencakup durasi `< 30` menit, mulai `< 07:00`, *fuzzy duplicate* beda jam, dan 3 jenis jadwal bentrok (*overlap*) yang dihitung melalui 19 fitur di FastAPI. Dengan dihapusnya gerbang lama tersebut, **setiap sesi absen kini selalu dievaluasi penuh oleh detektor AI**.
  - Penyaringan `toDetectorSnapshot()` di level service memastikan tidak ada teks materi/catatan privat yang bocor ke detektor mana pun.

#### 9. `backend/src/server.ts`
- **Apa yang diubah:** Meneruskan ke-4 parameter `config` (`durationOutlierMinutes`, `durationMinMinutes`, `lateStartAfter`, `earlyStartBefore`) dari `env` ke `analyzeSession` di dalam `AnomalyWorker`.
- **Untuk apa:** Agar `HttpAnomalyDetector` dapat meneruskan ke-4 ambang batas tersebut ke FastAPI.

---

### E. `frontend` — Penyesuaian Label UI Admin (1 File)

#### 10. `frontend/src/features/admin/attendance/finding-list.tsx`
- **Apa yang diubah:**
  - Memperbarui teks `FINDING_LABEL` agar mencakup seluruh aturan bisnis baru:
    - `suspected_duplicate`: `'Data duplikat'`
    - `duration_outlier`: `'Durasi di luar batas (30–180 menit)'` *(sebelumnya `'Durasi > 180 menit'`)*
    - `late_start`: `'Jam mulai di luar jam operasional'` *(sebelumnya `'Mulai di atas 21.00'`)*
    - `unusual_pattern`: `'Jadwal bentrok / pola tidak biasa'` *(sebelumnya `'Pola tidak biasa'`)*
  - Menambahkan format tampilan untuk `finding.provider === 'ml_fastapi'` pada fungsi `providerLabel()`: menampilkan **`Klasifikasi AI (Model ML · anomaly-lgbm-v1)`** di dialog detail Admin.
- **Untuk apa:** Agar Admin mendapatkan label kategori anomali dan informasi sumber model ML yang akurat tanpa perlu mengubah komponen tabel atau dialog yang sudah ada.

---

### F. Unit & Integration Tests yang Ditambahkan / Diperbarui

- **File Test Baru:** `backend/tests/http-detector.test.ts` — Menguji `HttpAnomalyDetector` (validasi payload 8 field tanpa materi privat, tanpa `candidates`, penanganan HTTP 500, JSON invalid, timeout `AbortController`, serta prioritas `createAnomalyDetector`).
- **File Test yang Disesuaikan:**
  - `backend/tests/anomaly.test.ts`
  - `backend/tests/attendance.test.ts`
  - `backend/tests/env.test.ts`
  - `backend/tests/fake-anomaly-detector.test.ts`
  - `backend/tests/fakes/fake-anomaly-detector.ts`
  - `backend/tests/gemini-detector.test.ts`
  - `backend/tests/grade-history.test.ts`
  - `backend/tests/owner-tariff.test.ts`
  - `frontend/src/app/app.test.tsx`

---

## 4. Cara Mengaktifkan Koneksi ke FastAPI (Saat Service FastAPI Sudah Jalan)

Bagi rekan Fullstack yang ingin menjalankan aplikasi bersama layanan FastAPI ML:

1. Pastikan layanan FastAPI sudah berjalan (misalnya di `http://localhost:8000` sesuai panduan di `docs/PANDUAN PEMBUATAN SERVICE FASTAPI ML.md`).
2. Di file `backend/.env`, pastikan variabel berikut aktif (tidak dikomentari):
   ```env
   ANOMALY_SERVICE_URL=http://localhost:8000
   ANOMALY_MODEL_NAME=anomaly-lgbm-v1
   ANOMALY_DURATION_OUTLIER_MINUTES=180
   ANOMALY_DURATION_MIN_MINUTES=30
   ANOMALY_LATE_START_AFTER=21:00
   ANOMALY_EARLY_START_BEFORE=07:00
   ANOMALY_PROVIDER_TIMEOUT_MS=20000
   ```
3. Jalankan backend (`npm run dev -w backend`). Pada log startup akan tertulis `"anomaly_provider": "ml_fastapi"`.
