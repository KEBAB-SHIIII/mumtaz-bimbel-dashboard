# 01 — Referensi & Matriks Mixing

Status: **disetujui owner (2026-11-01).** Arah tambahan dari owner: mixing sesuai best practice, semodern dashboard kurasi Dribbble/Awwwards, **compact** dan mudah dibaca (lihat "Arah desain" di `README.md`).

## Tiga referensi

| ID | Nama (dari screenshot) | File | Kesan utama |
|---|---|---|---|
| **Ref 1** | Scholix (dashboard sekolah) | `references/ref-1-scholix-full.png`, `ref-1-scholix-detail.png` | Hijau segar, aksen pastel per kartu, nuansa pendidikan, ramah |
| **Ref 2** | Pulse (dashboard SaaS) | `references/ref-2-pulse-full.png`, `ref-2-pulse-detail.png` | Sidebar berkelompok yang rapi, header kuat, kartu bersih, filter chip |
| **Ref 3** | Prodex (dashboard e-commerce) | `references/ref-3-prodex-full.png` | Tipografi tajam dan padat, submenu bergaris, tabel dan daftar aktivitas rapi |

## Matriks mixing

| Bagian | Diambil dari | Detail yang diambil | Yang **tidak** diambil |
|---|---|---|---|
| **Palet warna** | Ref 1 | Hijau daun sebagai brand (cocok dengan identitas bimbel/Mumtaz), gradien hijau → lime **hanya** pada item nav aktif, kotak ikon pastel (hijau, biru, ungu, oranye, coral) di kartu statistik | Latar gradien pelangi di luar frame; bar chart dengan banyak warna sekaligus |
| **Sidebar** | Ref 2 + submenu Ref 3 | Grup berlabel huruf kapital kecil (UTAMA, OPERASIONAL, …), garis pemisah antar grup, ikon garis tipis, item aktif dengan indikator bar kiri, tombol collapse di sebelah logo. Submenu memakai chevron + garis pandu vertikal seperti Ref 3 | Kartu "Upgrade to pro"; switcher workspace |
| **Header** | Ref 2 | Judul halaman besar di kiri; di kanan: pencarian, avatar pengguna, satu tombol aksi utama per halaman | Tombol "AI Insights"; notifikasi palsu |
| **Tipografi** | Ref 3 | Sans-serif neo-grotesque yang padat dan tajam, label grup kapital kecil abu-abu, angka statistik semibold, angka tabel rata (tabular) | — |
| **Kartu statistik** | Ref 1 (warna) + Ref 3 (bentuk) | Bentuk ringkas Ref 3 (ikon bulat kecil + label + angka besar), dengan kotak ikon pastel Ref 1 | Ring persentase di setiap kartu (pakai hanya bila datanya berarti) |
| **Kartu grafik** | Ref 2 | Judul + subjudul di kiri, filter chip segmented di kanan (`Bulan ini / 3 bln / 12 bln`), tooltip putih dengan garis putus-putus | Lebih dari 2 seri per grafik |
| **Filter & tab** | Ref 2 + Ref 3 | Chip segmented (Ref 2) untuk filter cepat; tab segmented abu-abu (Ref 3 "Monthly / Quarterly / Yearly") untuk ganti tampilan | — |
| **Tabel** | Ref 3 | Header abu-abu muda dengan ikon sort, baris lega, tombol `Urutkan` / `Filter` di kanan atas kartu | Checkbox massal (kecuali ada aksi massal nyata) |
| **Badge status** | Ref 3 (pill lembut, mis. "New Order", "Low Stock") | Pill compact + titik status + teks (`Valid`, `Perlu revisi`, `Ditolak`); detail di `04-components.md` | Outline + bar kiri Ref 2 (diganti atas permintaan owner: lebih modern & compact) |
| **Daftar aktivitas** | Ref 3 | Kartu baris: ikon bulat + judul + meta abu-abu + badge di kanan | — |
| **Avatar** | — (keputusan tim) | DiceBear critters, lihat `04-components.md` | Foto orang |

## Keputusan yang dikonfirmasi

- Sidebar = **Pulse (Ref 2)** dengan grup menu berlabel, ditambah pola submenu dari **Ref 3** untuk Master Data (Tutor/Siswa/Orang Tua/Mapel). Dikonfirmasi owner.
- Font = **Inter Variable** (paling mendekati Ref 3, self-host). Dikonfirmasi owner.
