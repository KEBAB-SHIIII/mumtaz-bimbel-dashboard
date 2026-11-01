# CLAUDE.md — Mumtaz Bimbel Development System

Petunjuk dan aturan operasional repositori untuk Claude Code dalam membangun sistem pencatatan sesi les dan progres belajar Bimbel Mumtaz Sampit.

---

## 1. Misi & Peran Utama

Membangun aplikasi full-stack TypeScript berbasis role (Admin, Tutor, Orang Tua) untuk Bimbel Mumtaz Sampit. Sistem memindahkan pencatatan dari form/spreadsheet manual ke dashboard terpusat yang aman, terstruktur, tervalidasi, dan efisien.

---

## 2. Aturan Arsitektur Mutlak (Non-Negotiable)

1. **Source of Truth Operasional**: Neon PostgreSQL adalah satu-satunya sumber kebenaran operasional data.
2. **Alur Submit Tutor**:
   - Tutor Dashboard $\rightarrow$ Express API $\rightarrow$ validasi Zod $\rightarrow$ Simpan ke Neon dengan `status='pending'` dan `anomaly_analysis_status='pending'`. Tutor mengisi jam mulai–selesai (durasi dihitung backend) dan 1–3 mata pelajaran per sesi.
   - **Dilarang keras**: Submit tutor TIDAK BOLEH memanggil Google Sheets API.
3. **Validitas Data (keputusan owner D-25)**:
   - Setelah submit, AI (baseline LLM Gemini, akan diganti model tim AI) melabeli validitas: **Valid** langsung dihitung ke honor & tagihan; **Perlu revisi** (durasi > 180 menit / mulai di atas 21.00) ditahan — Tutor dapat mengedit, Admin memilih status approval (hasil banding via WA); **Ditolak** (duplikat) ditahan, Tutor tidak dapat mengedit, Admin dapat menghapus.
   - Hanya sesi berstatus efektif `approved` yang dihitung. Admin memiliki CRUD penuh atas sesi dan dapat mengoreksi label AI kapan saja.
4. **Ekspor Google Sheets (Admin On-Demand)**:
   - Google Sheets HANYA menerima data saat Admin menekan tombol ekspor bulanan (berdasarkan `lesson_date` bulan `YYYY-MM`).
   - Ekspor standar hanya berisi **8 kolom mentah**: `no`, `nama tutor`, `nama murid`, `kelas`, `asal sekolah`, `mata pelajaran`, `tanggal les`, `durasi les`.
   - Seluruh status review ikut diekspor (keputusan owner O-08). Jangan menambahkan kolom status, honor, materi, ID teknis, atau flag anomali ke sheet standar ini.
   - Re-export bulan yang sama me-replace isi tab `Absensi YYYY-MM`, bukan menambah duplikat baris.
5. **Autentikasi & Keamanan Role**:
   - **Admin & Tutor**: Login dengan `username` + `password` (hash Argon2id / bcrypt).
   - **Orang Tua**: Login HANYA dengan 1 field **ID Akses Orang Tua** rahasia acak berentropi tinggi tanpa password.
   - Dilarang menggunakan ID publik, NPM siswa, atau nomor berurutan sebagai kredensial Orang Tua. Simpan hanya digest HMAC dengan `PARENT_ACCESS_CODE_PEPPER`.
   - Session berbasis cookie HttpOnly/SameSite dengan server-side session store (Neon PostgreSQL). Jangan simpan credential sesi di `localStorage`.
   - CSRF protection wajib untuk setiap request mutasi (`GET /auth/csrf` -> memory token).
6. **Modul Deteksi Anomali & Validitas**:
   - Rule engine membentuk kandidat (duplikat, durasi, jam mulai); tanpa kandidat sesi langsung Valid tanpa memanggil model. Temuan disimpan di `anomaly_flags`.
   - LLM memberi label validitas untuk sesi berkandidat (D-25). Label AI tidak pernah menimpa keputusan Admin, dan Admin selalu dapat mengoreksinya.
   - Kegagalan AI/screening tidak boleh membatalkan penyimpanan sesi absensi; sesi tetap menunggu validasi dan Admin menetapkan manual.
   - Unit tests offline WAJIB menggunakan deterministic fake detector, bukan fake live.
7. **Tarif & Honor (D-25)**:
   - Tarif les per jenjang (`backend/src/services/billing/tariff.ts`): SD 1-3 Rp50.000/jam, SD 4-6 Rp70.000/jam; ≤ 60 menit = 1 jam, tiap 30 menit penuh berikutnya +0,5×. Kelas mentok SD 6. Potongan Admin Rp10.000 flat per sesi; honor tutor = tarif kotor − potongan. Nilai ini hardcode sementara (tarif resmi UMKM O-01 terbuka).
   - Tarif kotor & potongan dikunci ke `rate_amount_snapshot` / `admin_fee_snapshot` saat sesi dihitung. Tidak ada penugasan tutor maupun tabel tarif (D-24).
