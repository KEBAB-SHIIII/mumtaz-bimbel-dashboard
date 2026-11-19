# Masalah Data & Penanganan — Migrasi Data Asli (CSV Tim DS)

Sumber: `docs/dataset/data clean bimbel from ds.csv` (file lokal, tidak di-commit karena berisi data pribadi) (4.760 baris, 5 Feb 2025 – 21 Okt 2026), hasil cleaning
tim DS dari sheet absensi owner. Diimpor dengan `npm run db:import-real-data -w backend` (preview default,
`-- --apply` untuk menulis). Dokumen ini mencatat masalah kualitas data yang ditemukan saat profiling,
keputusan penanganannya, dan cara Admin mengoreksi bila perlu.

> **Privasi:** repo ini publik, jadi nama tutor/murid disamarkan menjadi kode (`Tutor-01`, `Murid-01`, …).
> Tabel kode → nama asli ada di `docs/dataset/kode-nama.local.md` (lokal, di-ignore git).

> Ini data **historis**. Penanganan di bawah memilih aturan yang konsisten dan dapat ditelusuri, bukan
> kebenaran mutlak. Semua sesi hasil impor bertanda `admin_note = "Impor data historis DS"`.

## Ringkasan hasil impor (preview 19-11-2026)

| Item | Jumlah |
|---|---|
| Tutor | 37 (akun baru, wajib ganti password saat login pertama) |
| Murid (nama + sekolah) | 135 |
| Mata pelajaran | 23 |
| Sesi diimpor | 4.714 (status `approved`, label `valid`, AI `not_evaluated`) |
| Baris dilewati (duplikat persis) | 46 |
| Riwayat kelas | 162 baris |
| Data dipertahankan | Admin `admin`; murid demo **data testing** + 8 sesinya, 8 flag anomalinya, tutor **Farhan**, dan 5 mapelnya |
| Data dummy dihapus | 5 tutor dummy, 16 akun orang tua + 20 tautannya, 40 murid dummy, 272 sesi dummy |

Backup data lama ditulis ke file JSON di luar repo sebelum penghapusan. Seluruh impor berjalan dalam satu
transaksi: bila verifikasi jumlah/total tarif gagal, tidak ada yang berubah.

## 1. Nama murid sama, orang berbeda (homonim)

**Masalah.** CSV tidak punya ID murid. Nama yang sama muncul di sekolah/jenjang yang jelas berbeda,
mis. *Murid-06* (Kelas 10 SMAN 1 Sampit **dan** TK B TK Perwanida), *Murid-22* (4 sekolah), *Murid-09* (3 sekolah).

**Penanganan.** Identitas murid = **nama + asal sekolah**. Nama sama di sekolah berbeda = murid berbeda.

**Efek samping yang perlu diketahui.** Murid yang benar-benar sama tetapi pindah sekolah (umumnya
lulus TK → SD) ikut terpecah menjadi 2 profil. Kasus yang terdeteksi (19 nama):

