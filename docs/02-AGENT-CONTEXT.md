# Agent Context — Aturan Coding Agent

## Misi

Bangun aplikasi full-stack TypeScript untuk Bimbel Mumtaz Sampit: form absensi sesi les pada Dashboard Tutor, review admin, rekap bulanan, estimasi honor demo, riwayat/progress pembelajaran, penanganan temuan anomali, dan ekspor laporan bulanan langsung ke Google Sheets.

## Keputusan arsitektur wajib

- Alur submit: Tutor Dashboard → Express API → validasi → simpan Neon PostgreSQL → jalankan/antrekan anomaly screening. Submit tidak boleh memanggil Google Sheets.
- Neon adalah sumber data operasional utama. Google Sheets hanya menerima laporan bulanan saat Admin menekan ekspor.
- Semua dashboard membaca Neon melalui API dengan filter role/relasi server-side.
- Catatan sesi satu tabel `lesson_sessions`; jangan menggandakan tabel hanya karena tampilan dashboard berbeda.
- Status awal sesi selalu `pending`. Admin meninjau manual sebelum sesi dihitung untuk honor.
- Tarif demo per sesi Rp50.000 disimpan di `tutor_rates` sebagai seed/config dengan `is_demo_assumption=true`. Tandai nominalnya dengan badge "Tarif demo" di halaman Honor (D-20); nominal bukan aturan resmi UMKM.
- Data ekspor standar terdiri dari delapan kolom mentah UMKM. Semua status review ikut diekspor sesuai keputusan owner; materi/catatan/status/anomaly/honor tidak ikut report standar.
- Anomaly module adalah bagian baseline dan wajib mengklasifikasikan kandidat anomali, terutama `suspected_duplicate`, lalu menyimpan finding di `anomaly_flags`. AI bukan penentu status/honor; Admin membuat keputusan terpisah. Kegagalan provider tidak boleh menggagalkan penyimpanan sesi dan harus terlihat sebagai `failed`/`not_evaluated`.
- Admin/Tutor login dengan username + password. Orang Tua login hanya dengan ID Akses Orang Tua acak/rahasia, tanpa password, sesuai kebutuhan owner. ID tersebut harus berupa credential berentropi tinggi, bukan ID publik atau berurutan.
- Palet, font, logo, dan referensi visual spesifik belum final. Bangun dengan semantic design tokens dan komponen yang mudah diubah; jangan mengunci brand styling sebelum keputusan tim.

## Dokumen wajib dibaca

`00-START-HERE.md`, `01-PRD.md`, `03-TECHNICAL-ARCHITECTURE.md`, `04-API-CONTRACT.md`, `05-DATA-CONTRACT.md`, `06-TESTING-STRATEGY.md`, `07-DESIGN-GUIDELINES.md`, `11-ENVIRONMENT-SETUP.md`, `12-USER-FLOWS.md`, `14-ERD-AND-DATA-DICTIONARY.md`, `15-DASHBOARD-TABS.md`, `16-GOOGLE-SHEETS-MONTHLY-EXPORT.md`, `17-DECISIONS-AND-OPEN-QUESTIONS.md`, dan phase yang ditugaskan.

## Tech stack wajib

- Frontend: React 19.x, TypeScript strict, Vite, Tailwind CSS v4, Headless UI, komponen internal, React Router, Axios terpusat, TanStack Query, React Hook Form + Zod, TanStack Table dan Recharts seperlunya.
- Semua request frontend ke backend menggunakan satu Axios instance `frontend/src/lib/api-client.ts`, `withCredentials: true`, serta CSRF header dari `GET /auth/csrf` sesuai kontrak. Simpan CSRF token hanya di memory dan ambil ulang setelah login/session regeneration. Jangan memakai native `fetch` untuk API aplikasi dan jangan membuat Axios instance per komponen.
- Backend: Node.js 22+, TypeScript, Express 5, Zod.
- Database: Neon PostgreSQL + Drizzle ORM/Kit + `pg`.
- Integrasi: `googleapis` hanya untuk ekspor Admin-on-demand; modul AI anomaly termasuk baseline dengan adapter Gemini `@google/genai` saat credential live disiapkan. Tests harus memakai fake detector yang jelas dilabeli, bukan hasil live palsu.
- Tests: Vitest, Supertest, React Testing Library.
- Jangan install shadcn/ui atau UI kit besar tanpa persetujuan owner.

