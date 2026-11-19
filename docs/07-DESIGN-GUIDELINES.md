# Design Guidelines — Dashboard Bimbel Mumtaz

## 1. Status referensi visual

> **Update:** referensi visual tim sudah diterima. Spesifikasi visual (palet, tipografi, layout, komponen, animasi) ada di [`docs/design/`](design/README.md) dan menggantikan bagian §1, §3, dan §13 dokumen ini. Disetujui owner pada 2026-11-01 dengan arah modern dan compact.

**Keputusan final untuk palet warna, tipografi, logo, style, dan referensi gambar belum ditentukan oleh tim.** Agent jangan mengunci brand identity, memilih palette final, memasang font brand tertentu, atau menyatakan desain sudah sesuai referensi final sebelum owner memberikan hasil diskusi berikutnya.

Untuk development sekarang, gunakan visual baseline yang netral dan mudah diganti: dashboard modern/minimal, terinspirasi pola dashboard SaaS yang umum dan referensi Dribbble yang akan dipilih tim. Jangan menyalin karya desainer tertentu secara pixel-perfect. Simpan warna, radius, spacing, shadow, dan typography sebagai semantic design tokens/CSS variables sehingga pilihan final nanti bisa diterapkan tanpa mengubah logika UI.

## 2. Prinsip UI/UX

- Utamakan alur yang mudah dipahami, label berbahasa Indonesia, input minimum, auto-fill dari Master Data, dan feedback yang jelas.
- Halaman admin berfokus pada pengelolaan/review; Tutor pada submit sesi, riwayat, dan honor sendiri; Orang Tua pada progres anak.
- Jangan meminta Tutor mengetik ulang nama dirinya, kelas, atau asal sekolah yang sudah ada di Master Data.
- Form menggunakan label persisten, tanda wajib/opsional, validasi di dekat field, pesan sukses hanya setelah server memastikan penyimpanan, dan pencegahan double submit.
- Aksi yang berdampak (approve/reject, minta revisi, nonaktifkan data, rotasi ID akses, ekspor yang mengganti isi tab bulan) perlu konfirmasi yang sepadan.
- Hindari dashboard penuh kartu/warna; gunakan hierarki tipografi, spacing konsisten dan tabel yang dapat dipindai.
- Nominal dari tarif demo ditandai badge kecil "Tarif demo" di halaman Honor (D-20).

## 3. Sistem visual yang menunggu keputusan tim

Buat `tokens.css` atau setara dengan token semantik seperti:

- `--color-background`, `--color-surface`, `--color-text`, `--color-muted`, `--color-border`;
- `--color-primary`, `--color-success`, `--color-warning`, `--color-danger`;
- `--font-sans`, skala ukuran font, `--radius-*`, `--shadow-*`, spacing scale.

Gunakan nilai netral sementara dan satu tempat konfigurasi. Jangan menyebar hex color/font langsung ke banyak komponen. Saat tim sudah menentukan referensi, update tokens dan style components di satu jalur.

Stack visual: Tailwind CSS v4 + Headless UI + komponen internal kecil + Lucide React. Jangan gunakan shadcn/ui atau UI kit besar tanpa persetujuan owner.

## 4. Login dan navigasi

### Admin dan Tutor

Login menggunakan username + password. Tampilkan error generik untuk kredensial salah, tombol tampil/sembunyikan password, indikator submit/loading, serta link bantuan hanya bila proses bantuan akun benar-benar dibuat.

### Orang Tua/Wali

Login memiliki satu field `ID Akses Orang Tua`, tanpa password sesuai keputusan produk. Kode ini adalah secret akses privat, bukan ID publik/berurutan. Sediakan helper text untuk menjaga kode tetap privat; jangan menampilkan kode setelah login atau menyimpannya di UI/log. Backend membatasi percobaan login.

Navigasi sidebar harus berbeda sesuai role:

- Admin: Dashboard, Data Absensi, Rekap, Honor Tutor, Master Data.
- Tutor: Dashboard, Form Absensi, Riwayat Mengajar, Honor Saya, Profil (read-only + ganti password).
- Orang Tua: Dashboard/Progress Anak dan Riwayat Pembelajaran (boleh digabung pada MVP).

UI navigation bukan pengganti otorisasi server.

## 5. Dashboard Admin

KPI relevan: tutor aktif, siswa aktif, sesi periode, pending verification, sesi approved, anomaly findings yang perlu review, estimasi honor bila tarif tersedia. Tambahkan daftar sesi terbaru dan tindakan yang perlu dilakukan. Jangan tampilkan pendapatan bisnis tanpa data pemasukan.

## 6. Data Absensi Admin

