# Breakdown Dashboard dan Navigasi per Role

Dokumen ini menjelaskan isi setiap tab, tindakan yang tersedia, sumber data, serta batas akses. Dashboard adalah tampilan/query, bukan tabel database tersendiri.


## Tiga route utama dashboard (frontend)

Aplikasi hanya memiliki tiga entry route utama berbasis role:

- `/admin` — dashboard Admin dan navigasi internal Admin (Dashboard, Data Absensi, Rekap, Honor Tutor, Master Data).
- `/tutor` — dashboard Tutor dan navigasi internal Tutor (Dashboard, Form Absensi, Riwayat Mengajar, Honor Saya, Profil).
- `/orang-tua-murid` — dashboard Orang Tua/Wali untuk memilih anak yang terhubung dan melihat progres/riwayat pembelajaran.

Login dapat ditampilkan sebagai state/halaman autentikasi sebelum role route dibuka; setelah login sukses, arahkan user ke route role yang sesuai. Gunakan nested routes atau state navigasi internal di bawah tiga entry route tersebut bila diperlukan. Jangan membuat aplikasi/dashboard terpisah untuk setiap tab.

**Penting:** tiga route di atas adalah route halaman frontend, bukan berarti REST API hanya memiliki tiga endpoint. Backend tetap membutuhkan banyak endpoint internal `/api/v1/...` untuk autentikasi, membaca/menulis data, review, rekap, anomaly, dan ekspor. API dikelompokkan per domain dan semuanya memakai satu backend serta satu database.

## 1. Login dan role

- **Admin:** login memakai `username` + password.
- **Tutor:** login memakai `username` + password.
- **Orang Tua/Wali:** login hanya memakai satu **ID Akses Orang Tua** yang dibuat acak dan dibagikan secara privat oleh Admin; tidak memakai username/password. ID ini adalah credential rahasia, bukan nomor siswa/NPM publik atau ID berurutan. Kode tidak boleh mudah ditebak dan harus memiliki rate limit di backend.
- Kode akses orang tua ditampilkan hanya saat dibuat/dirotasi; simpan digest di database, jangan log kode mentah. Admin dapat menerbitkan ulang kode jika diperlukan.
- Setelah login, server menetapkan role dan identitas. Menyembunyikan menu pada frontend tidak menggantikan otorisasi backend.

## 2. Dashboard Admin

Navigasi utama: **Dashboard**, **Data Absensi**, **Rekap**, **Honor Tutor**, **Master Data**, Logout.

### 2.1 Dashboard

Tujuan: ringkasan operasional untuk bulan yang dipilih.

Konten:
- tutor aktif dan siswa aktif;
- jumlah sesi bulan ini;
- sesi `pending`, `approved`, `revision_requested`, dan `rejected`;
- working default O-15: `approved` dan `rejected` terminal tanpa reopen/edit bebas pada MVP, tetapi kebijakan ini belum dikonfirmasi owner.
- jumlah temuan anomali yang belum direview;
- estimasi honor dari sesi approved (tarif tunggal per sesi, D-24);
- daftar sesi terbaru dan tindakan admin yang perlu dilakukan.

Jangan menampilkan angka pendapatan/laba bimbel karena sumber data pemasukan tidak termasuk scope.

### 2.2 Data Absensi

Tujuan: daftar seluruh sesi yang disubmit Tutor, tempat Admin memeriksa data, status review, dan finding anomali.

Delapan kolom inti di tabel mengikuti format UMKM:

`no | nama tutor | nama murid | kelas | asal sekolah | mata pelajaran | tanggal les | durasi les`

Kolom aplikasi tambahan: status review, indikator temuan anomali, dan menu aksi. `no` adalah nomor urut di halaman/hasil ekspor, bukan ID sesi.

Filter: bulan `YYYY-MM`, tutor, siswa, mata pelajaran, status, pencarian. Bulan memakai `lesson_date`.

Aksi Admin:
- Lihat Detail;
- Setujui;
- Minta Revisi (alasan wajib);
- Tolak (alasan wajib);
- Tinjau temuan anomali dan catat hasil review.

Detail sesi menampilkan delapan atribut absensi, materi pembelajaran, catatan/fokus, `submitted_at`, `reviewed_at`, catatan internal Admin, serta anomaly finding yang relevan.

Data source: `lesson_sessions` + `tutors`, `users`, `students`, `subjects`, `anomaly_flags`.

### 2.3 Rekap

