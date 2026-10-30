# Mumtaz Attendance & Learning Progress System

Blueprint capstone Asah untuk membantu Bimbel Mumtaz Sampit memindahkan pencatatan sesi les tutor ke aplikasi, melakukan review absensi, membuat rekap bulanan, menghitung estimasi honor, dan menampilkan riwayat pembelajaran anak.

> **Status:** Phase 01–07 selesai: fondasi monorepo, shared contracts + fixture, backend core (database, auth, role guard, master data, absensi, rekap, honor), frontend shell tiga role, modul anomali (rule engine + Gemini + review Admin), alur submission–review end-to-end termasuk revisi oleh Tutor, serta rekap & estimasi honor yang dapat ditelusuri ke sesi. Ekspor Google Sheets (Phase 08) belum dibangun. Data dan akun contoh sintetis. Tarif Rp50.000 per sesi adalah nilai demo, bukan tarif resmi UMKM (ditandai badge "Tarif demo" di halaman Honor).

## Menjalankan secara lokal

Prasyarat: Node.js 22+ (lihat `.nvmrc`) dan npm.

```bash
npm install                          # satu lockfile root untuk semua workspace
cp backend/.env.example backend/.env # isi nilai lokal; jangan commit
cp frontend/.env.example frontend/.env
npm run dev                          # backend :3001 + frontend :5173
```

| Script (root) | Fungsi |
|---|---|
| `npm run dev` | Menjalankan backend (`tsx watch`) dan frontend (Vite) bersamaan |
| `npm run build` | Build berurutan: `packages/contracts` → `backend` → `frontend` |
| `npm run typecheck` | `tsc --noEmit` strict di semua workspace |
| `npm run lint` | ESLint flat config root (termasuk larangan `fetch`, `localStorage`, dan UI kit terlarang di frontend) |
| `npm test` | Vitest semua workspace; offline, tanpa credential live |

### Database (Neon development)

```bash
npm run db:migrate -w backend          # terapkan migration di backend/drizzle (pakai DATABASE_MIGRATION_URL)
npm run db:bootstrap-admin -w backend  # buat Admin dari BOOTSTRAP_ADMIN_* (idempoten, tidak menimpa password)
npm run db:seed -w backend             # seed SINTETIS (ditolak di production; idempoten, tidak menghapus data)
npm run db:reset-dev -w backend -- --yes  # RESET TOTAL DB dev lalu seed ulang (hanya branch development)
```

| Script backend | Fungsi |
|---|---|
| `db:generate` | Generate migration dari `src/db/schema.ts` (review SQL sebelum commit) |
| `db:check` | Validasi konsistensi file migration |
| `db:migrate` | Terapkan migration; **jangan** ke DB UMKM tanpa izin owner |
| `db:bootstrap-admin` / `db:seed` | Akun Admin awal / master data + dataset dev sintetis (~150 sesi Sep–Okt 2026) |
| `db:reset-dev -- --yes` | Hapus semua data (schema tetap) lalu seed ulang dalam satu transaksi; ditolak di production |

Akun demo setelah seed (nama fiktif): Admin `BOOTSTRAP_ADMIN_USERNAME`; Tutor `farhan`, `noreen`, `fazrin`, `rama`, `giyas`, `nasywa` dengan password `SEED_TUTOR_PASSWORD`; Orang Tua (mis. Sari, wali Aisyah) dengan ID akses fixture `MUMTAZ-DEMO-PARENT-ACCESS-ONLY`, Budi `MUMTAZ-DEMO-PARENT-B-ACCESS-ONLY`, wali lain `MUMTAZ-DEMO-PARENT-03` s.d. `-08` (test/dev saja; kode produksi dibuat acak 128-bit oleh Admin).

Dataset dev (`buildDevDataset` di `@mumtaz/contracts/fixtures`) sengaja memuat duplikat, duplikat lintas tutor, dan durasi > 180 menit; semua sesi masuk dengan status analisis `pending` sehingga worker menganalisisnya lewat Gemini saat backend start.

### Keamanan backend

- Session: cookie opaque `mumtaz.sid` (HttpOnly, SameSite=Lax, Secure di production), store PostgreSQL `app_sessions` via `connect-pg-simple`, idle timeout bergulir `SESSION_IDLE_TIMEOUT_MINUTES`, regenerasi session ID saat login/ganti password.
- CSRF: `GET /auth/csrf` → token di memory frontend → header `X-CSRF-Token` + Origin wajib = `FRONTEND_ORIGIN` untuk semua mutasi (termasuk login).
- Password Admin/Tutor: Argon2id (parameter OWASP); Orang Tua: HMAC-SHA-256 + `PARENT_ACCESS_CODE_PEPPER`, kode mentah hanya ditampilkan sekali.
- Revocation: ganti password, rotasi kode, atau nonaktifkan login langsung mencabut session aktif (`users.credential_version`).
- Rate limit percobaan gagal; respons gagal login generik; log JSON terstruktur tanpa body/cookie/parameter query.

