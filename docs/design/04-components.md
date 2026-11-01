# 04 — Komponen, Animasi & Avatar

## Library

| Kebutuhan | Pilihan | Alasan |
|---|---|---|
| Primitive aksesibel (Dialog, Menu, Listbox, Combobox, Tabs, Disclosure, Popover, Switch) | `@headlessui/react` v2 (sudah terpasang) | Tanpa styling sendiri, focus trap dan ARIA sudah benar, punya transisi bawaan |
| Animasi | `motion` (Motion for React, `motion/react`) | Satu library untuk layout animation, `AnimatePresence`, shared `layoutId`, dukungan reduced motion. Dimuat lewat `LazyMotion` + `domAnimation` + komponen `m.*` agar bundle kecil |
| Ikon | `lucide-react` (sudah terpasang) | Gaya garis tipis seperti Ref 2 |
| Grafik | `recharts` (sudah terpasang) | Animasi masuk bawaan; jangan tambah library chart kedua |
| Avatar | `@dicebear/core` v10 + `@dicebear/styles` (hanya `critters.json`) | Generate SVG lokal, lisensi critters CC0 |
| Font | `@fontsource-variable/inter` | Self-host, tanpa CDN |

**ReactBits** bukan library yang di-install; isinya komponen salin-tempel. Boleh diadaptasi **hanya** jika dependensinya cuma `motion` atau CSS murni (misalnya Count Up, Animated List, Fade/Blur Content). Komponen yang butuh GSAP, three.js, ogl, atau efek latar berat tidak dipakai. Komponen yang diadaptasi ditulis ulang memakai token kita dan dicatat sumbernya di komentar file.

## Pembagian tugas animasi

Prinsip: **CSS/Tailwind** untuk micro-interaction (hover, press, warna), **transisi Headless UI** untuk overlay yang buka/tutup, **Motion** hanya untuk perubahan struktur (elemen muncul/hilang dari daftar, posisi berpindah, isi berganti).

### Per komponen

| Komponen | Mekanisme | Animasi |
|---|---|---|
| **Button** | CSS | Hover: warna 150ms. Press: `scale(0.97)` 100ms. Loading: label fade ke spinner, lebar tombol tetap |
| **Chip filter / SegmentedTabs** | Motion `layoutId` | Latar "pil" aktif meluncur ke chip yang diklik (spring `stiffness 400, damping 32`) |
| **Isi tab** | Motion `AnimatePresence mode="wait"` | Isi lama fade out 120ms, isi baru fade + naik 6px 200ms |
| **Dialog / modal** | Headless UI `transition` (`data-closed`, `data-enter`, `data-leave`) | Backdrop fade 200ms. Panel fade + `scale 0.96→1` + naik 8px; masuk 250ms `--ease-out`, keluar 180ms `--ease-in` |
| **Dialog di HP (bottom sheet)** | Headless UI `transition` | Panel naik dari bawah `translateY(100%)→0` 300ms |
| **Drawer sidebar (HP)** | Headless UI `Dialog` + `transition` | Geser dari kiri `-100%→0` 280ms, backdrop fade |
| **Dropdown / Listbox / Combobox / Popover** | Headless UI `transition` | Fade + `scale 0.95→1` dari sisi anchor 150ms |
| **Submenu sidebar** | Headless UI `Disclosure` + Motion `height: auto` | Buka/tutup 200ms, chevron berputar 90° |
| **Sidebar collapse** | CSS `grid-template-columns` | Lebar 240↔64px 200ms; label fade, ikon diam di tempat |
| **Tabel & daftar (filter/cari)** | Motion `AnimatePresence mode="popLayout"` + `layout` per baris | Baris keluar fade + `scale 0.98`, sisa baris merapat; baris baru fade masuk dengan stagger 20ms (maksimal 10 baris pertama). Lebih dari 50 baris: cukup crossfade isi tabel |
| **SearchInput** | CSS + Motion | Tombol hapus (×) fade/scale masuk saat ada teks. Hasil mengikuti animasi tabel |
| **Kartu statistik** | Motion + count up (adaptasi ReactBits) | Kartu fade + naik 8px dengan stagger 40ms saat halaman pertama dimuat; angka count up 600ms sekali saja |
| **Badge status** | Motion `AnimatePresence mode="popLayout"` | Saat status berubah (mis. hasil AI masuk), badge lama crossfade ke badge baru 180ms. Titik "Menganalisis" berdenyut pelan |
| **Grafik (Recharts)** | Animasi bawaan Recharts | Masuk 600ms `ease-out`; tooltip mengikuti kursor tanpa delay |
| **Skeleton → konten** | Motion `AnimatePresence` | Skeleton fade out, konten fade in 200ms di posisi yang sama, tanpa layout shift |
| **Toast** | Motion | Masuk dari atas (HP) atau kanan bawah (desktop) fade + geser 12px; keluar fade |
| **Pindah halaman** | Motion pada area konten | Fade 150ms saja; sidebar dan header tidak ikut beranimasi |

