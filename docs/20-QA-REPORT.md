# QA Report — Phase 09 (Integration QA & Demo)

Tanggal: 30 Oktober 2026 · Lingkungan: branch Neon **development**, spreadsheet **demo** "Laporan Absensi Mumtaz (Demo)", data sintetis (nama fiktif).

## 1. Automated checks (root)

| Perintah | Hasil |
|---|---|
| `npm run typecheck` | Lulus (strict, semua workspace) |
| `npm run lint` | Lulus |
| `npm test` | contracts 48 · backend 226 · frontend 46 — semua lulus, offline tanpa credential |
| `npm run build` | Lulus (contracts → backend → frontend) |
| `docker build` | Lulus; container `NODE_ENV=production` terverifikasi (health, readiness, SPA, cache, header keamanan, migrator, SIGTERM) |

Test perjalanan lintas role offline: `backend/tests/e2e-journey.test.ts` (submit → revisi → approve → Orang Tua → honor → rekap → ekspor/re-export).

## 2. QA live (Neon dev + Google Sheets demo + Gemini)

Dijalankan lewat HTTP penuh (cookie session, CSRF, Origin) terhadap app yang sama dengan production.

| # | Skenario (phase-09) | Hasil |
|---|---|---|
| 3 | Tutor submit → `201`, `pending`, analisis `pending`; riwayat ekspor tidak bertambah (tanpa Sheets) | PASS |
| 4 | Admin filter Oktober (+1 sesi), minta revisi → Tutor memperbaiki → approve | PASS |
| 5 | Tutor lain: revisi sesi Farhan `404`, endpoint Admin `403` | PASS |
| 6 | Orang Tua (kode fixture): hanya sesi approved anak terhubung; anak lain `403`; kode salah `401` ×5 lalu `429` | PASS |
| 7 | Honor Farhan +Rp50.000 (tarif demo), dapat ditelusuri ke sesi; ekspor live Oktober = 81 baris = jumlah sesi Neon, 8 kolom | PASS |
| 8 | Submit sesi baru → re-export: 81 → 82 baris, satu tab, tanpa duplikasi | PASS |
| 9 | Spreadsheet tidak ada → `503` "Spreadsheet tujuan tidak ditemukan…", run `failed` dengan pesan aman, data Neon utuh | PASS |
| 10 | Gemini live: duplikat persis → analisis `completed`, temuan duplikasi dengan alasan berbahasa Indonesia | PASS |

Isi tab diverifikasi read-only: header tepat 8 kolom, `no` berurutan 1..N, semua tanggal dalam periode, tanpa status/ID/honor. Sesi QA berlabel "QA Phase 09" (duplikat uji ditolak Admin).

## 3. Acceptance criteria

- Semua role flow utama dapat didemokan end-to-end — offline (journey test) dan live.
- Auth/authorization akses silang dites (Tutor↔Tutor, Tutor→Admin, Orang Tua→anak lain, rate limit).
- Filter bulan konsisten: Data Absensi = Rekap = Dashboard = ekspor (berbasis `lesson_date`).
- Honor dapat ditelusuri ke sesi sumber dan snapshot tarif (Σ baris counted = estimasi).
- Ekspor Google sesuai format dan idempotent per tab bulan.
- Tidak ada secret di repository, bundle client, atau log (scan: file tracked, `frontend/dist`, source).

## 4. Risiko & keputusan terbuka

Lihat `17-DECISIONS-AND-OPEN-QUESTIONS.md` §2 (O-01…O-16) dan §3. Ringkas: tarif resmi UMKM (O-01), spreadsheet UMKM production + izin (O-02), kriteria/threshold anomali (O-03), migrasi data historis (O-04), referensi desain final (O-05), SOP distribusi ID Akses Orang Tua (O-06), payment tracking (O-07); operasional: satu instance, kuota Gemini 429, host/domain/branch Neon production belum ditentukan.

## 5. Addendum D-24 (30 Okt 2026) — tanpa penugasan & tarif, password tutor acak

- Migration 0003–0004 dijalankan ke Neon setelah cadangan lokal: 150 sesi tetap ada, 0 ketidakcocokan tutor/murid/mapel/snapshot terhadap cadangan; tabel `tutor_assignments`/`tutor_rates` dan kolom lama hilang. Test otomatis (`migration-direct-refs.test.ts`) menguji migrasi pada database berisi.
- Browser (Chrome, mode production): tambah tutor (password acak sekali tampil) → login tutor → pilih murid (kotak pencarian) & mapel → submit → Admin setujui → Honor Saya Rp50.000 tanpa badge demo → reset password (password lama ditolak, baru berhasil). API: session lama dicabut setelah reset (`200 → 401`).
- Bug UX yang ditemukan dan diperbaiki: saat sesi dicabut/berakhir di tengah pemakaian, halaman macet di "Memuat data…" — kini langsung diarahkan ke login (test regresi `tutor-accounts.test.tsx`). Error render saat logout (AppShell) ikut dibereskan.
- Data uji (tutor `qa.*`, sesi, temuan) dibersihkan; Neon kembali 150 sesi / 6 tutor.
