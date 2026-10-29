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

Modul anomaly adalah bagian dari baseline development. Gemini adalah provider yang direncanakan; adapter dibuat agar unit test tidak memerlukan credential live dan provider dapat diganti tanpa mengubah business service.

- Gunakan SDK resmi `@google/genai` di backend. Saat live integration disiapkan, baca `GEMINI_API_KEY` dan `GEMINI_MODEL` dari environment.
- Validasi field, assignment, tanggal dan durasi dilakukan secara deterministik oleh backend.
- Kandidat duplikasi dibuat dari kombinasi data yang relevan, misalnya tutor, siswa, mapel, tanggal dan durasi. Modul AI mengklasifikasikan/menjelaskan kandidat; jangan mengirim nama lengkap atau PII yang tidak diperlukan.
- Jenis finding baseline: `suspected_duplicate`, `duration_outlier`, `unusual_pattern`. Input invalid ditangani validasi deterministik dan tidak menjadi finding model pada submit baru.
- Finding masuk `anomaly_flags` dan harus ditinjau Admin. Finding tidak otomatis mengubah `lesson_sessions.status`, tidak menghapus data, dan tidak menentukan honor.
- Jika provider belum dikonfigurasi/tidak dijalankan, statusnya `not_evaluated`. Jika provider dipanggil lalu gagal, statusnya `failed`. Alur submit tetap berfungsi; jangan menampilkan hasil fake seolah hasil live. Status analisis ditentukan backend.
- Unit test memakai fake detector deterministik; dokumentasikan mana mock test dan mana live smoke test.

Referensi: https://github.com/googleapis/js-genai, https://ai.google.dev/gemini-api/docs/models, https://ai.google.dev/api/generate-content

## 4. PDF/CSV dan output file

- Ekspor Google Sheets bulanan adalah output laporan yang dipilih untuk MVP.
- Download CSV bukan bagian baseline; pertimbangkan hanya jika owner meminta fallback. `attendance-sample.csv` saat ini hanya fixture. 
- PDF bukan bagian baseline; jangan install/implementasikan PDFKit tanpa persetujuan scope tambahan.

## 5. Kegagalan dan observability

- Catat jenis, waktu dan hasil operasi, bukan secret/PII berlebihan.
- Jangan anggap timeout sebagai bukti write tidak terjadi; re-export harus menulis ulang report bulan yang sama, bukan append.
- Jangan mengembalikan status sukses sebelum write Google Sheets terkonfirmasi.
- Kegagalan eksternal tidak mengubah atau menghapus data Neon.
