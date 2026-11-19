# Riwayat kelas dan tarif berdasarkan tanggal les

## Tujuan dan batas fitur

Siswa dapat naik kelas tanpa mengganti identitas/akun dan tanpa membuat sesi lama mengikuti kelas terbaru. Sumber penentuan kelas adalah **tanggal les dalam WIB**, bukan tanggal input, approval, atau tanggal membuka laporan.

Versi ini menyediakan perubahan kelas per siswa, riwayat bertanggal, koreksi dengan preview dampak, audit, serta dasar tarif per sesi. Kenaikan kelas massal dan penguncian periode pembayaran adalah pengembangan berikutnya. Aplikasi saat ini menampilkan estimasi honor dan tagihan; belum memiliki buku pembayaran final.

## Aturan utama

- Master siswa menampilkan kelas yang efektif hari ini. Perubahan mendatang ditampilkan sebagai jadwal, dan otomatis efektif berdasarkan tanggal WIB tanpa cron.
- Riwayat menyimpan kelas dan tanggal mulai. Suatu entri berlaku sampai sebelum tanggal mulai entri berikutnya. Dua entri siswa tidak boleh memiliki tanggal mulai yang sama.
- Sesi baru menyimpan kelas dan tarif per jam sesuai tanggal les, termasuk sesi yang masih menunggu validasi. Saat disetujui, tarif kotor dan potongan admin disimpan.
- Approval ulang menggunakan dasar tarif sesi. Mengubah catatan/materi saja mempertahankan nominal; mengubah durasi menghitung ulang dengan tarif per jam sesi. Mengubah siswa atau tanggal memilih kembali dasar tarif sesuai siswa/tanggal yang baru.
- Potongan admin tetap Rp10.000 minimal satu potongan, bertambah pada sisa >=30 menit. Kenaikan kelas mengubah tarif kotor, bukan rumus potongan admin.
- Perubahan kelas bertanggal mundur atau koreksi riwayat dapat memengaruhi sesi yang sudah ada. Seluruh dampak ditampilkan sebelum disimpan dan dicatat dalam audit. Tidak ada penghitungan ulang tersembunyi setiap kali laporan dibuka.
- Endpoint edit profil siswa menolak pengiriman `grade`; perubahan kelas harus melewati alur riwayat.

## Alur admin

### Mendaftarkan siswa

1. Master Data → Siswa → Tambah siswa.
2. Isi nama, kelas awal, dan asal sekolah.
3. Sistem mencatat kelas awal. Kelas awal menjadi acuan sebelum perubahan bertanggal pertama.

### Mencatat kenaikan kelas

1. Pada baris siswa, klik **Kelas**.
2. Pilih kelas baru, tanggal **Berlaku mulai**, dan catatan singkat.
3. Klik **Tinjau perubahan**. Dialog menampilkan kelas/tarif per jam sebelum dan sesudah.
4. Jika ada sesi terdampak, tampilkan jumlah sesi dan perubahan total tagihan/honor. Buka **Rincian sesi** untuk melihat tanggal, kelas, dan nominal sebelum/sesudah.
5. Klik **Simpan perubahan**. Riwayat, dasar tarif sesi terdampak, nominal approved, dan audit disimpan dalam satu transaksi.
6. Jika data berubah sejak preview, penyimpanan ditolak dengan pesan untuk meninjau ulang. Tidak ada perubahan parsial.

Contoh: Aisyah naik dari 3 SD menjadi 4 SD mulai 1 Juli 2027.

| Tanggal les | Kelas | Durasi | Tagihan | Admin | Honor |
|---|---|---:|---:|---:|---:|
| 30 Juni | 3 SD | 60 menit | Rp60.000 | Rp10.000 | Rp50.000 |
| 1 Juli | 4 SD | 60 menit | Rp80.000 | Rp10.000 | Rp70.000 |

Jika disimpan sebelum Juli, daftar siswa tetap menampilkan 3 SD dengan keterangan kecil jadwal 4 SD. Mulai 1 Juli, kelas aktif menjadi 4 SD.

### Melihat dan mengoreksi riwayat

