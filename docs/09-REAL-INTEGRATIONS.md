# Real Integrations — Neon, Google Sheets Export, dan AI Anomaly

Dokumen ini menjelaskan boundary integrasi. Credential live akan disiapkan owner saat fase integrasi; selama development/test, gunakan fixture sintetis dan adapter fake yang jelas bukan hasil live.

## 1. Neon PostgreSQL + Drizzle

- Runtime memakai `DATABASE_URL`; migration dapat memakai `DATABASE_MIGRATION_URL` direct/unpooled bila dibutuhkan.
- Schema dan migration mengikuti `14-ERD-AND-DATA-DICTIONARY.md`.
- Gunakan FK/constraint, `numeric` untuk nominal, `DATE` untuk tanggal les, dan `TIMESTAMPTZ` untuk timestamps.
- Jangan memakai database production UMKM untuk development/test tanpa persetujuan.
- Seed harus eksplisit, sintetis, dan tidak menimpa data tanpa konfirmasi.

## 2. Google Sheets API — ekspor bulanan

**Peran:** tujuan ekspor laporan bulanan yang dipicu Admin. Bukan sumber input sesi dan bukan sinkronisasi real-time.

- Pakai `googleapis` hanya di backend.
- Service identity harus punya akses Editor ke spreadsheet target.
- Config minimal: `GOOGLE_SHEETS_SPREADSHEET_ID`, credential server-side, dan flag enable bila dipakai.
- Endpoint memvalidasi role Admin, periode dan query dari Neon.
- Tab deterministik: `Absensi YYYY-MM`.
- Header standar persis delapan kolom mentah: `no`, `nama tutor`, `nama murid`, `kelas`, `asal sekolah`, `mata pelajaran`, `tanggal les`, `durasi les`.
- Ekspor mencakup semua status review sesuai keputusan owner. Report tetap delapan kolom mentah tanpa kolom status.
- Re-export mengganti isi tab bulan yang sama; jangan append baris duplikat.
- Log ekspor ke `sheet_export_runs`; pesan error aman dan tidak mengandung secret.
- Jika belum dikonfigurasi, tampilkan status tidak tersedia/gagal dengan jujur. Jangan fake success dan jangan mengubah data Neon.
- Jangan membuat service `GoogleSheetsAttendanceSource` atau import routine untuk submit standar.

Referensi: https://developers.google.com/workspace/sheets/api/guides/values, https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/update, https://developers.google.com/workspace/guides/create-credentials

## 3. AI anomaly classification

Provider tunggal adalah **layanan FastAPI model ML** milik tim AI (repo `KEBAB-SHIIII/AI-MODEL-MUMTAZ`: LightGBM 19 fitur + guardrail deterministik). Baseline Gemini sudah dihapus. Backend memanggilnya lewat adapter `HttpAnomalyDetector` (`backend/src/integrations/anomaly/http-detector.ts`, provider `ml_fastapi`) sehingga unit test tetap memakai fake detector.

- Endpoint: `POST {ANOMALY_SERVICE_URL}/v1/anomaly/analyze` dengan body `{ target, comparisons, config }`; health check `GET /health`.
- `target` & `comparisons` hanya berisi 8 field terstruktur (`id`, `tutor_id`, `student_id`, `subject_ids` terurut, `lesson_date`, `start_time`, `duration_minutes`, `submitted_at`). Materi, catatan, nama, dan kontak tidak pernah dikirim.
- `comparisons`: sesi dengan tutor ATAU murid yang sama, ±30 hari dari `lesson_date`, di-submit lebih awal dari target, maksimal 500.
- `config`: `ANOMALY_DURATION_OUTLIER_MINUTES`, `ANOMALY_DURATION_MIN_MINUTES`, `ANOMALY_LATE_START_AFTER`, `ANOMALY_EARLY_START_BEFORE`.
- Response `{ validity, validity_reason, findings }` divalidasi Zod sebelum ditulis. Aturan lengkap & 19 fitur: `docs/IMPLEMENTASI AI MODEL + COMPARISON.md`.
- Jenis finding: `suspected_duplicate`, `duration_outlier`, `late_start`, `unusual_pattern`. Validasi field, murid/mapel aktif, tanggal dan durasi tetap dilakukan deterministik oleh backend sebelum sesi disimpan.
- Finding masuk `anomaly_flags` dan harus ditinjau Admin. Finding tidak otomatis mengubah `lesson_sessions.status`, tidak menghapus data, dan tidak menentukan honor.
- Jika provider belum dikonfigurasi/tidak dijalankan, statusnya `not_evaluated`. Jika provider dipanggil lalu gagal, statusnya `failed`. Alur submit tetap berfungsi; jangan menampilkan hasil fake seolah hasil live. Status analisis ditentukan backend.
- Unit test memakai fake detector deterministik; dokumentasikan mana mock test dan mana live smoke test.

Referensi: https://github.com/KEBAB-SHIIII/AI-MODEL-MUMTAZ (README & `docker-compose.yml`)

## 4. PDF/CSV dan output file

- Ekspor Google Sheets bulanan adalah output laporan yang dipilih untuk MVP.
- Download CSV bukan bagian baseline; pertimbangkan hanya jika owner meminta fallback. `attendance-sample.csv` saat ini hanya fixture. 
- PDF bukan bagian baseline; jangan install/implementasikan PDFKit tanpa persetujuan scope tambahan.

## 5. Kegagalan dan observability

- Catat jenis, waktu dan hasil operasi, bukan secret/PII berlebihan.
- Jangan anggap timeout sebagai bukti write tidak terjadi; re-export harus menulis ulang report bulan yang sama, bukan append.
- Jangan mengembalikan status sukses sebelum write Google Sheets terkonfirmasi.
- Kegagalan eksternal tidak mengubah atau menghapus data Neon.