Tujuan: merangkum catatan per bulan, bukan menggantikan Data Absensi.

Konten:
- pemilih bulan;
- group by tutor, siswa, atau mata pelajaran;
- jumlah sesi dan jumlah per status;
- total durasi sesi approved;
- tautan drill-down ke daftar sesi pembentuk rekap;
- histori hasil ekspor Google Sheets melalui `GET /admin/reports/google-sheets/attendance/history` (status, waktu, periode, jumlah data row, dan pesan error aman).

Tombol: **Ekspor Absensi Bulanan ke Google Sheets**. Admin memilih periode, mengonfirmasi aksi, lalu melihat status `running`, `succeeded`, atau `failed`, jumlah baris, nama tab, waktu ekspor, serta tautan spreadsheet jika tersedia.

Format ekspor standar berisi delapan kolom mentah UMKM saja; tidak menambahkan status, anomaly, materi atau honor. Ekspor mencakup semua sesi pada periode terpilih, termasuk pending/revisi/ditolak; status review tidak ditambahkan ke delapan kolom mentah karena owner meminta format mentah tetap. Re-export mengganti isi tab bulan terkait, bukan append.

### 2.4 Honor Tutor

Tujuan: estimasi honor berdasarkan sesi approved untuk periode yang dipilih.

Konten:
- filter periode;
- total estimasi honor;
- tabel per tutor: jumlah sesi approved, dasar tarif, subtotal;
- daftar sesi pending/revisi/ditolak yang belum masuk nominal;
- detail sesi sumber kalkulasi;

**Aturan honor (D-24):** satu tarif tunggal per sesi dari konfigurasi `HONOR_RATE_PER_SESSION` (default Rp50.000), dikunci ke sesi saat disetujui — bukan angka yang tersebar atau hard-coded di kalkulator. Hanya sesi `approved` yang masuk estimasi. Jangan tampilkan status sudah dibayar karena payment tracking tidak termasuk MVP.

### 2.5 Master Data

Master Data adalah data referensi, bukan daftar transaksi absensi. Submenu:

| Submenu | Isi | Data source / tindakan |
|---|---|---|
| Tutor | Profil, username, kontak opsional, status operasional, akses login | `users`, `tutors`; buat/edit/nonaktifkan profil atau akses login secara terpisah. Password acak dibuat sistem dan ditampilkan sekali saat dibuat; tombol **Reset password** untuk tutor yang lupa |
| Siswa | Nama, kelas, asal sekolah, status aktif | `students`; buat/edit/nonaktifkan |
| Orang Tua/Wali | Profil wali, relasi anak, dan aksi generate/rotasi ID Akses Orang Tua | `users`, `parent_students`; hubungkan orang tua dengan siswa. Kode akses acak ditampilkan sekali saat dibuat/dirotasi, disimpan sebagai digest; jangan tampilkan ulang digest/kode lama |
| Mata Pelajaran | Daftar mata pelajaran | `subjects`; tambah/edit/nonaktifkan |

Gunakan soft deactivation untuk record yang sudah direferensikan sesi. Jangan hard-delete tutor/siswa atau menulis ulang histori. Untuk Tutor, bedakan status operasional (`tutors.is_active`, menentukan kelayakan submit sesi baru) dengan akses login (`users.is_active`, menentukan apakah akun boleh login). Perubahan status pada UI harus menyatakan efeknya dengan jelas. Jika `student_links` parent diubah, tampilkan konfirmasi bahwa akses progres anak yang dilepas akan langsung dicabut.

## 3. Dashboard Tutor

Navigasi: **Dashboard**, **Form Absensi**, **Riwayat Mengajar**, **Honor Saya**, Profil/Logout.

### 3.1 Dashboard

Ringkasan bulan terpilih: jumlah sesi, pending, approved, revisi yang perlu diperbaiki, serta estimasi honor dari sesi approved. Temuan anomali **tidak** ditampilkan kepada Tutor pada baseline (finding adalah data internal Admin). Jangan tampilkan anotasi internal Admin selain alasan revisi yang diperlukan Tutor untuk memperbaiki sesi.

### 3.5 Profil

Menampilkan nama lengkap, username, dan kontak dari akun login secara read-only, serta form **Ganti Password** (password lama, password baru, konfirmasi) melalui `PATCH /tutor/me/password`. Perubahan nama/username/kontak tetap dilakukan Admin lewat Master Data.

### 3.2 Form Absensi

