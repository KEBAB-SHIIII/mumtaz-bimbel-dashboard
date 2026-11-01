# 05 — Komposisi Halaman

Isi data dan aturan tiap halaman ada di `docs/07-DESIGN-GUIDELINES.md` dan `docs/15-DASHBOARD-TABS.md`. File ini hanya menjelaskan **susunan visual**.

## Login (Admin/Tutor, Orang Tua)

Kartu terpusat di atas latar `background` dengan aksen gradien hijau lembut di satu sisi (bukan pelangi). Logo + nama "Mumtaz Bimbel", satu kolom field, tombol primary lebar penuh. Tautan pindah ke login Orang Tua di bawah kartu. Tanpa sidebar.

## Admin

| Halaman | Susunan |
|---|---|
| Dashboard | 4 StatCard → grafik sesi/tagihan per bulan (2/3) + ringkasan validitas Valid/Perlu revisi/Ditolak sebagai progress bar (1/3, gaya "Fees Overview" Ref 1) → daftar aktivitas terbaru (Ref 3) |
| Data Absensi | Header: judul + tombol "Ekspor Sheets". Baris filter: SearchInput + PeriodSelector + chip validitas (Semua / Valid / Perlu revisi / Ditolak). DataTable dengan animasi filter. Detail sesi lewat Dialog |
| Penagihan | PeriodSelector + StatCard total → tabel per murid |
| Honor Tutor | PeriodSelector + StatCard → tabel per tutor dengan avatar |
| Master Data | Submenu sidebar menggantikan tab internal. Tiap sub: SearchInput + tombol "Tambah" + DataTable; status aktif/nonaktif lewat badge |

## Tutor (mobile-first)

| Halaman | Susunan |
|---|---|
| Dashboard | Sapaan + avatar → 2 StatCard (sesi bulan ini, honor bulan ini) → CTA "Isi Absensi" mencolok → 5 sesi terakhir sebagai daftar kartu |
| Form Absensi | Satu kolom, dikelompokkan per bagian (murid, waktu, mapel, materi). Tombol submit sticky di bawah pada mobile |
| Riwayat Mengajar | Chip validitas + PeriodSelector → daftar kartu (mobile) / tabel (desktop) |
| Honor Saya | PeriodSelector + StatCard + rincian per sesi |
| Profil | Avatar besar + data akun |

## Orang Tua (mobile-first)

| Halaman | Susunan |
|---|---|
| Progress Anak | Kartu identitas anak (avatar, kelas, sekolah) → StatCard jumlah sesi/jam bulan ini → grafik kecil per bulan |
| Riwayat Pembelajaran | Timeline daftar kartu per sesi: tanggal, mapel, tutor, materi |

## State wajib di setiap halaman

Loading (skeleton sesuai bentuk konten, aturan di `04-components.md` § Skeleton), kosong (empty state + aksi), error (pesan + tombol coba lagi), dan hasil pencarian kosong ("Tidak ada hasil untuk '…'" + tombol reset filter).

## Implementasi Tahap 4 (2026-11-02)

Semua halaman memakai `QueryView`/`LoadingSwitch` (skeleton berbentuk konten → konten, error + "Coba lagi"), `NoResultsState` untuk filter/pencarian kosong (dengan "Reset filter"), dan `SearchInput` (debounce) menggantikan form "Cari". Penyimpangan yang disengaja:

- **Filter validitas/status tetap `<select>`**, bukan chip: test yang ada memilih lewat label "Validitas"/"Status", dan dropdown lebih ringkas di HP. Bisa diganti `SegmentedControl` bila test ikut diperbarui.
- **Master Data**: tab internal tetap ada sebagai pintasan pil di < 1024px (sidebar = drawer); disembunyikan di desktop karena submenu sidebar sudah menggantikannya.
- **Dashboard Admin**: ringkasan validitas (progress bar) dan daftar aktivitas terbaru **belum** ditampilkan karena API ringkasan belum menyediakan datanya (kontrak API tidak diubah di tahap ini). Grafik pendapatan kini 2 seri bertumpuk (bersih bimbel `primary` + gaji tutor `accent-coral`; puncaknya = omzet kotor, tampil di tooltip). Warna grafik dibaca dari token saat runtime (`lib/theme-colors.ts`).
- **Progress Anak**: grafik kecil per bulan belum ada karena API hanya memberi data per periode; diganti StatCard + timeline sesi.
- **Tutor Dashboard**: kartu status (Menunggu/Disetujui/Perlu revisi) tetap ada sebagai tautan ke riwayat terfilter, ditambah CTA "Isi Form Absensi" yang menonjol.
- **Form Absensi**: satu kolom di HP dengan tombol kirim menempel di bawah layar (safe area); urutan field tetap dari `attendance-fields.tsx` (dipakai bersama dialog Admin).