Semua animasi gerak dibungkus `<MotionConfig reducedMotion="user">`. Transisi Headless UI memakai varian Tailwind `motion-reduce:` untuk mematikan transform. Hanya `transform` dan `opacity` yang dianimasikan (tidak `width`/`top`), kecuali tinggi submenu.

## Inventaris komponen

Kolom "File" mengacu ke `frontend/src/components/`.

| Komponen | File | Status | Catatan visual |
|---|---|---|---|
| Button | `ui/button.tsx` | ubah | Varian `primary`, `secondary` (outline), `ghost`, `danger`; ukuran sm/md; state loading dengan spinner di dalam tombol, lebar tidak berubah |
| Badge / StatusBadge / ValidityBadge / ApprovalBadge | `ui/badge.tsx` | ubah | Pill compact dengan titik status, lihat "Badge status" di bawah |
| DataTable | `ui/data-table.tsx` | ubah | Header Ref 3 dengan ikon sort; < 640px tampil sebagai daftar kartu (kolom penting di atas, lainnya label–nilai) |
| Dialog | `ui/dialog.tsx` | ubah | Transisi di atas; < 640px tampil sebagai bottom sheet |
| Field (input, select, textarea) | `ui/field.tsx` | ubah | Tinggi 36px (44px di perangkat sentuh, font 16px), radius `md`, label persisten, error di bawah field |
| Feedback (alert, empty, error) | `ui/feedback.tsx` | ubah | Empty state: ikon dalam kotak pastel + kalimat + aksi |
| PeriodSelector | `ui/period-selector.tsx` | ubah | Gaya chip/segmented Ref 2 |
| Layout primitives (PageHeader, Card, Section) | `ui/layout-primitives.tsx` | ubah | Card: judul + subjudul kiri, aksi kanan (Ref 2) |
| AppShell | `layout/app-shell.tsx` | ubah | Lihat `03-layout.md` |
| Sidebar + NavGroup + NavSubmenu | `layout/` | **baru** | Grup berlabel, submenu, collapse |
| StatCard | `ui/stat-card.tsx` | **baru** | Kotak ikon pastel + label + angka + (opsional) delta |
| SegmentedTabs | `ui/segmented-tabs.tsx` | **baru** | Headless UI `TabGroup` + indikator `layoutId` |
| SearchInput | `ui/search-input.tsx` | **baru** | Ikon kiri, tombol hapus, debounce 250ms |
| Skeleton | `ui/skeleton.tsx` | **baru** | Lihat "Skeleton" di bawah |
| Avatar | `ui/avatar.tsx` | **baru** | Lihat di bawah |

## Badge status (modern & compact)

Bentuk: **pill lembut + titik status + teks.** Lebih ringkas daripada gaya outline Ref 2, tetap terbaca tanpa bergantung warna.

```
 ● Valid      ● Perlu revisi      ● Ditolak      ◌ Menganalisis
```

