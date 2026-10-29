# Owner Clarifications — v5

Dokumen ini mencatat keputusan terbaru yang mengubah paket v4. Keputusan ini mengungguli kalimat lama di laporan audit v4 apabila berbeda.

## 1. Tiga route utama frontend

Hanya ada tiga entry route dashboard: `/admin`, `/tutor`, dan `/orang-tua-murid`. Menu/tab adalah bagian dari dashboard role tersebut dan boleh memakai nested routes atau state navigasi internal. Ini bukan batas jumlah REST API endpoint: backend tetap menyediakan endpoint internal terpisah untuk auth, CRUD, review, recap, honor, anomaly, dan ekspor.

## 2. Ekspor Google Sheets mencakup semua status

Admin dapat mengekspor semua submission pada bulan yang dipilih tanpa filter status review: `pending`, `approved`, `revision_requested`, dan `rejected`. Format output tetap tepat delapan kolom mentah: `no`, `nama tutor`, `nama murid`, `kelas`, `asal sekolah`, `mata pelajaran`, `tanggal les`, `durasi les`. Status tidak ditambahkan ke report.

Karena status tidak tampak pada file, sebelum menulis report UI harus memberi peringatan bahwa semua submission, termasuk yang belum disetujui, akan diekspor. Dialog harus menunjukkan periode, jumlah row, dan nama tab; Admin dapat membatalkan. Re-export memperbarui tab bulan yang sama, bukan append.

## 3. Prinsip produk dan UX

Sistem menggantikan alur manual/repetitif Google Form → Google Sheets → sorting/cleaning manual. Karena itu, prioritaskan pengurangan pekerjaan admin: auto-fill data yang diketahui, pilihan dan validasi yang jelas, default filter bulanan yang masuk akal, tabel yang bisa dicari/filter/sort, review anomaly terpusat, feedback loading/error/success yang jelas, dan ekspor dalam sedikit langkah. Jangan menambah interaksi yang tidak diperlukan atau membuat pengguna mengisi ulang data yang sudah tersedia dari Master Data.

## 4. Keputusan sebelumnya tetap berlaku

- Neon PostgreSQL adalah source of truth; Google Sheets hanya tujuan ekspor on-demand.
- Tutor submit form dari dashboard → Express API → Neon, status awal `pending`.
- Admin melakukan review manual. Hanya `approved` yang dihitung ke estimasi honor dan ditampilkan pada Progress Anak.
- Honor demo Rp50.000 per sesi, bukan tarif resmi UMKM.
- AI mengklasifikasikan dugaan anomali; tidak menghapus/menolak/mengubah honor otomatis.
- Admin/Tutor login username-password; Orang Tua menggunakan ID akses rahasia tanpa password untuk MVP.
- Visual palette/typography final menunggu hasil diskusi tim.

## 5. Hal yang masih terbuka

Pertanyaan O-09 sampai O-15 tetap perlu diperlakukan sebagai provisional. Jangan membuka kembali O-08; keputusan ekspor semua status sudah final untuk baseline ini.
