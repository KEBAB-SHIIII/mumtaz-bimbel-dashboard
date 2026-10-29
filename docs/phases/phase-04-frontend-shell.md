# Phase 04 — Frontend Role Shell and Fake API Adapter

## Tujuan

Bangun shell navigasi role Admin, Tutor dan Orang Tua serta halaman dasar dengan fake API adapter yang mengikuti `04-API-CONTRACT.md`. Phase bisa berjalan paralel dengan backend setelah Phase 02 selesai.

## Tugas

1. Ikuti `13-DEPENDENCIES-AND-UI-LIBRARY.md`: React 19 + TypeScript strict, Tailwind v4, Headless UI, Lucide, Axios dan TanStack Query. Jangan gunakan shadcn/ui.
2. Routes: login Admin/Tutor (username+password), login Orang Tua (ID akses saja); Admin Dashboard/Data Absensi/Rekap/Honor Tutor/Master Data; Tutor Dashboard/Form Absensi/Riwayat Mengajar/Honor Saya/Profil (read-only + form ganti password via `PATCH /tutor/me/password`); Parent Dashboard/Progress Anak/Riwayat Pembelajaran.
3. Role-based layouts/navigation berdasarkan user login. Ini hanya UI; backend tetap jadi otoritas izin.
4. Buat reusable `AppShell`, `Sidebar`, `Topbar`, `PageHeader`, `PeriodSelector`, `StatusBadge`, `DataTable`, `EmptyState`, `LoadingState`, `ErrorState` dan `ConfirmDialog` seperlunya.
5. Dashboard Admin: KPI periode, pending verification, sesi terbaru, ringkasan honor jika rate siap.
6. Data Absensi: delapan kolom inti, filter period/tutor/siswa/status, status dan aksi admin.
7. Rekap: filter bulan dan group by; tombol export bisa disabled/mock until Phase 08.
8. Honor Tutor: period summary dan row detail, label asumsi tarif jika masih demo.
9. Master Data: submenu Tutor, Siswa, Orang Tua/Wali, Mata Pelajaran, Penugasan, Tarif Honor.
10. Tutor form: tutor dari auth context, pilihan assignment, auto-fill kelas/sekolah, tanggal, durasi menit, materi dan catatan.
11. Tutor history/payroll memakai current tutor session; tidak menampilkan data tutor lain.
12. Parent progress hanya menampilkan data anak terhubung dan sesi approved; mendukung pilihan anak/periode. Login Parent satu field ID akses rahasia, bukan public student ID.
13. HTTP request harus melalui shared Axios instance dan feature API functions; data fetching lewat TanStack Query. Jangan native `fetch` untuk app APIs.
14. Tambahkan loading/error/empty/validation/submit-disabled/accessibility states. Gunakan semantic tokens neutral placeholder; warna/font final menunggu hasil diskusi tim.

## Acceptance criteria

- [ ] Navigasi berbeda sesuai role dan tidak membocorkan menu.
- [ ] Tiga role punya route/page skeleton sesuai kontrak.
- [ ] Monthly selector mengubah query/cache key.
- [ ] Fake API shape sama dengan contract dan diberi label demo.
- [ ] UI tests/typecheck/lint/build relevan lulus.