| Nama | Profil yang terbentuk |
|---|---|
| Murid-01 | SDN 3 Mentawa Baru Hilir (4 sesi) · SDN 6 Mentawa Baru Hulu (85) |
| Murid-04 | TK Negeri Pembina (42) · SDN 3 Mentawa Baru Hulu (25) |
| Murid-05 | TK Nurul Iman (41) · SD Cita Bunda (9) |
| Murid-06 | TK Perwanida (2) · SMAN 1 Sampit (3) — jelas 2 orang |
| Murid-08 | TK Perwanida (55) · SDN 2 Mentawa Baru Hilir (15) |
| Murid-09 | Belum diketahui/TK (7) · SDIT Arafah (123) · SDN 6 Mentawa Baru Hulu (2) |
| Murid-10 | SDIT Arafah (1) · SDN 3 Mentawa Baru Hulu (222) |
| Murid-13 | TK Baiturrahim (1) · SDIT Asiah (31) |
| Murid-14 | Belum diketahui/PAUD (59) · TK Tutor-04 (14) |
| Murid-15 | TKIT Nurul Hidayah (1) · SDIT Arafah (92) |
| Murid-18 | TK Aba Halimatussyaadiyah (47) · SDIT Asiah (7) |
| Murid-19 | PAUD Pahan School (47) · TK Pahan School (21) |
| Murid-20 | TK Taud Saqu Hadiqotul Qur An Al Ishlah (17) · SDN 1 Baamang Tengah (10) |
| Murid-22 | SDN 6 Mentawa Baru Hilir (1) · Nusantara Global School (5) · SMPN 1 Sampit (28) · SMAN 2 Sampit (23) |
| Murid-23 | TKIT Nurul Hidayah (84) · SDN 6 Baamang Tengah (19) |
| Murid-24 | TKIT Arafah (24) · SDI Baiturrahim (113) |
| Murid-25 | SDN 4 Baamang Hilir (22) · SMP IT Arafah (3) |
| Murid-26 | TK Islam Bilingual Casablanca (3) · SDIT Asiah (5) |
| Murid-27 | TKIT Arafah (24) · SDIT Arafah (129) |

Tarif tidak terpengaruh, karena kelas dan tarif disimpan per sesi. Yang terpengaruh hanya tampilan profil
murid (riwayat les terbagi dua). Profil lama (mis. TK) yang sudah tidak aktif dapat dinonaktifkan Admin.

## 2. Kelas berganti bolak-balik dalam satu tahun ajaran

**Masalah.** Kolom `kelas` untuk murid yang sama berubah-ubah antarbaris dalam tahun ajaran yang sama,
mis. Murid-16: 2 SD → 1 SD → 2 SD → 1 SD … (45 kali); Murid-21 2025/2026: 54 sesi "Kelas 4", 16 sesi "Kelas 3".
Ada 54 kombinasi murid × tahun ajaran yang tercampur, ±400 sesi.

**Penanganan (keputusan user).** Per murid per **tahun ajaran (Juli–Juni)** dipakai kelas **mayoritas**;
bila seri, dipakai kelas yang lebih tinggi. Riwayat kelas tercatat sekali saat kelas berubah (umumnya
naik kelas per tahun ajaran).

**Dampak ke tarif.** Hanya 7 kombinasi yang melewati batas tarif (SD 1–3 Rp60.000 ↔ SD 4–6 Rp80.000):

| Murid | Tahun ajaran | Isi CSV | Kelas dipakai |
|---|---|---|---|
| Murid-21 (SDN 5 Baamang Hulu) | 2024/2025 | 4 SD ×15, 3 SD ×4 | 4 SD |
| Murid-21 (SDN 5 Baamang Hulu) | 2025/2026 | 4 SD ×54, 3 SD ×16 | 4 SD |
| Murid-11 | 2024/2025 | 4 SD ×8, 3 SD ×2 | 4 SD |
| Murid-11 | 2025/2026 | 4 SD ×46, 3 SD ×12 | 4 SD |
| Murid-12 | 2025/2026 | 5 SD ×79, 4 SD ×23, 1 SD ×1 | 5 SD |
| Murid-02 | 2026/2027 | 4 SD ×15, 2 SD ×8 | 4 SD |
| Murid-03 | 2026/2027 | 4 SD ×59, 3 SD ×2 | 4 SD |

Satu kelas mundur antartahun ajaran tetap ada dan dibiarkan: **Murid-17** 3 SD (2024/2025) →
2 SD (mulai 1 Jul 2025). Kemungkinan salah ketik di sumber; cek ke owner.

## 3. Materi les tidak tersedia

