# 02 — Design Tokens

Status: **nilai warna final, tervalidasi kontras di Tahap 1 (2026-11-02).** Satu-satunya tempat nilai ini hidup di kode adalah `frontend/src/styles/tokens.css` (`@theme`). Nama token lama **dipertahankan** supaya komponen tidak perlu diganti. Jika nilai diubah, ukur ulang semua pasangan di tabel "Validasi kontras".

## Warna

Format OKLCH, semua nilai di dalam gamut sRGB (tidak butuh fallback P3).

### Netral (latar abu-abu kebiruan tipis seperti Ref 2/3)

| Token | Nilai final | Pemakaian |
|---|---|---|
| `--color-background` | `oklch(0.975 0.004 160)` | Latar halaman di belakang kartu |
| `--color-surface` | `oklch(1 0 0)` | Kartu, sidebar, dialog |
| `--color-surface-muted` | `oklch(0.965 0.005 160)` | Header tabel, tab segmented, hover baris |
| `--color-text` | `oklch(0.22 0.015 160)` | Teks utama |
| `--color-muted` | `oklch(0.5 0.012 160)` | Label, meta, placeholder. *Dikoreksi dari 0.52* agar tetap ≥ 5:1 di `surface-muted` dan `primary-subtle` |
| `--color-border` | `oklch(0.92 0.006 160)` | Garis kartu dan tabel (dekoratif, 1.26:1; bukan batas satu-satunya untuk input) |

### Brand (hijau Ref 1)

| Token | Nilai final | Pemakaian |
|---|---|---|
| `--color-primary` | `oklch(0.49 0.12 152)` | Tombol utama, link, chip aktif. *Dikoreksi dari `0.53 0.14`*: nilai awal di luar gamut sRGB, gagal di `surface-muted` (4.48), `primary-subtle` (4.33), dan hover `bg-primary/90` (4.05) |
| `--color-primary-foreground` | `oklch(0.99 0 0)` | Teks di atas primary |
| `--color-primary-subtle` | `oklch(0.955 0.033 150)` | Latar badge/ikon hijau, hover item nav. *Dikoreksi dari `0.95 0.04`* (chroma maks. gamut) |
| `--color-nav-active-from` | `oklch(0.78 0.16 148)` | Awal gradien item nav aktif (Ref 1) |
| `--color-nav-active-to` | `oklch(0.9 0.17 125)` | Akhir gradien (lime). Teks di atasnya memakai `--color-text`, bukan putih |
| `--color-focus-ring` | `oklch(0.48 0.12 152)` | Outline `:focus-visible`. *Dikoreksi dari `0.6 0.15`*: nilai awal hanya 1.96:1 terhadap item nav aktif |

### Lapisan

| Token | Nilai | Pemakaian |
|---|---|---|
| `--color-overlay` | `oklch(0.22 0.015 160 / 0.4)` | Scrim di belakang drawer dan dialog |
| `--color-surface-inverse` | `oklch(0.22 0.015 160)` | Latar tooltip |
| `--color-text-inverse` | `oklch(1 0 0)` | Teks tooltip (17.24:1 di atas `surface-inverse`) |

### Status (selalu dengan label teks)

Tiap status punya tiga token: **base** (titik, ikon, teks pesan di atas `surface`), **`-subtle`** (latar badge), **`-strong`** (teks badge di atas `-subtle`).

| Arti di Mumtaz | Base | `-subtle` | `-strong` |
|---|---|---|---|
| Valid / Disetujui (`success`) | `oklch(0.5 0.12 150)` | `oklch(0.96 0.028 150)` | `oklch(0.4 0.09 150)` |
| Perlu revisi / Menunggu (`warning`) | `oklch(0.53 0.11 70)` | `oklch(0.965 0.035 85)` | `oklch(0.42 0.09 65)` |
| Ditolak (`danger`) | `oklch(0.53 0.19 27)` | `oklch(0.96 0.018 25)` | `oklch(0.43 0.15 27)` |
| Info / sedang dianalisis AI (`info`) | `oklch(0.5 0.1 250)` | `oklch(0.96 0.018 250)` | `oklch(0.42 0.09 250)` |
| Netral / Draf | `--color-muted` | `--color-neutral-subtle` `oklch(0.955 0.004 160)` | `--color-muted` |

Koreksi dari nilai lama: `warning` `0.62 0.13 75` → `0.53 0.11 70` (gagal 3.72:1 sebagai teks di surface, 3.33:1 di badge lama); `success`, `danger`, `info` diturunkan sedikit (0.52→0.5, 0.55→0.53, 0.52→0.5) agar badge lama `bg-*/10 text-*` punya margin.

### Aksen pastel kotak ikon (Ref 1)

Pasangan *latar pastel + ikon jenuh*. Hanya untuk kotak ikon kartu statistik dan seri grafik, bukan untuk teks.

| Aksen | Ikon `--color-accent-*` | Latar `--color-accent-*-subtle` |
|---|---|---|
| green | `oklch(0.58 0.14 150)` | `oklch(0.95 0.042 150)` |
| blue | `oklch(0.56 0.13 250)` | `oklch(0.95 0.024 250)` |
| violet | `oklch(0.55 0.16 295)` | `oklch(0.95 0.025 295)` |
| orange | `oklch(0.6 0.14 55)` | `oklch(0.955 0.032 70)` |
| coral | `oklch(0.6 0.16 25)` | `oklch(0.95 0.024 25)` |

