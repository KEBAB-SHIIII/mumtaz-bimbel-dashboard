# Mumtaz Attendance & Learning Progress System

Blueprint capstone Asah untuk membantu Bimbel Mumtaz Sampit memindahkan pencatatan sesi les tutor ke aplikasi, melakukan review absensi, membuat rekap bulanan, menghitung estimasi honor, dan menampilkan riwayat pembelajaran anak.

> **Status:** Phase 01–09 selesai (QA: `docs/20-QA-REPORT.md`): fondasi monorepo, shared contracts, backend (database, auth, role guard, master data, absensi, penagihan, honor), dashboard tiga role, modul anomali (rule engine + Gemini + review Admin), alur submission–review termasuk revisi oleh Tutor, rekap & estimasi honor yang dapat ditelusuri ke sesi, serta ekspor absensi bulanan ke Google Sheets atas tindakan Admin. Honor memakai satu tarif tunggal Rp50.000 per sesi dari konfigurasi; Tutor memilih murid & mapel sendiri (tanpa penugasan) dan password tutor dibuat sistem + reset oleh Admin (D-24).

## Satu mode: production

Aplikasi **selalu berjalan dalam mode production** — saat ngoding maupun saat dipakai. Hanya ada **satu file env (`backend/.env`)**, satu database Neon, satu Gemini key, dan satu spreadsheet. Tidak ada mode dev/demo, seed sintetis, atau reset data: setiap perubahan langsung mengenai data asli, jadi uji coba dilakukan dengan hati-hati (test otomatis memakai database in-process, bukan Neon).

Prasyarat: Node.js 22+ (lihat `.nvmrc`) dan npm.

```bash
npm install
cp backend/.env.example backend/.env   # sekali; isi nilai asli, jangan commit
npm run prod                            # build lalu jalankan: http://localhost:3001
npm run dev                             # saat ngoding: hot reload di http://localhost:5173 (backend :3001, env sama)
```

| Script (root) | Fungsi |
|---|---|
| `npm run prod` | `build` lalu `start` — aplikasi persis seperti production di `http://localhost:3001` |
| `npm run dev` | Backend (`tsx watch`) + Vite (:5173, mem-proxy `/api` ke :3001) dengan env yang sama |
| `npm run build` / `npm start` | Build berurutan `contracts → backend → frontend` / jalankan build backend (menyajikan UI dari `FRONTEND_DIST_DIR`) |
| `npm run typecheck` / `npm run lint` / `npm test` | Pemeriksaan strict, ESLint (larangan `fetch`, `localStorage`, UI kit terlarang), Vitest offline |

| Script backend | Fungsi |
|---|---|
| `db:generate` / `db:check` | Generate migration dari `src/db/schema.ts` (review SQL sebelum commit) / validasi file migration |
| `db:migrate` (atau `start:migrate` dari build) | Terapkan migration ke Neon (koneksi direct `DATABASE_MIGRATION_URL`) |
| `db:bootstrap-admin` (atau `start:bootstrap-admin`) | Buat Admin dari `BOOTSTRAP_ADMIN_*` bila belum ada (idempoten, tidak menimpa password) |

Akun: Admin `admin` (password dari `BOOTSTRAP_ADMIN_PASSWORD`); Tutor login dengan username masing-masing; password tutor dibuat acak oleh sistem saat Admin menambah tutor (tampil sekali; tombol Reset password di Master Data → Tutor); ID Akses Orang Tua dibuat acak oleh Admin (Master Data → Orang Tua → rotasi kode). Kode hasil rotasi massal 30 Okt 2026 ada di `backend/secrets/parent-access-codes.txt` (tidak di-commit) — bagikan pribadi lalu hapus file itu.

Backend menolak start bila konfigurasi tidak aman: origin publik bukan HTTPS (localhost boleh HTTP), `DATABASE_URL` tanpa TLS, secret < 32 karakter/placeholder, password Admin < 12 karakter, atau `SEED_TUTOR_PASSWORD` diset. Cookie `Secure` otomatis aktif bila origin HTTPS. **Jangan mengganti `PARENT_ACCESS_CODE_PEPPER`** setelah dipakai: semua ID Akses Orang Tua menjadi tidak valid.

## Deploy ke server (opsional)

`Dockerfile` membungkus API + UI menjadi satu container yang memakai **`backend/.env` yang sama**; di server cukup ubah `FRONTEND_ORIGIN=https://domain-anda` dan `TRUST_PROXY=1`.

```bash
docker build -t mumtaz-bimbel .
docker run --rm --env-file backend/.env mumtaz-bimbel node dist/scripts/migrate.js   # sebelum setiap rilis
docker run -d --env-file backend/.env -p 3001:3001 \
  -v "$PWD/backend/secrets:/app/backend/secrets:ro" mumtaz-bimbel                    # key service account di-mount, tidak masuk image
```

- Probe: liveness `GET /api/v1/health`, readiness `GET /api/v1/health/ready` (query DB, 503 bila tidak siap). `SIGTERM` → shutdown bertahap.
- Cache: `assets/*` ber-hash `immutable` 1 tahun; `index.html` `no-cache`. Header keamanan Helmet (CSP `self`, HSTS, nosniff, frame-ancestors).
- Jalankan **satu instance** — worker anomali berjalan in-process (lock ekspor sudah berbasis PostgreSQL). Lihat docs/03 sebelum scale-out.

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
- Test UI memakai fake API in-memory (`frontend/src/test/fake-api/`, data sintetis) — hanya untuk test, tidak ikut build aplikasi.
- Code splitting per halaman + chunk vendor terpisah (cache jangka panjang).

### Modul anomali