### Frontend

- Route per role: `/admin` (Dashboard, Data Absensi, Rekap, Honor Tutor, Master Data), `/tutor` (Dashboard, Form Absensi, Riwayat Mengajar, Honor Saya, Profil), `/orang-tua-murid` (Progress Anak, Riwayat Pembelajaran); login di `/login` dan `/login/orang-tua`. Guard route hanya untuk UI — backend tetap otoritas izin.
- Data: feature API functions → satu Axios client (`src/lib/api-client.ts`) → TanStack Query. Setiap respons divalidasi dengan schema `@mumtaz/contracts`. Periode dan filter disimpan di URL (`?period=YYYY-MM`) sehingga menjadi bagian query key.
- CSRF token di memory; `403 CSRF_INVALID` → token diambil ulang lalu request diulang sekali; `401` → cache dibersihkan dan kembali ke login. Cache dibersihkan total saat login/logout.
- **Mode demo** (`npm run dev:demo -w frontend`): fake API adapter in-memory berbasis fixture sintetis, dengan banner "Mode Demo". Build live tidak memuat chunk/fixture demo sama sekali.
- Code splitting per halaman + chunk vendor terpisah (cache jangka panjang).

### Modul anomali

Setelah submit/revisi, worker in-process menyaring kandidat duplikasi/durasi tidak wajar secara deterministik lalu (bila `GEMINI_API_KEY` + `GEMINI_MODEL` diisi) meminta Gemini mengklasifikasikannya dengan data **pseudonymous**. Temuan masuk `anomaly_flags` untuk direview Admin; status sesi dan honor tidak pernah diubah otomatis. Tanpa provider → `not_evaluated`; provider gagal/timeout → `failed`. Test offline memakai fake detector berlabel; UI menandai sumber hasil (AI live vs fake).

### Testing backend

API/integration test memakai **PGlite** (PostgreSQL in-process) dengan migration yang sama seperti Neon dan seed fixture `@mumtaz/contracts/fixtures` — offline, deterministik (jam di-inject), tanpa credential live.

### Struktur workspace

```text
packages/contracts/  # shared Zod schema + types (@mumtaz/contracts)
backend/             # Express 5 API: src/{app,server}.ts, auth/, config/, db/ (schema, seed), routes/, services/, middleware/, lib/, scripts/; drizzle/ (migration)
frontend/            # Vite + React 19 + Tailwind v4: src/{app,features,lib,styles,components/ui}
```

- `@mumtaz/contracts` diekspor dengan condition `source` (TypeScript langsung) untuk dev/test/typecheck, dan `dist/` untuk build production backend.
- Backend memvalidasi environment dengan Zod (`backend/src/config/env.ts`) saat startup. Pesan error hanya memuat nama variabel, bukan nilainya. Integrasi Sheets/Gemini yang belum dikonfigurasi dilaporkan `disabled`/`not_configured`, bukan sukses palsu.
- Frontend memakai satu Axios client (`frontend/src/lib/api-client.ts`, `withCredentials: true`) dengan CSRF token di memory yang dikirim sebagai `X-CSRF-Token` pada request mutasi.
- Design tokens semantik netral ada di `frontend/src/styles/tokens.css` (placeholder; palet/font final menunggu keputusan tim).
- TypeScript dipatok `~6.0` karena `typescript-eslint` belum mendukung TypeScript 7.
- Endpoint yang tersedia: health, auth (CSRF, login, parent-access, logout, me), `/admin/*` (dashboard, absensi + keputusan, rekap, payroll, master data), `/tutor/*` (dashboard, assignment, submit/riwayat/revisi absensi, honor, ganti password), `/parent/*` (anak terhubung, dashboard, progress). Kontrak: `docs/04-API-CONTRACT.md`.

## Alur utama (target produk)

1. Tutor login menggunakan username + password lalu mengisi Form Absensi pada Dashboard Tutor.
2. Backend Express memvalidasi role, assignment, tanggal, durasi, dan field wajib. Sesi disimpan ke Neon PostgreSQL dengan status awal `pending`.
3. Anomaly module mengklasifikasikan indikasi seperti dugaan duplikasi/pola tidak wajar. Temuan ditampilkan pada Admin untuk review dan tidak otomatis menolak sesi/mengubah honor.
4. Admin meninjau sesi dan menyetujui, meminta revisi, atau menolak. Hanya sesi `approved` yang masuk estimasi honor dan Progress Anak.
5. Tutor melihat riwayat dan estimasi honor miliknya; orang tua melihat catatan belajar anak yang terhubung ke akun mereka.
6. Admin dapat mengekspor report absensi bulanan secara langsung ke Google Sheets lewat Google Sheets API saat dibutuhkan. Ekspor bukan bagian dari submit tutor.

