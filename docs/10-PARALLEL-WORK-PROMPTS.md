# Parallel Work Prompts — Coding Agents / Tim

Mulai pekerjaan paralel setelah Phase 01–02 menyamakan shared contracts, ERD, fixture dan API. Gunakan branch/file ownership jelas; jangan dua agent mengedit schema/kontrak yang sama tanpa koordinasi.

## A. Backend core

> Baca `02-AGENT-CONTEXT.md`, `03-TECHNICAL-ARCHITECTURE.md`, `04-API-CONTRACT.md`, `05-DATA-CONTRACT.md`, dan `14-ERD-AND-DATA-DICTIONARY.md`. Implementasikan backend Express 5 + TypeScript + Drizzle + Neon: schema/migration, auth role-based, CRUD Master Data, validasi submit form Tutor, list/detail Data Absensi, keputusan Admin, recap/payroll services, dan endpoint parent progress. Jangan mengimplementasikan import dari Google Sheets sebagai jalur utama. Submit hanya menyimpan ke Neon; endpoint export ke Sheets adalah pekerjaan terpisah. Jangan membuat UI. Jalankan Vitest/Supertest/typecheck/lint dan laporkan hasil aktual.

## B. Frontend role dashboards

> Baca `02-AGENT-CONTEXT.md`, `04-API-CONTRACT.md`, `07-DESIGN-GUIDELINES.md`, `12-USER-FLOWS.md`, `15-DASHBOARD-TABS.md` dan fase frontend. Kerjakan hanya `frontend/`. Implementasikan route/layout berdasarkan role Admin, Tutor dan Orang Tua. Admin memiliki Dashboard, Data Absensi, Rekap, Honor Tutor, Master Data; Tutor memiliki Dashboard, Form Absensi, Riwayat Mengajar, Honor Saya, Profil (read-only + ganti password); Orang Tua memiliki Dashboard/Progress Anak dan Riwayat Pembelajaran. Gunakan React 19/TypeScript, Router, TanStack Query, shared Axios instance, Tailwind v4, Headless UI, Lucide React. Jangan gunakan native `fetch` untuk API, jangan gunakan shadcn/ui, jangan mengakses database/Sheets langsung, dan jangan ubah kontrak API tanpa koordinasi. Buat loading/error/empty/accessibility states dan tests.

## C. Google Sheets export lane

> Baca `02-AGENT-CONTEXT.md`, `04-API-CONTRACT.md`, `14-ERD-AND-DATA-DICTIONARY.md`, `16-GOOGLE-SHEETS-MONTHLY-EXPORT.md`, `09-REAL-INTEGRATIONS.md`, dan `11-ENVIRONMENT-SETUP.md`. Implementasikan exporter di backend dengan `googleapis`. Spreadsheet ID dan credential hanya dari environment/server secret. Endpoint hanya Admin dan dipicu eksplisit oleh tombol ekspor; tidak boleh dipanggil oleh submit form. Query Neon berdasarkan `lesson_date`/periode `YYYY-MM`, map ke delapan header yang tepat, buat tab `Absensi YYYY-MM`, dan saat re-export perbarui isi tab tanpa append duplikat. Log hasil di `sheet_export_runs`. Buat mock adapter tests tanpa credential dan dokumentasikan live smoke test yang butuh credential owner.

## D. Anomaly classification lane

> Baca `02-AGENT-CONTEXT.md`, `05-DATA-CONTRACT.md`, `09-REAL-INTEGRATIONS.md`, `14-ERD-AND-DATA-DICTIONARY.md`, dan fase 05. Implementasikan anomaly service dengan interface provider yang mengklasifikasikan suspected duplicate/pattern. Validasi deterministic tetap dilakukan sebelum model; gunakan candidate matching dan pseudonymous IDs, tanpa PII. Output divalidasi Zod dan disimpan ke `anomaly_flags`, status analisis terpisah. Jangan mengubah status sesi atau formula honor otomatis. Buat fake detector deterministic untuk test dan jangan mengklaim live AI tanpa credential smoke test.

## E. Auth/login lane note

Admin/Tutor menggunakan username+password. Parent memakai satu random secret ID access code tanpa password; jangan gunakan ID publik sequential. Session cookie aman, rate limit, CSRF defense, parent-child scope checks wajib. Kode plaintext hanya ditampilkan sekali saat Admin generate/rotate.

## F. Handoff antar-lane

Setiap lane menyerahkan file yang berubah, cara menjalankan, dependency/env variable names, kontrak aktual, hasil test command dan limitation. Jangan menyerahkan hanya screenshot atau klaim “selesai”. Perubahan ERD/API/schema wajib didiskusikan dan disinkronkan lintas lane.
