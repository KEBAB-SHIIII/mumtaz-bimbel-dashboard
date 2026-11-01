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

### Komponen adaptasi ReactBits (dipilih owner, 2026-11-02)

Dikerjakan di Tahap 3 dan ditaruh di `frontend/src/components/ui/`. Semua ditulis ulang memakai token kita, tanpa dependensi selain `motion`, dan sumber ReactBits dicatat di komentar file.

| Komponen | File | Dipakai di | Aturan |
|---|---|---|---|
| **CountUp** | `count-up.tsx` | Angka `StatCard` (Rp, jumlah sesi, jam) | 600ms, sekali saja saat pertama terlihat (`useInView once`). Format lewat `Intl.NumberFormat('id-ID')`, `tabular-nums` agar lebar tetap. Pembaca layar menerima nilai akhir (bukan angka yang sedang berjalan). Reduced motion: langsung tampil nilai akhir |
| **AnimatedList** | `animated-list.tsx` | Riwayat sesi tutor, daftar "Perlu revisi", daftar kartu DataTable di HP | Item fade + naik 6px, stagger 20ms, maksimal 10 item pertama; sisanya tampil tanpa animasi. Bukan untuk tabel > 50 baris. Reduced motion: fade saja |
| **FadeContent** | `fade-content.tsx` | Transisi skeleton → konten, blok konten saat masuk layar | Fade + blur 4px→0, 200ms, `once`. Pengecualian aturan "hanya transform & opacity": `filter: blur` dibolehkan karena kecil dan sekali jalan. Reduced motion: opasitas saja, tanpa blur |
| **SpotlightCard** | `spotlight-card.tsx` | Kartu login, `StatCard` | CSS murni: posisi kursor disimpan di variabel CSS lewat `pointermove`, latar `radial-gradient` warna `primary-subtle` dengan opasitas rendah. Hanya aktif di `@media (hover: hover) and (pointer: fine)`; di HP tampil sebagai kartu biasa. Dekoratif: kontras teks tetap diukur terhadap `surface` dan tidak boleh turun di bawah 4.5:1 |

Yang tetap **tidak** dipakai dari ReactBits: komponen berbasis GSAP (Split Text, Animated Content, dsb.), three.js/ogl (latar 3D, partikel, shader), dan efek yang berjalan terus-menerus (marquee, partikel latar).

## Pembagian tugas animasi

Prinsip: **CSS/Tailwind** untuk micro-interaction (hover, press, warna), **transisi Headless UI** untuk overlay yang buka/tutup, **Motion** hanya untuk perubahan struktur (elemen muncul/hilang dari daftar, posisi berpindah, isi berganti).

### Per komponen

| Komponen | Mekanisme | Animasi |
|---|---|---|
| **Button** | CSS | Hover: warna 150ms. Press: `scale(0.96)` (nilai baku `/better-ui`; prop `static` mematikannya). Loading: isi jadi transparan + spinner di tengah, lebar tombol dan nama aksesibel tetap |
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
| **Kartu statistik** | Motion + `CountUp` + `SpotlightCard` (adaptasi ReactBits) | Kartu fade + naik 8px dengan stagger 40ms saat halaman pertama dimuat; angka count up 600ms sekali saja |
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

## Implementasi Tahap 3 (2026-11-02)

Komponen ada di `frontend/src/components/ui/`. Penyesuaian terhadap spesifikasi di atas:

- **Badge**: pill + titik sesuai tabel. Pemetaan tone mengikuti dokumen ini (Perlu revisi = `warning`, bukan biru seperti versi lama). Validitas belum ada (`Menunggu validasi`, AI masih menganalisis) = `info` dengan titik berdenyut. Label tidak berubah. Pergantian status: badge baru memudar masuk 180ms tanpa exit, supaya tidak pernah ada dua label status sekaligus (juga untuk pembaca layar).
- **DataTable**: header Ref 3 tanpa ikon sort, karena backend belum mendukung pengurutan (tidak menampilkan affordance palsu). Baris 44px, baris baru fade + naik 6px dengan stagger 20ms (maksimal 10). Refetch: data lama redup 60% + bar progres 2px di atas. < 640px: daftar berpemisah garis (bukan kartu di dalam kartu). Judul = kolom `meta.cardTitle` atau kolom pertama selain `no`; aksi (`meta.stickyRight`) di kanan atas; sembunyikan kolom lewat `meta.cardHidden`.
- **Field**: batas kontrol memakai token baru `--color-border-strong` (≥ 3:1) karena border adalah satu-satunya penanda bentuk input. Opsi `SearchSelect` dirender di portal (anchor) agar tidak terpotong kartu/dialog.
- **Dialog**: transisi sesuai tabel; di HP menjadi bottom sheet dengan pegangan, safe area, tombol footer lebar penuh (aksi utama di atas).
- **PeriodSelector**: satu kontrol tersegmentasi `‹ bulan ›` dengan label "Periode" tetap terlihat.
- **SegmentedControl** (RadioGroup) untuk filter cepat dan **SegmentedTabs** (TabGroup) untuk ganti tampilan; keduanya memakai indikator `layoutId` (Motion `domMax`). Headless UI melepas panel lama seketika, jadi hanya isi baru yang beranimasi (fade + naik 6px).
- **SearchInput**: debounce 250ms, Enter menerapkan langsung, Escape/× mengosongkan dan mengembalikan fokus; ikon × masuk/keluar dengan scale 0.25→1 + blur 4px (spring 0.3s, bounce 0).
- **Skeleton**: `useDelayedSkeleton` (150ms / minimal 300ms), `LoadingSwitch` (skeleton → konten crossfade), `PageSkeleton` untuk fallback rute lazy, dan varian `SkeletonStatCards`, `SkeletonChart`, `SkeletonTable`, `SkeletonCardList`, `SkeletonForm`, `SkeletonProfile`.
- **Avatar**: DiceBear critters dibuat lokal, `@dicebear/core` + `critters.json` di-lazy import dan di-cache per seed. Latar pastel dipilih stabil dari seed. Sudah dipakai di sidebar (40px; 32px saat ciut) dan menu akun header.
- **Motion**: komponen `m.*` ringan masuk bundle awal; fitur `domMax` (animasi + layout/`layoutId`) dimuat async lewat `LazyMotion` (`src/app/motion-features.ts`), tanpa grup chunk manual.
- **ReactBits**: `CountUp`, `AnimatedList`, `FadeContent`, `SpotlightCard` (+ `trackSpotlight`/`SPOTLIGHT_CLASS` untuk `StatCard`). `StatCard` kini punya `icon`, `accent`, `count`, `index` (stagger 40ms); API lama (`label`, `value`, `hint`, `to`) tetap.
