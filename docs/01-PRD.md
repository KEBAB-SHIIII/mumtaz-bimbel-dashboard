# PRD — Mumtaz Attendance & Learning Progress System

## 1. Ringkasan

Sistem harus mengurangi pekerjaan manual/repetitif: isi form sesingkat mungkin, auto-fill data tutor/penugasan, validasi dan normalisasi otomatis, filter bulanan yang jelas, review anomali terpusat, dan ekspor bulanan satu tindakan dengan konfirmasi yang mudah dipahami.

**Pengguna:** Admin, Tutor, dan Orang Tua/Wali siswa Bimbel Mumtaz Sampit.

**Masalah:** catatan sesi les sebelumnya dikumpulkan melalui Google Form → Google Sheets, lalu Admin mengelompokkan data, membuat rekap, dan menghitung honor secara manual. Aplikasi memindahkan input dan operasional harian ke dashboard terpusat.

**Hasil MVP:** Tutor mengisi form satu kali; data terstruktur tersimpan di Neon; Admin meninjau/menyetujui sesi, melihat rekap dan estimasi honor per bulan; Tutor melihat riwayat/honor miliknya; Orang Tua melihat riwayat pembelajaran anak; Admin dapat mengekspor laporan absensi bulanan langsung ke Google Sheets.

## 2. Konteks dan keputusan yang disepakati

- Header spreadsheet lama: `no`, `nama tutor`, `nama murid`, `kelas`, `asal sekolah`, `mata pelajaran`, `tanggal les`, `durasi les`.
- Form baru tersedia di Dashboard Tutor; tidak ada submit rutin melalui Google Form.
- Neon PostgreSQL adalah sumber kebenaran operasional. Google Sheets bukan sumber input dan bukan database utama.
- Admin memicu ekspor laporan bulanan langsung ke Google Sheets API. Proses submit tutor tidak menulis ke Sheets.
- Ekspor standar memakai delapan kolom mentah yang sudah dikenal UMKM. Tidak menambah status, materi, anomaly, honor, atau ID teknis pada report ini. Ekspor mencakup semua submission tanpa memfilter status review. Karena report delapan kolom tidak menampilkan status, UI harus menyatakan dengan jelas bahwa hasil ekspor berisi semua submission, termasuk yang belum direview.
- Setiap submit baru berstatus `pending`; Admin perlu review sebelum sesi dihitung ke honor.
- Tarif demo untuk development adalah Rp50.000 per sesi, disimpan sebagai data `tutor_rates` dengan penanda demo. Ini bukan tarif resmi UMKM.
- Form menyertakan `learning_material` untuk pengembangan fitur Progress Anak; working default menjadikannya wajib, tetapi requiredness menunggu konfirmasi owner (O-09). Field ini tidak masuk delapan kolom ekspor standar.
- Anomaly module mengklasifikasikan indikasi anomali termasuk dugaan duplikasi. Temuan ditinjau Admin dan bukan keputusan otomatis.
- Admin dan Tutor login menggunakan username + password. Orang Tua login hanya dengan ID Akses Orang Tua acak/rahasia tanpa password; kode ini bukan ID publik atau berurutan.
- Palet warna, font final, dan referensi visual spesifik akan ditentukan tim di diskusi desain berikutnya. Untuk saat ini agent harus memakai design token netral yang mudah diganti dan membangun dashboard responsive yang nyaman.

## 3. Tujuan

1. Mengganti form input sesi dengan form di Dashboard Tutor.
2. Menyimpan sesi, relasi tutor/siswa/mapel, status review, dan catatan pembelajaran secara terstruktur.
3. Memberi Admin fungsi verifikasi, rekap per bulan, estimasi honor, pengelolaan master data, peninjauan anomaly, dan ekspor ke Sheets.
4. Memberi Tutor riwayat sesi dan estimasi honor yang terbatas pada dirinya.
5. Memberi Orang Tua akses sederhana untuk melihat progres/riwayat anak yang terhubung.
6. Konsisten menggunakan `lesson_date` untuk filter harian/bulanan.
7. Menandai dugaan duplikasi/pola yang perlu diperiksa, tanpa menganggap temuan AI sebagai bukti.
8. Menjaga UX mudah dipahami, accessible, responsif, dan tidak membebani user dengan input berulang.

## 4. Non-goal MVP

