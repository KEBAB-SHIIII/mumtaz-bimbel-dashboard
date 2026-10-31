# Phase 06 — Attendance Submission, Anomaly Review, and Admin Verification

> **Catatan D-24 (30 Okt 2026):** penugasan tutor dan tarif per penugasan sudah dihapus. Istilah *assignment/penugasan/tarif demo* di dokumen fase ini bersifat historis; Tutor kini memilih murid dan mapel sendiri dan honor memakai satu tarif tunggal dari konfigurasi. Lihat `docs/17` D-24.

## Prerequisites

Phase 01–04 selesai untuk repository, kontrak, backend core, dan frontend shell. Phase 05 dapat dikerjakan paralel, tetapi anomaly screening harus terhubung pada integrasi baseline.

## Tujuan

Menyelesaikan alur utama: Tutor submit lewat form dashboard → backend validasi dan simpan ke Neon → anomaly screening menghasilkan indikasi → Admin review manual → sesi yang disetujui masuk rekap/honor/Progress Anak.

## Tugas

1. Implementasikan form Tutor dari penugasan aktif milik tutor login. Nama tutor, kelas dan sekolah berasal dari DB, bukan dipercaya dari input bebas.
2. Validasi `lesson_date`, `duration_minutes`, `learning_material` dan assignment di backend. Working default `learning_material` wajib (O-09 belum dikonfirmasi). Batas nilai durasi harus configurable; jangan menganggap threshold demo sebagai aturan UMKM.
3. Simpan `lesson_sessions` dengan status awal `pending` dan timestamp `submitted_at`/`updated_at`.
4. Setelah commit DB, jalankan anomaly screening melalui service terpisah. Temuan disimpan ke `anomaly_flags`; error AI tidak menghapus atau membatalkan sesi.
5. Jangan memanggil Google Sheets dari endpoint submit.
6. Implementasikan daftar/filter/detail Data Absensi Admin mengikuti delapan kolom inti UMKM, dengan status, anomaly finding dan tindakan review di luar kolom ekspor standar.
7. Implementasikan keputusan `approved`, `revision_requested`, `rejected`; alasan wajib untuk revisi/penolakan. Simpan Admin dan timestamp yang membuat keputusan.
8. Tutor hanya melihat sesi miliknya. Tutor hanya dapat mengubah sesi miliknya yang berstatus `revision_requested`; setelah revisi payload yang sama dikirim, status kembali `pending`, metadata review dan `admin_note` untuk payload lama direset, finding anomaly lama ditandai `superseded`, status analisis direset ke `pending`, lalu analisis ulang dijalankan.
9. Parent hanya dapat melihat anak yang terhubung melalui `parent_students` dan sesi approved; jangan expose catatan admin/anomali.
10. Terapkan filter periode memakai `lesson_date`.
11. Tampilkan status analysis (`pending`, `completed`, `failed`, `not_evaluated`) terpisah dari status sesi. Temuan tidak otomatis mengubah status atau honor.

## Acceptance criteria

- [ ] Form Tutor membuat tepat satu sesi ketika submit berhasil.
- [ ] Sesi baru tetap pending sampai Admin memutuskan.
- [ ] Request tutor palsu/assignment bukan miliknya ditolak.
- [ ] Anomaly service mengklasifikasikan kandidat duplikasi/pola, atau status analisis ditandai gagal/tidak dievaluasi bila provider belum tersedia.
- [ ] Data muncul di Riwayat Mengajar dan Data Absensi Admin.
- [ ] Admin dapat mereview finding anomaly terpisah dari status absensi.
- [ ] Parent access scope, status approved, dan data materi/catatan yang dipublikasikan diuji.
- [ ] Test mencakup validasi form, transisi status, pergantian bulan antara tanggal les dan submit, serta empty/error states.
