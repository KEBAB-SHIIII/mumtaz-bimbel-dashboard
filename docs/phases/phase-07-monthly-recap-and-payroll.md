# Phase 07 — Rekap Bulanan dan Honor Tutor

> **Catatan D-24 (30 Okt 2026):** penugasan tutor dan tarif per penugasan sudah dihapus. Istilah *assignment/penugasan/tarif demo* di dokumen fase ini bersifat historis; Tutor kini memilih murid dan mapel sendiri dan honor memakai satu tarif tunggal dari konfigurasi. Lihat `docs/17` D-24.

## Tujuan

Menyediakan rekap bulanan dan estimasi honor yang transparan, dihitung di backend, dan dapat ditelusuri ke sesi yang telah disetujui Admin. Ekspor PDF bukan bagian dari baseline; tambahkan hanya setelah owner menyetujui scope tambahan.

## Aturan development yang sudah ditentukan

- Gunakan tarif demo **Rp50.000 per sesi** untuk seluruh assignment pada seed development.
- Simpan rate di `tutor_rates`: `rate_type='per_session'`, `rate_amount=50000`, `is_demo_assumption=true`.
- Nominal dari rate demo ditandai badge kecil **"Tarif demo"** di samping nominal pada halaman Honor. Label panjang "Simulasi — bukan tarif resmi UMKM" dihapus karena membingungkan (keputusan owner D-20).
- Jangan hard-code Rp50.000 ke rumus atau komponen UI. Kalkulator membaca data tarif dan snapshot dari database.
- Hanya sesi `approved` yang dihitung. `pending`, `revision_requested`, dan `rejected` ditampilkan terpisah serta tidak masuk total honor.
- Honor adalah estimasi berdasarkan sesi disetujui, bukan catatan pembayaran aktual.

## Tugas

1. Implementasikan recap service untuk periode `YYYY-MM` berdasarkan `lesson_date`.
2. Dukung pengelompokan berdasarkan tutor/siswa/mapel sesuai kontrak.
3. Hitung honor di backend menggunakan aritmetika decimal-safe: jumlah sesi approved × tarif per sesi yang berlaku.
4. Untuk demo, satu sesi approved bernilai Rp50.000 berdasarkan konfigurasi `tutor_rates`, bukan konstanta kalkulator.
5. Simpan snapshot tipe/nilai tarif yang digunakan agar histori konsisten.
6. Jika tarif tidak ditemukan, tampilkan warning dan jangan mengarang nominal.
7. UI Admin `Honor Tutor` dan Tutor `Honor Saya` menggunakan service backend yang sama, dengan scope akses sesuai role.
8. Jangan membuat status “sudah dibayar” atau payment tracking tanpa keputusan scope terpisah.
9. Jangan implementasikan PDF pada phase ini. Jika owner kemudian menyetujuinya sebagai scope tambahan, gunakan service kalkulasi yang sama dan beri label periode serta tarif simulasi.

## Acceptance criteria

- [ ] Filter periode memakai `lesson_date`.
- [ ] Pending/revision/rejected tidak masuk nominal estimasi.
- [ ] Setiap sesi approved dalam seed demo bernilai Rp50.000 dari konfigurasi tarif.
- [ ] UI menandai nominal tarif demo dengan badge "Tarif demo".
- [ ] Frontend tidak menghitung ulang rumus.
- [ ] Total dapat ditelusuri kembali ke daftar sesi approved.
- [ ] Tidak ada klaim status pembayaran aktual palsu.