Field:
- Nama tutor: otomatis dari akun login, tidak bisa diubah.
- Nama murid: dipilih Tutor sendiri dari murid aktif (kotak pencarian).
- Kelas dan asal sekolah: auto-fill dari Master Data siswa.
- Mata pelajaran: dipilih Tutor sendiri dari mata pelajaran aktif.
- Tanggal les: tanggal sesi berlangsung.
- Durasi les: integer menit dengan label unit jelas.
- Materi pembelajaran: working default wajib untuk data awal Progress Anak; requiredness belum dikonfirmasi owner (O-09).
- Catatan pembelajaran: opsional pada baseline kecuali validasi UX menetapkan kebutuhan lain.
- Fokus berikutnya: opsional.

`no`, status, timestamp, honor, temuan anomali, dan field ekspor bukan input tutor. Setelah submit, backend menyimpan sesi berstatus `pending`. Tidak ada write ke Google Sheets dari proses submit.

UX: field berlabel jelas, nilai master auto-fill, error tampil dekat field, tombol disabled saat submit, pencegahan double submit, dan pesan sukses hanya setelah API database benar-benar berhasil.

### 3.3 Riwayat Mengajar

Hanya menampilkan sesi milik tutor yang login. Kolom ringkas: tanggal les, siswa, kelas, mapel, durasi, status, ringkasan materi. Filter bulan/status/siswa. Detail dapat menunjukkan waktu submit/verifikasi dan catatan Admin yang diperlukan untuk melakukan revisi. Tutor tidak boleh melihat sesi tutor lain.

### 3.4 Honor Saya

Tampilkan estimasi honor per bulan dan rincian per tanggal/sesi: tanggal les, siswa/mapel, durasi, tarif per sesi, nilai sesi, dan status review. Hanya sesi approved dihitung. Jangan menampilkan “sudah dibayar” tanpa fitur pembayaran aktual.

## 4. Dashboard Orang Tua/Wali

Navigasi: **Dashboard / Progress Anak**, **Riwayat Pembelajaran** (boleh digabung pada MVP), Profil/Logout.

Login hanya memakai ID Akses Orang Tua. Kode tersebut diperlakukan sebagai credential rahasia. Setelah login, akun hanya dapat melihat siswa yang terhubung dalam `parent_students`. Jika ada beberapa anak, sediakan pemilih anak.

Konten progress:
- nama anak dan kelas;
- pilihan bulan;
- jumlah sesi approved dan total durasi;
- timeline tanggal, tutor, mata pelajaran, materi;
- catatan pembelajaran dan fokus berikutnya jika tersedia.

Hanya sesi `approved` dan field yang layak dipublikasikan yang ditampilkan. Jangan tampilkan `admin_note`, anomaly flag, tarif/honor tutor, kode akses, atau data siswa lain. Jangan mengubah catatan tutor menjadi klaim kenaikan nilai/kemampuan tanpa data penilaian formal.

## 5. Pemetaan layar ke data inti

| Layar | Tabel utama | Filter keamanan/periode |
|---|---|---|
| Admin → Data Absensi | `lesson_sessions` + tabel master + `anomaly_flags` | Admin; `lesson_date`, status, pencarian |
| Tutor → Riwayat | `lesson_sessions` + relasi master | Tutor dari sesi server; hanya sesi milik tutor |
| Tutor → Honor Saya | `lesson_sessions` (snapshot tarif) | Tutor login; sesi approved saja untuk nominal |
| Orang Tua → Progress Anak | `lesson_sessions` + `parent_students` + relasi master | Parent-child link; sesi approved |
| Admin → Rekap | `lesson_sessions` + relasi master | Admin; periode `YYYY-MM` |
| Admin → Honor Tutor | `lesson_sessions` (snapshot tarif) | Admin; periode `YYYY-MM`, status approved |
| Admin → Master Data | tabel master dan akun | Admin only |
| Admin → Ekspor Sheets | sesi terpilih oleh kebijakan ekspor (semua status review) + `sheet_export_runs` | Admin; periode `YYYY-MM` |

## 6. State UX wajib

Semua layar data harus punya loading, empty, error, success, disabled/loading action states. Pesan kesalahan harus spesifik dan dapat ditindaklanjuti tanpa menampilkan detail teknis sensitif. Aksi menolak, meminta revisi, menonaktifkan data, merotasi ID akses, dan menimpa laporan bulanan harus memiliki konfirmasi yang sesuai.