- Dialog yang sama menyediakan disclosure **Riwayat kelas**. Entri menampilkan tanggal, kelas, catatan, dan admin pengubah.
- Tidak ada tombol Koreksi terpisah. Gunakan form utama: kelas baru + tanggal berlaku + catatan. Tanggal yang sama memperbarui entri tersebut; tanggal berbeda menambahkan perubahan baru. Preview dampak dan audit tetap wajib.
- Mengisi tanggal berbeda tidak memindahkan atau menghapus entri lama. Jika tanggal awal salah, perbarui entri pada tanggal lama ke kelas yang semestinya, lalu tambahkan perubahan pada tanggal yang benar.
- Entri kelas awal dipertahankan sebagai data asal. Untuk koreksi periode sebelumnya, tambahkan perubahan baru pada tanggal awal yang benar; perubahan bertanggal berikutnya tetap menjadi batas akhir.
- Disclosure **Aktivitas perubahan** menampilkan siapa, kapan, dan alasan. Audit database juga menyimpan keadaan sebelumnya serta daftar nominal sebelum/sesudah per sesi.
- Untuk membatalkan jadwal yang salah, isi form dengan tanggal jadwal yang sama dan ubah kelasnya ke kelas yang memang harus berlaku, dengan alasan pembatalan. Riwayat tidak dihapus diam-diam.

### Memeriksa honor dan penagihan

- Data Absensi → Detail menampilkan informasi sesi, pembelajaran, dan waktu pencatatan. Rincian tarif tersedia pada Honor Tutor dan Penagihan; panel Dasar tarif sesi di modal detail telah dihapus.
- Honor Tutor: rincian siswa menampilkan kelas saat les; rincian admin juga menampilkan tarif per jam bila tersedia. Tampilan tutor tetap nominal honor bersih.
- Penagihan dan PDF: setiap baris menyertakan kelas saat les, tarif per jam, dan tarif sesi. Periode yang melintasi perubahan kelas dapat berisi beberapa tarif; total adalah penjumlahan nominal baris, bukan perkalian dengan tarif kelas terbaru.

## Alur tutor

1. Buka Form Absensi dan pilih siswa serta tanggal les.
2. Kelas terisi otomatis berdasarkan tanggal les. Tutor tidak memilih tarif.
3. Input terlambat tetap memakai kelas pada tanggal les. Contoh: sesi 30 Juni diinput 3 Juli tetap kelas 3 SD.
4. Validasi/approval setelah kenaikan kelas tetap menggunakan dasar tarif sesi.
5. Riwayat Mengajar dan Honor Saya memakai kelas saat les. Tutor tidak memiliki akses untuk mengubah riwayat kelas, audit, atau nominal tagihan orang tua.
6. Jika kelas tampak salah, tutor menghubungi admin. Admin menggunakan koreksi riwayat dengan preview.

## Alur orang tua/wali

- Profil anak menampilkan kelas aktif saat ini.
- Riwayat pembelajaran menampilkan kelas saat masing-masing sesi berlangsung. Karena itu kelas pada sesi Juni dapat berbeda dari profil anak pada Juli.
- Orang tua tidak mengubah kelas dan tidak melihat audit admin, potongan admin, atau honor tutor.
- Invoice yang dibuat admin memakai nominal per sesi sesuai kelas pada tanggal les. Fitur ini tidak menambah halaman pembayaran/tagihan baru untuk akun orang tua.

## UX ringkas

- Tidak menambah kartu penjelasan panjang atau menu sidebar baru.
- Daftar siswa memiliki satu tombol **Kelas** di samping **Ubah** (profil).
- Form utama hanya kelas baru, tanggal mulai, dan catatan. Riwayat, audit, serta rincian dampak memakai panel lipat berikon dengan animasi singkat, mendukung reduced motion. Riwayat berupa linimasa ringkas, tanpa kartu besar dan tombol Koreksi.
- Informasi terjadwal berupa satu baris kecil di kolom kelas.
- Dialog memakai komponen modal yang sudah ada: footer tetap terlihat, isi dapat digulir, fokus terkurung dan kembali ke tombol pemicu.
- Dokumentasi ini menjadi sumber penjelasan lengkap; UI cukup memberi konteks singkat untuk mengambil keputusan.

## Model data dan API

