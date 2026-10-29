# Implementation Checklist

## A. Fondasi dan kontrak

- [ ] Dokumen kontrak terbaru dibaca dan tidak ada alur import/auto-sync Sheets sebagai sumber input.
- [ ] Monorepo, TypeScript strict, shared Zod contracts, dan validasi environment tersedia.
- [ ] Drizzle schema dan migrations mengikuti ERD.
- [ ] Synthetic fixtures ditandai sebagai data demo; tidak ada credential UMKM.

## B. Autentikasi, keamanan, dan Master Data

- [ ] Admin/Tutor login username-password; Orang Tua login hanya dengan ID Akses Orang Tua rahasia.
- [ ] Password Admin/Tutor di-hash; ID akses Parent disimpan sebagai digest berkunci, bukan plaintext.
- [ ] Rate limit autentikasi, respons gagal generik, expiry/logout, PostgreSQL-backed session store, `GET /auth/csrf`, cookie aman, Origin/CSRF defense, dan role/scope checks diterapkan server-side.
- [ ] CRUD/deactivation tutor, siswa, parent links/access ID, mata pelajaran, assignment, dan tarif.
- [ ] Admin dapat membuat/merotasi ID akses orang tua; kode mentah ditampilkan sekali dan tidak masuk log.
- [ ] Tutor-siswa-mapel divalidasi dari assignment aktif.
- [ ] Data master yang direferensikan sesi tidak dihapus permanen dengan hard delete.

## C. Form Tutor dan catatan sesi

- [ ] Form berisi assignment/siswa, tanggal les, durasi menit, `learning_material`, catatan pembelajaran dan fokus opsional.
- [ ] Nama tutor diturunkan dari session; kelas/sekolah dari Master Data.
- [ ] POST form membuat satu `lesson_sessions` berstatus awal `pending` di Neon; retry dengan `client_submission_id` yang sama tidak membuat sesi kedua.
- [ ] Anomaly screening dijalankan melalui service terpisah setelah penyimpanan; tidak ada call Sheets pada submit.
- [ ] Tutor hanya melihat sesi miliknya.
- [ ] Revisi hanya dapat dilakukan pada sesi milik Tutor yang `revision_requested`; revisi kembali ke `pending`.

## D. Admin Data Absensi dan anomali

- [ ] Delapan kolom utama mengikuti format absensi UMKM.
- [ ] Status dan tindakan review ditampilkan di aplikasi tanpa mengubah header ekspor standar.
- [ ] Filter periode berdasarkan `lesson_date`.
- [ ] Admin dapat approve/revision/reject; alasan revisi/penolakan dicatat.
- [ ] AI anomaly module mengklasifikasikan kandidat duplikasi/pola dan menyimpan `anomaly_flags`.
- [ ] Temuan anomaly terpisah dari status sesi, perlu review manusia, dan tidak auto-delete/auto-reject.
- [ ] AI error tidak menghapus sesi yang sudah tersimpan dan tidak menampilkan hasil palsu.

## E. Rekap, honor, dan Progress Anak

- [ ] Rekap per bulan dapat dikelompokkan berdasarkan tutor/siswa/mapel.
- [ ] Honor dihitung hanya dari sesi approved.
- [ ] Tarif demo Rp50.000 per sesi berasal dari data `tutor_rates`, bukan konstanta tersebar.
- [ ] UI honor menampilkan `Simulasi — bukan tarif resmi UMKM` selama memakai data demo.
- [ ] Parent hanya melihat siswa yang terkait dengan ID akses yang login dan hanya sesi approved.
- [ ] Progress Anak menampilkan materi/catatan yang boleh dipublikasikan.
- [ ] Estimasi honor tidak disebut sebagai pembayaran aktual; payment tracking tidak dibuat tanpa scope.

## F. Google Sheets monthly export

- [ ] Ekspor hanya dapat dimulai Admin dan berjalan saat diminta.
- [ ] Query periode `YYYY-MM` berdasarkan `lesson_date`.
- [ ] Header tepat delapan kolom mentah dan urutannya benar; tanpa status, materi, anomaly, honor atau ID internal.
- [ ] Working default sementara: semua status review masuk report standar sesuai keputusan owner.
- [ ] Tab `Absensi YYYY-MM` dibuat bila belum ada.
- [ ] Re-export menulis ulang tab bulan sama dan membersihkan sisa row lama; tidak append duplikat.
- [ ] Export kosong tidak menimpa report berisi tanpa konfirmasi Admin.
- [ ] `sheet_export_runs` mencatat succeeded/failed; error credential/API ditampilkan aman.
- [ ] Kegagalan ekspor tidak mengubah data Neon.

## G. UX, tests, dan dokumentasi

- [ ] Seluruh halaman memiliki loading, empty, error, success, disabled/loading states.
- [ ] Form menghindari input berulang melalui auto-fill dan pilihan assignment yang valid.
- [ ] Parent login adalah satu field; helper text menjelaskan ID akses bersifat privat.
- [ ] Design memakai semantic tokens; palet/typography/logo final menunggu referensi tim.
- [ ] Test mencakup auth/access scope, submit/review, anomali/duplikasi, period filter, payroll demo dan ekspor.
- [ ] Typecheck, lint, tests dan build dijalankan serta hasil aktual dilaporkan.
- [ ] Tidak ada credential di Git/log/client bundle; session tidak disimpan di localStorage dan mutasi memakai CSRF defense.
