# 02 — Design Tokens

Status: **arah disetujui owner; nilai final menunggu validasi kontras Tahap 1.** Nilai di bawah ini adalah titik awal dari Ref 1 (warna) dan Ref 3 (tipografi). Kontras **wajib** divalidasi (skill `/better-colors`) sebelum dikunci. Satu-satunya tempat nilai ini hidup di kode adalah `frontend/src/styles/tokens.css` (`@theme`). Nama token yang sudah ada **dipertahankan** supaya komponen tidak perlu diganti.

## Warna

Format OKLCH, mengikuti `tokens.css` saat ini.

### Netral (latar abu-abu kebiruan tipis seperti Ref 2/3)

| Token | Nilai awal | Pemakaian |
|---|---|---|
| `--color-background` | `oklch(0.975 0.004 160)` | Latar halaman di belakang kartu |
| `--color-surface` | `oklch(1 0 0)` | Kartu, sidebar, dialog |
| `--color-surface-muted` | `oklch(0.965 0.005 160)` | Header tabel, tab segmented, hover baris |
| `--color-text` | `oklch(0.22 0.015 160)` | Teks utama |
| `--color-muted` | `oklch(0.52 0.012 160)` | Label, meta, placeholder (min. 4.5:1 di surface) |
| `--color-border` | `oklch(0.92 0.006 160)` | Garis kartu dan tabel |

### Brand (hijau Ref 1)

| Token | Nilai awal | Pemakaian |
|---|---|---|
| `--color-primary` | `oklch(0.53 0.14 152)` | Tombol utama, link, chip aktif. Teks putih harus ≥ 4.5:1 |
| `--color-primary-foreground` | `oklch(0.99 0 0)` | Teks di atas primary |
| `--color-primary-subtle` | `oklch(0.95 0.04 150)` | Latar badge/ikon hijau, hover item nav |
| `--color-nav-active-from` | `oklch(0.78 0.16 148)` | Awal gradien item nav aktif (Ref 1) |
| `--color-nav-active-to` | `oklch(0.90 0.17 125)` | Akhir gradien (lime). Teks di atasnya memakai `--color-text`, bukan putih |
| `--color-focus-ring` | `oklch(0.6 0.15 152)` | Outline `:focus-visible` |

### Status (selalu dengan label teks)

| Token | Arti di Mumtaz |
|---|---|
| `--color-success` | Valid / Disetujui |
| `--color-warning` | Perlu revisi / Menunggu |
| `--color-danger` | Ditolak |
| `--color-info` | Info netral, sedang dianalisis AI |

Tiap status juga punya pasangan `-subtle` (latar badge) dengan kontras teks ≥ 4.5:1.

### Aksen pastel kotak ikon (Ref 1)

`--color-accent-green`, `--color-accent-blue`, `--color-accent-violet`, `--color-accent-orange`, `--color-accent-coral`, masing-masing berupa pasangan *latar pastel + ikon jenuh*. Hanya untuk kotak ikon kartu statistik dan seri grafik, bukan untuk teks.

### Grafik

Maksimal 2 seri per grafik: seri 1 `primary`, seri 2 `accent-coral` (pola hijau vs coral pada Ref 1). Area di bawah garis memakai gradien seri → transparan.

## Tipografi (Ref 3)

- Font: **Inter Variable**, self-host via `@fontsource-variable/inter`. Tidak memakai Google Fonts CDN.
- Fallback: system stack yang sudah ada.
- Angka di tabel, kartu statistik, dan nominal Rupiah: `font-variant-numeric: tabular-nums`.

Skala compact (keputusan owner):

| Peran | Ukuran / line-height | Berat | Contoh |
|---|---|---|---|
| Judul halaman (header) | 22px / 1.25 (mobile 20px), tracking -0.02em | 600 | "Data Absensi" |
| Judul kartu | 14px / 1.4 | 600 | "Sesi per bulan" |
| Angka statistik | 24px / 1.15 (mobile 22px), tracking -0.02em | 600 | "Rp4.250.000" |
| Body / sel tabel | 14px / 1.45 (sel tabel padat 13px) | 400–500 | |
| Meta / subjudul | 12–13px / 1.4 | 400, `text-muted` | "Oktober 2026" |
| Label grup sidebar | 11px, uppercase, tracking 0.08em | 500, `text-muted` | "OPERASIONAL" |

Input di mobile tetap 16px agar iOS tidak auto-zoom.

Skala final ditetapkan lewat skill `/better-typography`.

## Spacing, radius, shadow

- Spacing tetap berbasis `--spacing: 0.25rem`. Gap antar kartu 12px (mobile) / 16px (desktop). Padding kartu 16px (mobile) / 20px (desktop).
- Tinggi kontrol (button, input, chip): 36px desktop, 32px untuk varian `sm`. Pada `@media (pointer: coarse)` minimal 44px.
- Baris tabel 44px, sidebar item 36px, header aplikasi 64px.
- Radius bertingkat (konsentris): kontrol `--radius-md` 8px, kartu `--radius-lg` 14px, frame konten `--radius-xl` 20px. Elemen di dalam kartu memakai radius kartu dikurangi padding.
- Shadow: sangat tipis. `--shadow-sm` untuk kartu (border + shadow 1px), `--shadow-md` untuk dropdown/popover, `--shadow-lg` untuk dialog.

## Motion

| Token | Nilai | Pemakaian |
|---|---|---|
| `--duration-fast` | 150ms | Hover, warna, chip |
| `--duration-base` | 200ms | Dropdown, tooltip, dialog keluar |
| `--duration-slow` | 300ms | Dialog masuk, drawer mobile, ganti halaman |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Elemen masuk |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | Elemen keluar |
| Spring (Motion) | `{ type: 'spring', stiffness: 400, damping: 32 }` | Indikator tab, layout daftar |

Saat `prefers-reduced-motion: reduce`, animasi gerak diganti fade instan (lihat `04-components.md`).