Setelah submit/revisi, worker in-process menyaring kandidat duplikasi/durasi tidak wajar secara deterministik lalu (bila `GEMINI_API_KEY` + `GEMINI_MODEL` diisi) meminta Gemini mengklasifikasikannya dengan data **pseudonymous**. Temuan masuk `anomaly_flags` untuk direview Admin; status sesi dan honor tidak pernah diubah otomatis. Tanpa provider → `not_evaluated`; provider gagal/timeout → `failed`. Test offline memakai fake detector berlabel; UI menandai sumber hasil (AI live vs fake).

### Ekspor Google Sheets

Admin → Rekap → **Ekspor Absensi Bulanan ke Google Sheets**. Konfigurasi backend: `GOOGLE_SHEETS_EXPORT_ENABLED=true`, `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` (service account diberi akses Editor ke spreadsheet), opsional `GOOGLE_SHEETS_TIMEOUT_MS`. Tanpa konfigurasi, endpoint mengembalikan 503 dan UI menampilkan pesannya. Ekspor mengganti isi tab `Absensi YYYY-MM` secara atomik dan tercatat di riwayat ekspor. Test memakai fake exporter in-memory, tanpa credential.

### Testing backend

API/integration test memakai **PGlite** (PostgreSQL in-process) dengan migration yang sama seperti Neon dan seed fixture `@mumtaz/contracts/fixtures` — offline, deterministik (jam di-inject), tanpa credential live.

### Struktur workspace

```text
packages/contracts/  # shared Zod schema + types (@mumtaz/contracts)
backend/             # Express 5 API: src/{app,server}.ts, auth/, config/, db/ (schema, client, bootstrap admin), http/ (SPA statis), routes/, services/, middleware/, lib/, scripts/; drizzle/ (migration)
frontend/            # Vite + React 19 + Tailwind v4: src/{app,features,lib,styles,components/ui}
```

- `@mumtaz/contracts` diekspor dengan condition `source` (TypeScript langsung) untuk dev/test/typecheck, dan `dist/` untuk build production backend.
- Backend memvalidasi environment dengan Zod (`backend/src/config/env.ts`) saat startup. Pesan error hanya memuat nama variabel, bukan nilainya. Integrasi Sheets/Gemini yang belum dikonfigurasi dilaporkan `disabled`/`not_configured`, bukan sukses palsu.
- Frontend memakai satu Axios client (`frontend/src/lib/api-client.ts`, `withCredentials: true`) dengan CSRF token di memory yang dikirim sebagai `X-CSRF-Token` pada request mutasi.
- Design tokens semantik netral ada di `frontend/src/styles/tokens.css` (placeholder; palet/font final menunggu keputusan tim).
- TypeScript dipatok `~6.0` karena `typescript-eslint` belum mendukung TypeScript 7.
- Endpoint yang tersedia: health, auth (CSRF, login, parent-access, logout, me), `/admin/*` (dashboard, absensi + keputusan, rekap, payroll, ekspor Sheets, master data tutor/siswa/wali/mapel + reset password tutor), `/tutor/*` (dashboard, opsi murid & mapel, submit/riwayat/revisi absensi, honor, ganti password), `/parent/*` (anak terhubung, dashboard, progress). Kontrak: `docs/04-API-CONTRACT.md`.

## Alur utama (target produk)

1. Tutor login menggunakan username + password lalu mengisi Form Absensi pada Dashboard Tutor.
2. Backend Express memvalidasi role, murid/mapel aktif, tanggal, durasi, dan field wajib. Sesi disimpan ke Neon PostgreSQL dengan status awal `pending`.
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

## Tarif honor

Tarif les per jenjang: **SD 1-3 Rp50.000/jam, SD 4-6 Rp70.000/jam** (≤ 60 menit = 1 jam, tiap 30 menit penuh berikutnya +0,5×), dengan **potongan Admin Rp10.000 per sesi** (keputusan owner D-25, hardcode sementara di `backend/src/services/billing/tariff.ts`). Tarif kotor ditagihkan ke orang tua (Penagihan + invoice PDF); honor tutor = kotor − potongan. Nilainya dikunci ke sesi saat dihitung sehingga bulan lalu tidak berubah. Tidak ada penugasan tutor maupun master tarif (D-24).

## Mulai dari dokumentasi

1. Baca [`docs/00-START-HERE.md`](./docs/00-START-HERE.md).
2. Baca [`docs/01-PRD.md`](./docs/01-PRD.md), [`docs/02-AGENT-CONTEXT.md`](./docs/02-AGENT-CONTEXT.md), dan [`docs/03-TECHNICAL-ARCHITECTURE.md`](./docs/03-TECHNICAL-ARCHITECTURE.md).
3. Sinkronkan API/data contracts dengan ERD dan breakdown tabs: `docs/04-API-CONTRACT.md`, `docs/05-DATA-CONTRACT.md`, `docs/14-ERD-AND-DATA-DICTIONARY.md`, `docs/15-DASHBOARD-TABS.md`.
4. Ikuti user flow, spesifikasi ekspor Sheets, testing, dan phase docs.
5. Baca `docs/17-DECISIONS-AND-OPEN-QUESTIONS.md` untuk keputusan owner dan hal yang masih terbuka, serta `docs/20-QA-REPORT.md` untuk hasil QA.

## Keamanan dan integrasi

Semua credential live disiapkan owner pada backend environment/secret manager. Jangan menaruh secret di `VITE_*`, source, screenshot, prompt, atau log. Jika Google Sheets/model AI belum memiliki credential valid, gunakan adapter mock yang diberi label dan jangan menyatakan live integration sukses. Jalankan tests/typecheck/build yang tersedia dan laporkan hasil aktual.