- `student_grade_history`: siswa, kelas, tanggal mulai, alasan, admin pengubah, timestamp. Kelas awal memakai tanggal internal `0001-01-01`, ditampilkan sebagai “Kelas awal”.
- `student_grade_audit`: catatan perubahan append-only, actor, alasan, serta detail sebelum/sesudah dan dampak sesi.
- `lesson_sessions.grade_snapshot`, `grade_source`, `hourly_rate_snapshot`: dasar perhitungan sesi; terpisah dari `rate_amount_snapshot` dan `admin_fee_snapshot` yang hanya dihitung untuk approved.
- `students.grade` mempertahankan nilai kelas awal sebagai fallback kompatibilitas. Semua pembacaan kelas aktif memakai resolver riwayat, bukan menganggap kolom ini selalu kelas terkini.
- `GET /admin/students/:id/grade-history`: entri dan ringkasan aktivitas.
- `POST /admin/students/:id/grade-history/preview`: `{grade, effective_from, reason, history_id?}`. `history_id` digunakan untuk koreksi entri. Respons memuat token, dampak per sesi, serta selisih total.
- `POST /admin/students/:id/grade-history`: payload yang sama ditambah `preview_token`. Hanya admin, dilindungi auth dan CSRF yang sudah ada.
- `GET /admin/attendance-options` dan `/tutor/attendance-options` menerima `lesson_date` opsional agar kelas di form sesuai tanggal pilihan. Tanpa tanggal, gunakan kelas aktif hari ini.
- Respons siswa menambah `scheduled_grade`. Detail sesi, honor admin, dan billing menambah dasar tarif. Respons orang tua hanya menambah kelas/sumber kelas per sesi.

Preview diberi hash dari input, riwayat, dan keadaan sesi. Penyimpanan memeriksa ulang hash di dalam transaksi. Penulisan sesi dan koreksi riwayat mengunci siswa sebelum sesi agar tidak ada sesi baru yang lolos dari penghitungan dampak. Worker AI menggunakan basis terbaru dari row yang dikunci saat menyelesaikan validasi.

## Migrasi dan batas data lama

Migrasi `0009_complete_wasp.sql` menambah tabel/kolom dan membentuk kelas awal dari data master saat migrasi. **Kelas historis sebelum fitur ini tidak dapat direkonstruksi dengan pasti dari data master terkini.**

- Nominal kotor dan potongan lama tidak diubah oleh migrasi.
- Kelas sesi lama diberi `grade_source='legacy'`, tetap ditandai di database. UI dan PDF cukup menampilkan kelas tanpa tambahan “saat les” atau “data awal”; penjelasan asal kelas tersedia di detail tarif admin.
- Bila nominal kotor lama tersedia, tarif per jam diturunkan dari nominal dan aturan durasi yang sudah berlaku agar koreksi durasi tetap mempertahankan dasar tarif lama.
- Sesi tanpa nominal memakai tarif kelas awal yang diketahui; kelas tidak didukung tetap tanpa tarif dan mengikuti peringatan laporan yang sudah ada.
- Jika owner/admin mengetahui riwayat yang sebenarnya, masukkan koreksi bertanggal dan tinjau dampaknya. Jangan menebak kelas tepat hanya dari nominal, karena beberapa kelas berbagi tarif.
- Cadangkan database sebelum penerapan. Jalankan migrasi melalui mekanisme proyek, lalu jalankan backend/frontend versi yang sama. Migrasi ini belum berarti database live sudah diperbarui.
- Saat pengembangan berikutnya mengubah tarif global/aturan potongan, tambahkan versi kebijakan bertanggal; jangan mengubah angka historis melalui pergantian konstanta tanpa migrasi yang disengaja.

## Skenario penerimaan

1. Kenaikan 3→4 SD: sesi sebelum tanggal berlaku mempertahankan kelas dan nominal; sesi setelahnya memakai tarif baru.
2. Kenaikan dalam kelompok tarif sama (4→5 SD): kelas berubah, nominal tetap.
3. Absensi terlambat dan approval tertunda memakai tanggal les.
4. Jadwal mendatang aktif tepat pergantian tanggal WIB tanpa pekerjaan terjadwal.
5. Edit materi tidak mengubah nominal; koreksi durasi memakai dasar historis; pindah tanggal/siswa menggunakan basis yang sesuai.
6. Koreksi tanggal berlaku meninjau sesi pada rentang lama maupun baru, termasuk sesi pending.
7. Preview usang ditolak; tanggal yang sama memperbarui entri setelah preview; audit dan penulisan sesi atomik.
8. Invoice dengan beberapa kelas menjumlahkan nominal per baris; PDF konsisten dengan API.
9. Tutor/orang tua tidak bisa memanggil endpoint perubahan kelas.
10. Migrasi database berisi mempertahankan tarif kotor dan potongan; data legacy diberi penanda internal.
