# Phase 09 — Integration QA and Demo

## Tujuan

Memverifikasi flow lintas role dan integrasi export end-to-end, lalu mempersiapkan demo dengan data sintetis tanpa mengklaim hasil yang belum diuji.

## Tugas

1. Jalankan lint/typecheck/unit tests/integration tests/build dari root sesuai scripts yang tersedia.
2. Buat dataset demo: admin, tutor, parent child-link dan access-code fixture (test only), assignment, subject, tarif Rp50.000/sesi dengan `is_demo_assumption=true`, sesi berbeda bulan/status dan anomaly candidate.
3. Login sebagai Tutor, submit sesi, pastikan status awal pending dan sesi masuk Neon tanpa call Sheets.
4. Login sebagai Admin, filter bulan, verifikasi/ minta revisi sesi, lihat rekap dan estimasi honor.
5. Login sebagai Tutor lain dan pastikan data tutor pertama tidak dapat diakses.
6. Login Parent memakai access-code fixture test-only; pastikan hanya progress anak terhubung dan sesi approved terlihat. Uji kode salah/rate limit.
7. Export satu bulan ke spreadsheet demo. Cocokkan row count dan delapan kolom dengan query Neon.
8. Re-export bulan yang sama setelah mengubah sesi approved; pastikan tab bulan diperbarui tanpa duplikasi.
9. Matikan sementara permission/API pada test terkontrol dan pastikan export gagal dengan pesan yang jujur tanpa merusak DB.
10. Uji klasifikasi anomali/duplikasi memakai provider fake pada test suite. Lakukan smoke test Gemini live dengan data sintetis/pseudonymous ketika credential disiapkan; jangan mengklaim hasil live jika belum dijalankan.
11. Perbarui README/env setup dari implementasi nyata. Jangan menyebut live integration jika hanya memakai mock.
12. Catat detail eksternal yang belum diputuskan: tarif UMKM resmi (mode per sesi untuk development sudah diputuskan), spreadsheet ID/izin/tab target, threshold anomali, kebutuhan migrasi data historis, distribusi ID akses Parent, payment tracking, dan final design references.

## Acceptance criteria

- [ ] Semua role flows utama bisa didemokan dari awal hingga akhir.
- [ ] Auth/authorization dites untuk akses silang.
- [ ] Month filter benar dan konsisten lintas halaman.
- [ ] Honor bisa ditelusuri ke sesi sumber dan tarif.
- [ ] Google export sesuai format dan idempotent untuk tab bulan.
- [ ] Tidak ada secret di repository/console/client.
- [ ] Ringkasan test dan risiko diketahui oleh reviewer.
