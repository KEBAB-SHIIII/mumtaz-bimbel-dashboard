# Phase 01 — Repository Foundation

## Tujuan

Siapkan monorepo TypeScript, frontend React/Vite/Tailwind, backend Express, config, scripts lint/test/typecheck/build dan health check.

## Tugas

1. Periksa repository tree dan Git status; pertahankan dokumen serta contoh data.
2. Siapkan npm workspaces dan satu lockfile root.
3. Buat `frontend/` dengan Vite React + TypeScript strict.
4. Setup Tailwind CSS v4 via `tailwindcss` + `@tailwindcss/vite`; stylesheet memakai `@import "tailwindcss";`.
5. Gunakan `@headlessui/react`, `lucide-react` dan komponen internal tipis. Jangan pasang shadcn/ui, Flowbite, daisyUI, MUI atau Ant Design.
6. Setup Router, TanStack Query, shared Axios client, lint/test/build scripts, Vitest + React Testing Library + jsdom.
7. Buat `backend/` Node.js 22+, TypeScript, Express 5, Zod dan `tsx`; backend bukan Python.
8. Siapkan Drizzle ORM/Kit + `pg` untuk Neon. Unit tests tidak boleh memerlukan credential live.
9. Buat validasi environment dengan Zod dan `.env.example`; integrasi eksternal boleh disabled dalam mode test, tetapi jangan fake success.
10. Tambahkan `GET /api/v1/health` beserta test.
11. Sediakan baseline auth/session configuration dan `.env.example` untuk `SESSION_SECRET`, `PARENT_ACCESS_CODE_PEPPER`, `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_PASSWORD`.
12. Siapkan semantic design tokens placeholder; jangan finalisasi palet/font sebelum keputusan tim.
11. Buat `.gitignore`; jangan memasukkan credential nyata.
12. README menjelaskan flow form Tutor → Neon dan export Sheets manual-on-demand.

## Kriteria selesai

- [ ] Frontend build dan smoke test berhasil.
- [ ] Tailwind v4 memakai plugin Vite resmi.
- [ ] Backend health mengembalikan 200.
- [ ] Root scripts test/typecheck/lint/build tersedia atau keterbatasannya didokumentasikan.
- [ ] Tidak ada credential ter-commit.
- [ ] Dokumen dan examples tetap ada.

## Jangan dikerjakan

Belum ada integrasi Sheets/Gemini live, CRUD lengkap, payroll atau report. Jangan membuat alur import Sheet sebagai input utama. Panel role belum harus lengkap pada fase fondasi; shell dibangun di Phase 04.