8. **Satu Mode: Production** (keputusan owner D-23):
   - Aplikasi selalu berjalan dengan `NODE_ENV=production`, satu file env `backend/.env`, satu database Neon (branch production), Gemini, dan spreadsheet yang sama — termasuk saat development.
   - Tidak ada mode demo/dev, seed sintetis, atau reset data. Jangan menghapus/TRUNCATE data atau menulis data sintetis ke Neon tanpa persetujuan eksplisit owner. Test otomatis memakai PGlite + fixture, bukan Neon.

---

## 3. Tech Stack & Boundaries

| Layer           | Pilihan Teknologi Resmi                                                               | Aturan Khusus & Larangan                                                                                                                                        |
| :-------------- | :------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Monorepo**    | Node.js 22+, npm workspaces                                                           | Satu root lockfile. Folder `frontend/`, `backend/`, `packages/contracts/`.                                                                                      |
| **Language**    | TypeScript Strict                                                                     | Strict mode di root, frontend, dan backend. No loose `any`.                                                                                                     |
| **Frontend**    | React 19.x, Vite, Tailwind CSS v4 (`@tailwindcss/vite`), React Router, TanStack Query | **DILARANG** pasang `shadcn/ui`, Flowbite, daisyUI, MUI, atau Ant Design. Gunakan Headless UI (`@headlessui/react`) + `lucide-react` + komponen internal tipis. |
| **HTTP Client** | Axios terpusat (`frontend/src/lib/api-client.ts`)                                     | **DILARANG** menggunakan native `fetch` untuk request API aplikasi. Wajib menyertakan CSRF header dan `withCredentials: true`.                                  |
| **Backend**     | Express 5, Node.js 22+, Zod, `tsx`                                                    | Validasi Zod di backend adalah otoritas tertinggi.                                                                                                              |
| **Database**    | Neon PostgreSQL, Drizzle ORM, Drizzle Kit, `pg`                                       | Tidak boleh ada hard delete pada histori master data yang berelasi; gunakan soft deactivation (`is_active`).                                                    |
| **Integrasi**   | Google Sheets API (`googleapis`), Gemini API (`@google/genai`)                        | Sheets dipanggil backend saja saat Admin ekspor. Gemini untuk anomaly screening saat kredensial tersedia.                                                       |
| **Testing**     | Vitest, Supertest, React Testing Library, jsdom                                       | Test harus deterministik tanpa bergantung kredensial live.                                                                                                      |

---

## 4. Struktur Direktori Panduan (`docs/`)

Gunakan dokumen di folder `docs/` sebagai sumber spesifikasi normatif:

- `docs/00-START-HERE.md`: Orientasi ringkas & filosofi produk.
- `docs/01-PRD.md`: Cakupan fungsional, non-goals, dan acceptance criteria.
- `docs/02-AGENT-CONTEXT.md`: Pedoman keamanan, kualitas kode, dan cara kerja agent.
- `docs/03-TECHNICAL-ARCHITECTURE.md`: Arsitektur server, state machine sesi, dan diagram aliran.
- `docs/04-API-CONTRACT.md`: Kontrak endpoint, schema payload request/response.
- `docs/05-DATA-CONTRACT.md`: Format data, enum, state machine, dan validasi Zod.
- `docs/14-ERD-AND-DATA-DICTIONARY.md`: Skema tabel PostgreSQL dan relasinya.
- `docs/15-DASHBOARD-TABS.md`: Spesifikasi UI layout dan peranan dashboard per role.
- `docs/16-GOOGLE-SHEETS-MONTHLY-EXPORT.md`: Tata cara pemetaan kolom dan ekspor Google Sheets.
- `docs/phases/`: Panduan eksekusi bertahap (Phase 01 sampai Phase 09).

---

## 5. Alur Kerja Eksekusi Claude Code

1. **Pengerjaan Bertahap (Phase-by-Phase)**:
   - Kerjakan tugas secara bertahap mengikuti file di `docs/phases/phase-XX-*.md`.
   - Jangan mengerjakan fase berikutnya sebelum kriteria fase saat ini terverifikasi.
2. **Siklus Sebelum & Sesudah Edit**:
   - **Sebelum edit**: Tinjau git status dan file yang terdampak, laporkan scope perubahan secara ringkas.
   - **Setelah edit**: Jalankan typecheck, test, dan lint yang relevan. Laporkan hasil aktual secara faktual (jangan berasumsi atau memalsukan hasil test).
3. **Kerahasiaan Kredensial**:
   - Jangan pernah mencetak atau meng-commit file `.env`, service account key, atau kredensial nyata. Gunakan `.env.example`.
