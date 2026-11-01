# 03 — Layout & App Shell

Kode terkait: `frontend/src/components/layout/app-shell.tsx`, `navigation.ts`.

## Struktur desktop (≥ 1024px)

```
┌──────────────┬──────────────────────────────────────────────┐
│ [logo] Mumtaz│ Judul Halaman          [cari] [avatar] [Aksi]│  ← header (Ref 2)
│          [⇤] │                                              │
│──────────────│ ┌────────────── frame konten ──────────────┐ │
│ UTAMA        │ │ kartu statistik  ×4                      │ │
│ ▌ Dashboard  │ │ kartu grafik         │ kartu ringkasan   │ │
│──────────────│ │ tabel / daftar                            │ │
│ OPERASIONAL  │ └──────────────────────────────────────────┘ │
│   Data Absen │                                              │
│   Penagihan  │                                              │
│   Honor Tutor│                                              │
│──────────────│                                              │
│ PENGATURAN   │                                              │
│   Master Data▾                                              │
│   │ Tutor    │                                              │
│   │ Siswa    │                                              │
│   │ Orang Tua│                                              │
│   │ Mapel    │                                              │
│              │                                              │
│ [avatar] Nama│                                              │
│  Role · Kel. │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

- Sidebar 240px, bisa di-collapse menjadi 64px (ikon saja + tooltip). Status collapse disimpan di `localStorage` (preferensi UI, bukan kredensial).
- Konten utama maksimal ~1440px. Frame konten memakai `--radius-xl` di atas `--color-background` seperti Ref 2.
- Header tidak sticky di mobile; sticky dengan blur tipis di desktop.

## Pengelompokan menu

| Role | Grup → item |
|---|---|
| Admin | **UTAMA**: Dashboard · **OPERASIONAL**: Data Absensi, Penagihan, Honor Tutor · **PENGATURAN**: Master Data ▾ (Tutor, Siswa, Orang Tua, Mata Pelajaran) |
| Tutor | **UTAMA**: Dashboard · **MENGAJAR**: Form Absensi, Riwayat Mengajar · **AKUN**: Honor Saya, Profil |
| Orang Tua | **ANAK**: Progress Anak, Riwayat Pembelajaran (tanpa label grup jika hanya satu grup) |

Submenu: chevron berputar 90°, anak menjorok dengan garis pandu vertikal (Ref 3). Submenu otomatis terbuka jika rute aktif berada di dalamnya.

## Breakpoint

| Lebar | Perilaku |
|---|---|
| < 640px (HP) | Sidebar menjadi **drawer** dari kiri (Headless UI `Dialog`) lewat tombol menu di header. Header: tombol menu + judul + avatar; pencarian jadi ikon. Kartu statistik 2 kolom (Admin) atau 1 kolom. Tabel berubah menjadi **daftar kartu** (lihat `04-components.md`). Aksi utama halaman jadi tombol lebar penuh atau tombol melayang (Tutor: "Isi Absensi"). |
| 640–1023px (tablet) | Drawer seperti HP. Kartu statistik 2 kolom, grafik 1 kolom. |
| ≥ 1024px | Sidebar tetap. Kartu statistik 4 kolom, grafik 2/3 + 1/3. |

## Prioritas per role

- **Tutor** dan **Orang Tua** dianggap mayoritas membuka lewat HP: desain mobile-first, target sentuh ≥ 44px, form satu kolom.
- **Admin** mayoritas desktop: tabel lebar, filter terlihat langsung tanpa harus dibuka.

## Area aman

Gunakan `env(safe-area-inset-*)` untuk drawer dan tombol melayang. Tidak ada scroll horizontal di level halaman; scroll horizontal hanya boleh di dalam tabel dengan bayangan tepi sebagai petunjuk.