| Properti | Nilai |
|---|---|
| Tinggi | 22px (`sm`: 20px untuk sel tabel padat) |
| Padding | 0 8px, gap titik–teks 6px |
| Huruf | 12px / 500, `tabular-nums`, tidak uppercase |
| Radius | penuh (`9999px`) |
| Latar | warna status `-subtle` |
| Garis | `ring-1 ring-inset` warna status pada opasitas ~20% (bukan border penuh) |
| Titik | 6px, warna status jenuh |
| Teks | warna status versi gelap, kontras ≥ 4.5:1 terhadap latarnya |

| Status | Tone | Titik |
|---|---|---|
| Valid / Disetujui / Aktif | success | solid |
| Perlu revisi / Menunggu | warning | solid |
| Ditolak / Nonaktif | danger | solid |
| Menganalisis (AI) | info | berdenyut pelan (`motion-reduce`: diam) |
| Draf / lainnya | neutral | solid abu-abu |

- Teks label tetap dari `SESSION_STATUS_LABELS`, `VALIDITY_LABELS`, `APPROVAL_LABELS` di `badge.tsx`; tidak boleh dikarang ulang.
- Ikon Lucide di dalam badge **tidak** dipakai secara default supaya tetap compact. Pengecualian: `FindingIndicator` (jumlah temuan AI) memakai ikon 12px + angka.
- Jika satu baris punya dua badge (validitas + approval), keduanya berjejer dengan gap 4px dan tidak turun baris di desktop.

## Skeleton (pre-loading)

Tujuan: halaman terasa rapi dan langsung "berbentuk" saat data dimuat, tanpa lompatan layout.

- **Bentuk mengikuti konten asli** (bukan blok generik). Disediakan varian siap pakai:
  - `SkeletonStatCards`: 4 kartu (2 di HP), kotak ikon + 2 garis.
  - `SkeletonChart`: judul + area grafik dengan tinggi sama dengan grafik asli.
  - `SkeletonTable`: header asli tetap tampil (tidak di-skeleton) + 6 baris dengan lebar kolom sama dengan tabel.
  - `SkeletonCardList`: versi HP dari tabel, 4 kartu.
  - `SkeletonForm`: label + field.
  - `SkeletonProfile`: avatar bulat + 2 garis.
- **Visual:** latar `surface-muted`, radius mengikuti elemen aslinya, efek shimmer gradien diagonal pelan (1,5 detik, CSS `@keyframes`, hanya animasi `transform`). Saat `prefers-reduced-motion`, shimmer diganti denyut opasitas statis atau tanpa animasi.
- **Waktu tampil:** skeleton baru muncul jika loading lebih dari **150ms** (mencegah kedipan pada request cepat). Begitu tampil, skeleton bertahan minimal **300ms** agar transisi tidak terasa patah.
- **Kapan dipakai:** loading pertama halaman (TanStack Query `isPending`), lazy route (`Suspense` fallback), dan avatar sebelum SVG jadi. Saat **refetch** (ganti periode/filter) data lama tetap tampil dengan opasitas 60% + bar progres tipis di atas kartu, **bukan** kembali ke skeleton.
- **Aksesibilitas:** container memakai `aria-busy="true"` dan satu teks `sr-only` "Memuat data…". Elemen skeleton sendiri `aria-hidden`.

## Avatar DiceBear critters

```ts
import { Avatar } from '@dicebear/core';
import critters from '@dicebear/styles/critters.json' with { type: 'json' };
```

- **Seed = ID internal user** (UUID akun tutor/admin, atau ID murid untuk Orang Tua). Avatar jadi stabil walau nama diganti.
- **Dilarang** memakai ID Akses Orang Tua, password, atau data rahasia lain sebagai seed.
- Generate di browser lalu `useMemo` per seed. Tidak ada request ke `api.dicebear.com`. Style JSON (~53 KB) di-*lazy import* agar tidak masuk bundle awal halaman login.
- Latar avatar memakai warna pastel dari token aksen. Ukuran 32px (header/tabel), 40px (sidebar), 72px (profil).
- `alt=""` bila nama ditampilkan di sebelahnya. Jika tidak, `alt` berisi nama.
- Tidak ada fitur upload foto. Avatar tidak bisa diatur manual.
