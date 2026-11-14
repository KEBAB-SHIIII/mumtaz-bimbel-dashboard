# Dummy pemeriksaan tarif November–Desember 2026

Dataset ini disiapkan atas permintaan pengguna untuk pemeriksaan di aplikasi. Masing-masing bulan memiliki 108 sesi valid: 36 SD (18 kelas 1–3, 18 kelas 4–6), 36 SMP, dan 36 SMA. Ada 18 siswa dengan nama Indonesia fiktif (misalnya Bagas Prakoso, Amelia Putri, dan Arif Setiawan), masing-masing enam siswa per jenjang, menggunakan enam tutor aktif yang sudah ada.

Setiap siswa memiliki enam sesi: 60, 90, 91, 120, 150, dan 151 menit. Semua sesi approved dengan snapshot tarif owner. Jadwal antarsesi tutor tidak bertabrakan. Tanggal Desember sengaja berada di masa depan untuk simulasi; validasi tanggal pada form aplikasi tetap berlaku.

| Jenjang | Menit | Kotor | Admin | Bersih tutor |
|---|---:|---:|---:|---:|
| SD 1–3 | 60 | 60.000 | 10.000 | 50.000 |
| SD 1–3 | 90 | 90.000 | 10.000 | 80.000 |
| SD 1–3 | 91 | 90.000 | 20.000 | 70.000 |
| SD 1–3 | 120 | 120.000 | 20.000 | 100.000 |
| SD 1–3 | 150 | 150.000 | 20.000 | 130.000 |
| SD 1–3 | 151 | 150.000 | 30.000 | 120.000 |
| SD 4–6 | 60 | 80.000 | 10.000 | 70.000 |
| SD 4–6 | 90 | 120.000 | 10.000 | 110.000 |
| SD 4–6 | 91 | 120.000 | 20.000 | 100.000 |
| SD 4–6 | 120 | 160.000 | 20.000 | 140.000 |
| SD 4–6 | 150 | 200.000 | 20.000 | 180.000 |
| SD 4–6 | 151 | 200.000 | 30.000 | 170.000 |
| SMP | 60 | 100.000 | 10.000 | 90.000 |
| SMP | 90 | 150.000 | 10.000 | 140.000 |
| SMP | 91 | 150.000 | 20.000 | 130.000 |
| SMP | 120 | 200.000 | 20.000 | 180.000 |
| SMP | 150 | 250.000 | 20.000 | 230.000 |
| SMP | 151 | 250.000 | 30.000 | 220.000 |
| SMA | 60 | 120.000 | 10.000 | 110.000 |
| SMA | 90 | 180.000 | 10.000 | 170.000 |
| SMA | 91 | 180.000 | 20.000 | 160.000 |
| SMA | 120 | 240.000 | 20.000 | 220.000 |
| SMA | 150 | 300.000 | 20.000 | 280.000 |
| SMA | 151 | 300.000 | 30.000 | 270.000 |

Total **per bulan**: kotor Rp19.140.000, admin Rp1.980.000, honor tutor Rp17.160.000. November dan Desember menggunakan komposisi identik agar mudah dibandingkan.

Preview (tidak mengubah database):

```sh
npm run db:seed-tariff-review -w backend
```

Penggantian ulang, hanya atas instruksi eksplisit untuk mengganti dummy pada kedua bulan tersebut:

```sh
npm run db:seed-tariff-review -w backend -- --apply
```

Apply menghapus seluruh sesi tanggal 1 November–31 Desember 2026 beserta relasi mapel/temuan terkait, lalu membuat dataset di atas dalam satu transaksi. Backup JSON sesi lama, mapel, temuan, dan ID data pengganti disimpan dengan akses file terbatas di direktori sementara OS; lokasi dicetak sebelum penghapusan. Data periode lain, akun, dan siswa lama tidak dihapus. ID siswa dummy tetap sehingga pengulangan tidak menggandakan siswa. Script tidak dipanggil otomatis saat aplikasi berjalan.