## Keamanan wajib

- Admin/Tutor: username + password hash. Parent: random secret access code, hanya satu field pada login.
- Untuk Parent, jangan gunakan `users.id`, student ID, NPM publik, telepon, tanggal lahir, atau kode urut. Simpan hanya digest HMAC dengan `PARENT_ACCESS_CODE_PEPPER`; tampilkan kode mentah hanya sekali saat generate/rotate.
- Rate limit percobaan login/parent access, gunakan generic login error, expiry sesi, logout, secure cookie, origin allowlist, dan CSRF defense untuk operasi mutasi.
- Jangan simpan session credential/access code di localStorage. Jangan log password, kode akses, private key atau secret.
- Role/scope checks dilakukan di backend. Tutor tidak bisa mengirim atas nama tutor lain; Parent hanya dapat membaca siswa terhubung lewat `parent_students`.
- PII dikurangi/pseudonymized sebelum dikirim ke model AI. AI finding tidak otomatis menolak sesi atau mengubah honor.

## Kualitas dan pola implementasi

- Pisahkan route/controller, schema, business service, repository/query dan integration adapter.
- Validasi Zod di backend adalah otoritatif; validasi frontend hanya untuk UX.
- Payroll dihitung di backend menggunakan decimal-safe arithmetic; nominal di UI hanya dari API.
- Gunakan `lesson_date` untuk filter harian/bulanan; `duration_minutes` adalah integer menit.
- Gunakan soft deactivation untuk master data yang direferensikan; jangan hard-delete histori. `users.is_active` mengontrol login; `tutors.is_active`/`students.is_active` mengontrol eligibility untuk sesi baru (pilihan Form Absensi).
- Gunakan komentar Bahasa Indonesia yang singkat hanya untuk alasan/aturan non-obvious; tidak perlu docstring panjang.
- Semua halaman memiliki loading, empty, error, success, disabled/loading states; pesan error tidak memaparkan detail internal.
- UI harus nyaman, ringkas, responsive, accessible, dan mengurangi input berulang dengan auto-fill Master Data.

## Honor demo

- Honor memakai tarif tunggal per sesi dari konfigurasi `HONOR_RATE_PER_SESSION` (default 50000), dikunci ke sesi saat approve (D-24); tidak ada tabel penugasan/tarif.
- Hanya sesi `approved` masuk honor estimasi.
- Jangan menyebarkan angka 50000 sebagai konstanta ke komponen/service; kalkulasi membaca `tutor_rates`/snapshot.
- Tandai nominal dari tarif demo dengan badge kecil "Tarif demo" di halaman Honor (D-20); jangan memakai label panjang di dashboard/halaman lain.
- Jangan menambahkan status pembayaran aktual pada MVP.

## Export Google Sheets

- Hanya backend memanggil Google API.
- Spreadsheet ID dan credential di backend environment/secret, bukan frontend.
- Export berdasarkan `lesson_date` dan bulan `YYYY-MM`; tab deterministik `Absensi YYYY-MM`.
- Delapan kolom mentah saja: `no`, `nama tutor`, `nama murid`, `kelas`, `asal sekolah`, `mata pelajaran`, `tanggal les`, `durasi les`.
- Ekspor standar memuat semua sesi pada periode terpilih tanpa memfilter status review. Ekspor ulang replace isi tab bulan yang sama, tidak append.
- Log `sheet_export_runs`; gagal export tidak mengubah data Neon dan UI tidak boleh mengklaim sukses sebelum write terkonfirmasi.

## Cara kerja agent

Sebelum mengedit: periksa tree, scripts, `git status`, dan dokumen kontrak; laporkan scope singkat dan asumsi. Sesudah mengedit: jalankan test/typecheck/lint/build yang tersedia, laporkan perintah dan hasil aktual, serta bedakan mock dari integrasi live. Jangan meminta atau mencetak secret. Jika menemukan konflik antar dokumen, ikuti keputusan owner terbaru dan perbarui dokumen/fixture/test yang terkait.