- Default periode bulan berjalan menggunakan `lesson_date`.
- Kolom inti sesuai format UMKM: no, nama tutor, nama murid, kelas, asal sekolah, mata pelajaran, tanggal les, durasi les.
- Kolom aplikasi tambahan: status review, indikator anomaly, dan menu tindakan.
- Aksi ditempatkan di menu baris/detail agar tabel tidak terlalu padat.
- Detail dapat menampilkan materi, catatan, waktu submit/verifikasi, catatan admin, dan anomaly finding.
- Status selalu ditampilkan dengan teks; jangan mengandalkan warna saja.

## 7. Rekap dan Google Sheets export

- Tampilkan filter bulan dengan jelas.
- Rekap menampilkan agregat per tutor/siswa/mapel dan drill-down ke sesi sumber.
- CTA: **Ekspor Absensi Bulanan ke Google Sheets**.
- Sebelum menulis, ringkas periode, jumlah **semua submission** yang akan ditulis, dan nama tab target, beserta peringatan bahwa data yang belum disetujui (pending/revisi/ditolak) ikut diekspor (O-08 final).
- Tampilkan status `running/succeeded/failed`, jumlah record, waktu, dan link spreadsheet jika tersedia.
- Jangan tampilkan sukses sebelum API mengonfirmasi write. Export adalah snapshot, bukan live sync.
- Format standar tepat delapan kolom mentah; no, status, materi, anomaly, honor, dan ID internal tidak ditambahkan.

## 8. Honor Tutor dan Honor Saya

- Bedakan total estimasi, jumlah sesi approved, sesi yang belum disetujui, dan rincian nilai per sesi.
- Nominal dari tarif demo ditandai badge kecil **"Tarif demo"** di samping nominal (D-20); tanpa alert/label panjang di dashboard.
- Nominal selalu dari backend; frontend tidak menghitung ulang.
- Jangan tampilkan status pembayaran aktual pada MVP.

## 9. Tutor Dashboard

### Form Absensi

Nama tutor auto dari login; murid (kotak pencarian) dan mapel dipilih Tutor sendiri; kelas dan sekolah auto-fill; tanggal; durasi menit; materi wajib; catatan dan fokus opsional. Setelah submit sukses, status `Menunggu Verifikasi`. AI analysis status ditampilkan terpisah bila perlu.

### Riwayat Mengajar

Tampilkan tanggal, siswa, kelas, mapel, durasi, status, materi ringkas. Filter bulan/status/siswa. Timestamp detail, tidak wajib di tabel ringkas.

### Honor Saya

Rincian per sesi approved, tanggal, durasi, tarif dan nilai per sesi; label tarif demo bila digunakan. Sesi pending/revisi ditampilkan terpisah dari nominal yang dihitung.

## 10. Dashboard Orang Tua

- Pilih anak jika akun parent terhubung ke beberapa anak.
- Tampilkan periode, jumlah sesi approved, durasi, timeline tanggal/tutor/mapel/materi/catatan/fokus.
- Gunakan bahasa suportif dan faktual. Jangan menyimpulkan kemajuan nilai tanpa penilaian yang mendukung.
- Jangan tampilkan admin notes, anomaly findings internal, tarif/honor, kode akses atau siswa lain.

## 11. Tabel, form, dan responsive states

- Tabel memiliki header jelas, alignment konsisten, pagination jika perlu dan overflow yang terkontrol. Mobile dapat memakai horizontal scroll atau card list tanpa menyembunyikan informasi penting.
- Filter periode/tutor/siswa/mapel/status mudah dipahami dan punya reset filter.
- Setiap halaman data wajib punya loading, empty, error, success state.
- Error API disampaikan secara manusiawi tanpa SQL, stack trace, credential atau informasi internal.
- Tombol submit/aksi dinonaktifkan saat request berjalan.
- Status menggunakan label teks dan icon yang konsisten; status tidak dibedakan hanya dengan warna.

## 12. Aksesibilitas

- Semua kontrol interaktif bisa dipakai dengan keyboard dan punya focus-visible.
- Gunakan label terhubung ke field, error yang terasosiasi, heading berurutan, dan ARIA hanya saat dibutuhkan.
- Jaga kontras teks dan indikator. Pilihan palet final nanti harus tetap memenuhi WCAG AA sebisa mungkin.
- Dialog dapat ditutup sesuai pola aksesibel, mengembalikan focus ke trigger, dan mencegah aksi tak sengaja.

## 13. Komponen internal yang disarankan

`AppShell`, `Sidebar`, `Topbar`, `PageHeader`, `PeriodSelector`, `StatusBadge`, `DataTable`, `FilterBar`, `FormField`, `ConfirmDialog`, `EmptyState`, `LoadingState`, `ErrorState`, `InlineAlert`, `ExportStatusPanel`, `DemoRateNotice`.

Buat komponen hanya jika pola benar-benar berulang. Jangan membangun design system besar sebelum kebutuhan terbukti.

## 14. Data demo

Semua nama, akun, sekolah, sesi, kode akses, dan nominal di screenshot/mock harus jelas sebagai data sintetis. Jangan memakai data pribadi siswa/tutor asli untuk fixture atau prompt AI.