### Grafik

Maksimal 2 seri per grafik: seri 1 `primary`, seri 2 `accent-coral` (pola hijau vs coral pada Ref 1). Area di bawah garis memakai gradien seri → transparan.

### Validasi kontras

Diukur dengan `culori` (WCAG 2) dan `apca-w3` (APCA Lc) dari nilai token di atas. Ambang AA: teks 4.5:1, elemen UI/grafik 3:1. Semua pasangan **lulus**.

| Pasangan (teks/elemen → latar) | WCAG | APCA Lc | Ambang |
|---|---|---|---|
| `text` → `surface` / `background` / `surface-muted` | 17.24 / 16.06 / 15.60 | 104 / 99 / 97 | 4.5 |
| `text` → `primary-subtle` | 15.29 | 96 | 4.5 |
| `muted` → `surface` / `background` / `surface-muted` / `primary-subtle` | 5.96 / 5.55 / 5.40 / 5.29 | 80 / 75 / 73 / 72 | 4.5 |
| `primary-foreground` → `primary` | 5.75 | −82 | 4.5 |
| `primary-foreground` → `bg-primary/90` (hover, di atas surface) | 4.67 | −77 | 4.5 |
| `primary` (link) → `surface` / `background` / `surface-muted` / `primary-subtle` | 5.92 / 5.51 / 5.35 / 5.25 | 79 / 74 / 72 / 71 | 4.5 |
| `text` → gradien nav aktif: awal / tengah / akhir | 9.14 / 10.99 / 13.27 | 67 / 76 / 87 | 4.5 |
| `focus-ring` → `surface` / `background` / `surface-muted` | 6.17 / 5.75 / 5.59 | 80 / 76 / 73 | 3 |
| `focus-ring` → `nav-active-from` (bersebelahan terburuk) | 3.27 | 43 | 3 |
| `success` / `warning` / `danger` / `info` → `surface` (teks pesan) | 5.67 / 5.41 / 5.82 / 5.98 | 78 / 77 / 77 / 80 | 4.5 |
| putih → `danger` / `bg-danger/90` (tombol hapus) | 5.82 / 5.02 | −83 / −79 | 4.5 |
| Badge: `success-strong` → `success-subtle` | 7.94 | 83 | 4.5 |
| Badge: `warning-strong` → `warning-subtle` | 7.83 | 82 | 4.5 |
| Badge: `danger-strong` → `danger-subtle` | 7.75 | 80 | 4.5 |
| Badge: `info-strong` → `info-subtle` | 7.52 | 81 | 4.5 |
| Badge: `muted` → `neutral-subtle` | 5.24 | 71 | 4.5 |
| Titik badge: base → `-subtle` (success / warning / danger / info) | 5.10 / 4.89 / 5.15 / 5.33 | 71 / 69 / 69 / 72 | 3 |
| Badge lama `bg-*/10 text-*` (success / warning / danger / info) | 4.94 / 4.73 / 4.96 / 5.20 | 68 / 67 / 66 / 70 | 4.5 |
| Ikon aksen → latar pastel (green / blue / violet / orange / coral) | 3.53 / 4.02 / 4.46 / 3.61 / 3.66 | 58 / 62 / 65 / 59 / 58 | 3 |
| Seri grafik `primary` / `accent-coral` → `surface` | 5.92 / 4.27 | 79 / 69 | 3 |

Catatan: `--color-border` (1.26:1) hanya dekoratif. Input/select di Tahap 3 wajib punya penanda selain border tipis ini (mis. latar berbeda atau token border kontrol ≥ 3:1).

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

Skala final (token Tailwind `--text-*`, sudah membawa line-height, tracking, dan berat):

| Token / class | Nilai |
|---|---|
| `text-page-title` / `text-page-title-mobile` | 22px / 20px, 1.25, −0.02em, 600 |
| `text-stat` / `text-stat-mobile` | 24px / 22px, 1.15, −0.02em, 600 |
| `text-card-title` | 14px, 1.4, 600 |
| `text-body` | 14px, 1.45 (default `body`) |
| `text-body-dense` | 13px, 1.4 (sel tabel padat, meta 13px) |
| `text-meta` | 12px, 1.4 |
| `text-group-label` | 11px, 1.4, 0.08em, 500 (+ class `uppercase`) |

`tabular-nums` aktif otomatis di `table`, `time`, `output`, `data`; nominal/angka statistik di luar elemen itu memakai class `tabular-nums`. Font smoothing (`antialiased`) dipasang sekali di `html`.

## Spacing, radius, shadow

- Spacing tetap berbasis `--spacing: 0.25rem`. Gap antar kartu 12px (mobile) / 16px (desktop). Padding kartu 16px (mobile) / 20px (desktop).
- Tinggi kontrol (button, input, chip): 36px desktop, 32px untuk varian `sm`. Pada `@media (pointer: coarse)` minimal 44px.
- Baris tabel 44px, sidebar item 36px, header aplikasi 64px.
- Radius bertingkat (konsentris): `--radius-sm` 4px, kontrol `--radius-md` 8px, kartu `--radius-lg` 14px, frame konten `--radius-xl` 20px. Elemen di dalam kartu memakai radius kartu dikurangi padding.
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