- Integrasi bank/payment gateway atau mengklaim transfer honor telah dibayar.
- Menjadikan Google Sheets database utama, impor rutin dari Sheets, atau sinkronisasi dua arah.
- Menambahkan status/material/anomaly/honor ke format ekspor standar delapan kolom.
- LMS lengkap, booking otomatis, ujian, materi digital, penilaian akademik formal, chat, atau prediksi nilai otomatis.
- Membiarkan AI menyetujui/menolak absensi atau memutuskan honor.
- Mengklaim deteksi overlap jam karena field jam mulai/selesai belum tersedia.

## 5. Pengguna dan kebutuhan

### Admin

- Login memakai username + password.
- Mengelola Master Data: tutor, siswa, orang tua, mapel, penugasan, dan tarif.
- Melihat semua sesi dan memfilter berdasarkan bulan, tutor, siswa, mapel, status, serta pencarian.
- Menyetujui sesi, meminta revisi, atau menolak dengan alasan.
- Meninjau anomaly finding, termasuk dugaan duplikasi, dan mencatat hasil review.
- Melihat rekap bulanan serta estimasi honor per tutor yang dapat ditelusuri ke sesi asal.
- Menggunakan tarif demo Rp50.000/sesi dalam development; UI harus menampilkan bahwa nominal belum resmi.
- Memilih bulan dan mengekspor laporan absensi standar secara langsung ke Google Sheets.
- Membuat/merotasi ID Akses Orang Tua dan menyalurkannya secara privat.

### Tutor

- Login memakai username + password.
- Mengirim form sesi les: assignment/siswa, tanggal, durasi, materi, catatan opsional, fokus opsional.
- Nama tutor berasal dari akun login; kelas/sekolah auto-fill dari Master Data.
- Melihat riwayat sesi sendiri berdasarkan bulan dan status.
- Memperbaiki catatan miliknya hanya ketika status `revision_requested`.
- Working default O-15: `approved` dan `rejected` terminal dan tidak dapat diubah/reopen secara bebas pada MVP; konfirmasi kebijakan ini sebelum kebutuhan koreksi pascakeputusan diimplementasikan.
- Melihat estimasi honor sendiri per bulan, hanya dari sesi approved, dengan label tarif demo jika berlaku.

### Orang Tua/Wali

- Login hanya dengan satu ID Akses Orang Tua rahasia yang dibuat Admin; tidak ada password pada MVP.
- Kode akses harus acak dan sulit ditebak; jangan gunakan kode siswa/NPM publik, nomor telepon, tanggal lahir, atau urutan sederhana.
- Melihat hanya anak yang terkait dengan akun parent tersebut.
- Melihat sesi yang approved, materi/catatan/fokus pembelajaran yang tersedia.
- Tidak dapat melihat catatan internal Admin, anomaly finding, honor/tarif tutor, kode akses, atau data siswa lain.

## 6. Navigasi

- **Admin:** Dashboard, Data Absensi, Rekap, Honor Tutor, Master Data.
- **Tutor:** Dashboard, Form Absensi, Riwayat Mengajar, Honor Saya, Profil (data akun read-only + ganti password sendiri).
- **Orang Tua:** Dashboard / Progress Anak, Riwayat Pembelajaran (boleh digabung menjadi satu halaman MVP).

Detail isi per tab ada di `15-DASHBOARD-TABS.md`.

## 7. Kebutuhan fungsional dan prioritas

### P0 — alur operasional utama

- Auth dan role access untuk tiga role sesuai metode login yang ditentukan.
- Master Data inti dan relasi penugasan tutor-siswa-mapel.
- Form Tutor → validasi backend → Neon dengan status awal `pending`.
- Data Absensi Admin, detail, persetujuan/revisi/penolakan, dan timestamp keputusan.
- Riwayat Mengajar Tutor dan Progress Anak berbasis data sesi yang sama, dengan filter akses masing-masing.
- Filter bulan dan rekap memakai `lesson_date`.
- Honor per sesi dengan data tarif dummy Rp50.000/sesi, dari `tutor_rates` dan diberi label simulasi; hanya sesi approved dihitung.
- Anomaly module sebagai sumber temuan yang perlu diperiksa Admin, termasuk kandidat duplikasi; proses AI tidak boleh menggagalkan penyimpanan sesi.
- Ekspor laporan absensi bulanan langsung ke Google Sheets dengan delapan header mentah. Ekspor mencakup semua status review; ekspor ulang memperbarui tab bulan terkait.
- Proteksi akses, error/loading/empty states, dan tests alur inti.

### P1 — penyempurnaan bila waktu memungkinkan