## Peran Google Sheets

Neon adalah satu-satunya sumber data utama aplikasi. Google Sheets hanya menjadi tujuan ekspor bulanan yang dipicu Admin—tidak ada auto-sync setiap submit, import rutin, atau sinkronisasi dua arah pada MVP.

Ekspor standar memakai delapan kolom mentah: `no`, `nama tutor`, `nama murid`, `kelas`, `asal sekolah`, `mata pelajaran`, `tanggal les`, `durasi les`. Ekspor mencakup semua sesi yang disubmit pada periode terpilih tanpa memfilter status review, termasuk `pending`, `approved`, `revision_requested`, dan `rejected`. Ekspor ulang memperbarui tab `Absensi YYYY-MM`, bukan append duplikat. Materi pembelajaran tetap disimpan di database dan tidak masuk laporan standar.

## Login dan akses

- Admin/Tutor: username + password.
- Orang Tua: satu ID Akses Orang Tua acak/rahasia, tanpa password sesuai kebutuhan UX. Kode bukan ID publik/berurutan dan disimpan sebagai digest; backend melakukan rate limit dan membatasi data hanya untuk anak yang terhubung.
- Session credential tidak disimpan di localStorage. Gunakan cookie HttpOnly, CSRF defense dan role/scope check server-side.

## Tiga route utama frontend

- `/admin` — Admin.
- `/tutor` — Tutor.
- `/orang-tua-murid` — Orang Tua/Wali.

Ini adalah entry route dashboard, bukan jumlah REST API endpoint. Backend tetap memiliki endpoint internal per domain.

## Stack

Semua source aplikasi ditulis dalam TypeScript:

- Frontend: React 19.x, Vite, Tailwind CSS v4, Headless UI, React Router, Axios terpusat, TanStack Query/Table, React Hook Form + Zod, Recharts, Lucide React.
- Backend: Node.js 22+, Express 5, TypeScript, Zod.
- Database: Neon PostgreSQL, Drizzle ORM/Drizzle Kit, `pg`.
- Integrasi: `googleapis` untuk ekspor Sheets dan modul anomaly sebagai bagian baseline. Gemini melalui `@google/genai` menjadi provider live yang direncanakan; credential disiapkan kemudian, sementara test menggunakan fake detector yang dilabeli jelas.
- Testing: Vitest, Supertest, React Testing Library.

Jangan pasang shadcn/ui tanpa persetujuan owner. Palet warna, typography, logo, dan referensi visual final belum diputuskan tim; gunakan semantic design tokens yang mudah diganti.

## Tarif demo

Development menggunakan tarif **Rp50.000 per sesi** dalam `tutor_rates`, ditandai `is_demo_assumption=true`. Semua UI yang menunjukkan nilai demo wajib menampilkan keterangan bahwa nominal simulasi, bukan tarif resmi UMKM. Hanya sesi approved dihitung.

## Mulai dari dokumentasi

1. Baca [`docs/00-START-HERE.md`](./docs/00-START-HERE.md).
2. Baca [`docs/01-PRD.md`](./docs/01-PRD.md), [`docs/02-AGENT-CONTEXT.md`](./docs/02-AGENT-CONTEXT.md), dan [`docs/03-TECHNICAL-ARCHITECTURE.md`](./docs/03-TECHNICAL-ARCHITECTURE.md).
3. Sinkronkan API/data contracts dengan ERD dan breakdown tabs: `docs/04-API-CONTRACT.md`, `docs/05-DATA-CONTRACT.md`, `docs/14-ERD-AND-DATA-DICTIONARY.md`, `docs/15-DASHBOARD-TABS.md`.
4. Ikuti user flow, spesifikasi ekspor Sheets, testing, dan phase docs.
5. Baca `docs/18-AUDIT-REPORT.md` untuk temuan audit dokumentasi v3, perbaikan yang sudah diterapkan pada paket ini, dan keputusan provisional yang masih perlu owner konfirmasi.

## Keamanan dan integrasi

Semua credential live disiapkan owner pada backend environment/secret manager. Jangan menaruh secret di `VITE_*`, source, screenshot, prompt, atau log. Jika Google Sheets/model AI belum memiliki credential valid, gunakan adapter mock yang diberi label dan jangan menyatakan live integration sukses. Jalankan tests/typecheck/build yang tersedia dan laporkan hasil aktual.