**Masalah.** Sheet owner menggabungkan mapel dan materi dalam satu kolom (mis. "Mengaji, hafalan dan
berhitung"). Tim DS menormalkannya menjadi kategori mapel baku, sehingga kolom `materi` kosong untuk semua
baris dan detail materi hilang. Contoh untuk Murid-27, Jan 2026: "Game Edukasi" dan "tugas sekolah" tidak
tercatat, dan "berhitung" (8 Jan) tidak dipetakan ke Matematika.

**Penanganan (keputusan user).** Impor tetap dijalankan tanpa materi. Kolom materi sesi diisi nama
mapelnya (mis. "Matematika; Mengaji, Tajwid, dan Hafalan"). Bila suatu saat tim DS bisa menyertakan teks
asli, materi dapat diisi ulang dari kolom tersebut.

## 4. Duplikat & bentrok jadwal

- **46 duplikat persis** (tutor, murid, tanggal, jam mulai, jam selesai, mapel sama): baris kedua dilewati.
  Nomor barisnya ada di laporan impor (`issues.duplicates`).
- **74 slot tutor yang sama di jam mulai yang sama dengan murid berbeda**: tetap diimpor, karena
  kemungkinan les kelompok. Semua sesi impor berstatus `approved`, jadi slot ini tidak masuk antrean AI.

## 5. Jam tidak wajar (dilewati, tidak diimpor)

| Baris CSV | Tutor | Murid | Tanggal | Jam |
|---|---|---|---|---|
| 1102 | Tutor-07 | Murid-16 | 2025-06-23 | 06:30–07:30 (sebelum 07.00) |
| 2439 | Tutor-05 | Murid-07 | 2026-02-11 | 01:00–02:00 (kemungkinan 13:00–14:00) |
| 3834 | Tutor-08 | Murid-11 | 2026-06-04 | 16:00–19:10 (190 menit) |

**Penanganan (keputusan user).** Baris dengan durasi < 30 / > 180 menit atau jam mulai < 07.00 / > 21.00
(batas validitas D-25) **tidak diimpor**. Bila owner mengonfirmasi jam yang benar, Admin dapat menambahkan
sesinya manual lewat dashboard.

## 6. Nama tutor yang mirip (dibuat terpisah)

- **Tutor-01** (466 sesi) dan **Tutor-04** (33): **dikonfirmasi user sebagai 2 orang berbeda** — benar dibuat terpisah.

Masih perlu dikonfirmasi owner apakah orang yang sama:

- **Tutor-01** vs **Tutor-02** (3 sesi)
- **Tutor-09** (48) vs **Tutor-06** (15)
- **Tutor-03** (2 sesi sebagai tutor; ada juga murid dengan nama yang sama)

Bila sama, Admin dapat memindahkan sesi ke satu tutor lalu menonaktifkan akun yang lain.

## 7. Cakupan periode

- **Oktober 2025 kosong total**: tidak ada satu pun baris. Perlu dikonfirmasi ke tim DS/owner.
- Feb–Apr 2025 hanya 6 baris (data mulai rapi Mei 2025).
- Oktober 2026 hanya sampai tanggal 21 (79 sesi).

## 8. Pemetaan kelas & lain-lain

| CSV | Aplikasi | Tarif |
|---|---|---|
| Belum Sekolah, PAUD | PAUD | PAUD–TK |
| TK A, TK B | TK | PAUD–TK |
| Kelas 1–6 | 1–6 SD | SD 1–3 / SD 4–6 |
| Kelas 7–9 | 1–3 SMP | SMP |
| Kelas 10 | 1 SMA | SMA |

- Mapel "Pendidikan Pancasila dan Kewarganegaraan" disingkat menjadi **PKN** (permintaan user).
- Asal sekolah "Belum diketahui" (109 baris) dipertahankan apa adanya.
- Data orang tua tidak ada di CSV. Semua akun orang tua dummy dihapus; Admin membuat akun orang tua
  asli lewat dashboard (ID Akses dibuat sistem).
- Sesi historis tidak dikirim ke model AI (`not_evaluated`) dan langsung dihitung dengan tarif saat ini
  (snapshot dikunci). Koreksi tetap bisa lewat dashboard Admin; koreksi kelas memakai preview dampak.