- Riwayat audit lebih detail untuk perubahan master data dan keputusan review.
- Ekspor PDF, pencatatan pembayaran honor, analisis progres yang lebih mendalam, dan ekspor laporan honor ke Sheets hanya jika disetujui sebagai scope tambahan.

## 8. Aturan bisnis MVP

- Bulan laporan berdasarkan `lesson_date`, bukan `submitted_at` atau `reviewed_at`.
- Satu submit menghasilkan satu record UUID internal. `no` hanya urutan tabel/ekspor.
- Status sesi: `pending`, `approved`, `revision_requested`, `rejected`; status awal `pending`.
- Hanya sesi `approved` masuk estimasi honor dan tampilan Progress Anak.
- Tarif development: `rate_type='per_session'`, `rate_amount=50000`, `is_demo_assumption=true`. Jangan menyebutnya tarif asli.
- Laporan standar Sheets berisi delapan kolom mentah tanpa status/material/anomaly/honor/ID internal. Filter ekspor tidak membatasi status: semua submission pada periode terpilih harus diekspor.
- AI menandai/mengklasifikasi indikasi seperti `suspected_duplicate`, `duration_outlier`, dan `unusual_pattern`. Admin yang memutuskan status sesi. Dua sesi mirip tidak otomatis duplikat yang tidak sah.
- Validasi data dasar dilakukan deterministik; kegagalan layanan AI tidak menggagalkan submit, review, rekap atau ekspor.
- Durasi disimpan dalam menit. Batas durasi abnormal harus configurable dan diperlakukan sebagai indikator review, bukan aturan final tanpa konfirmasi.

## 9. Keamanan, privasi, dan UX

- Backend mengotorisasi setiap endpoint berdasarkan role dan relasi data. Jangan mengandalkan proteksi UI.
- Browser auth memakai HttpOnly/Secure/SameSite cookie, origin allowlist, dan proteksi CSRF untuk mutasi; jangan menyimpan token/kode akses di localStorage.
- Orang Tua hanya dapat melihat anak melalui `parent_students`. Kode akses orang tua adalah bearer credential rahasia: digest-only storage, rate limit, respons login generik, rotasi kode, dan tidak boleh masuk log.
- Admin/Tutor menggunakan password hash yang kuat. Jangan mengembalikan atau mencatat password hash/plaintext password.
- Credential Neon, JWT/session secret, Google service account, `PARENT_ACCESS_CODE_PEPPER`, dan Gemini hanya disimpan di backend environment/secret manager.
- Data yang dikirim ke AI harus diminimalkan/pseudonymized. Jangan mengirim nama lengkap, email, telepon, atau kode akses.
- Form meminimalkan input manual dan memberi auto-fill dari Master Data; sediakan pesan validasi di dekat field, anti-double-submit, dan konfirmasi aksi berdampak.
- UI harus responsive, accessible keyboard, memiliki kontras yang cukup, serta loading/empty/error/success state.
- Palet warna/font/logo final sengaja belum ditetapkan sampai tim menyepakati referensi visual. Agent harus menggunakan semantic design tokens yang mudah diganti, bukan mengunci brand styling.

## 10. Kriteria penerimaan

- [ ] Admin/Tutor dapat login dengan username + password; Parent dengan ID akses acak saja.
- [ ] ID akses parent disimpan sebagai digest, tidak memakai ID publik/berurutan, dibatasi rate limit dan hanya membuka relasi anak yang tepat.
- [ ] Tutor submit satu sesi; tersimpan satu kali di Neon dengan status pending.
- [ ] Tutor tidak bisa memalsukan identitas atau mengirim assignment milik tutor lain.
- [ ] Admin dapat melihat semua sesi, meninjau anomaly, dan memutuskan status.
- [ ] Anomaly/AI finding tidak mengubah status sesi/honor secara otomatis.
- [ ] Honor demo Rp50.000 per sesi hanya untuk sesi approved dan selalu diberi label simulasi.
- [ ] Orang Tua hanya melihat sesi approved dan anak yang terhubung.
- [ ] Rekap bulanan memakai `lesson_date`.
- [ ] Ekspor Google Sheets berisi tepat delapan kolom mentah dengan urutan benar, menggunakan row filter yang telah dikonfirmasi (semua status review), dan re-export tidak menambah duplikasi.
- [ ] Gagal export tidak mengubah data Neon dan tidak menampilkan sukses palsu.
- [ ] Color/font identity tidak hard-coded sebelum tim memilih referensi visual; semantic tokens tersedia untuk perubahan.
- [ ] Tests/typecheck/build yang relevan dijalankan dan hasil aktual dicatat.
