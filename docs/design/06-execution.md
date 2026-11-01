# 06 — Prompt Eksekusi

Implementasi UI/UX dikerjakan bertahap di branch `feat/ui-ux-polish`. Tiap tahap **berhenti untuk direview owner** sebelum lanjut. Salin prompt di bawah ke Claude Code satu per satu.

## Pemetaan skill

| Skill | Fokus | Dipakai di tahap |
|---|---|---|
| `/better-colors` | Palet, token semantik, kontras | 1, 5 |
| `/better-typography` | Skala huruf, angka tabular, wrapping, truncation | 1, 5 |
| `/better-layout` | Grouping, alignment, reading order, responsive | 2, 4 |
| `/better-ui` | Radius konsentris, kedalaman permukaan, ikon, hit area, polish | 3, 4 |
| `/better-accessibility` | Keyboard, fokus, ARIA, reduced motion, target sentuh | 5 |
| `/better-interface` | Review gabungan semua aspek di atas | 5 |

## Aturan untuk setiap tahap

- Baca `CLAUDE.md` dan seluruh `docs/design/` sebelum mulai. `docs/design/` adalah spesifikasi visual. Jika ada konflik, `CLAUDE.md` yang menang.
- Laporkan scope perubahan sebelum edit. Setelah edit, jalankan `npm run typecheck`, `npm test`, `npm run lint`, dan `npm run build` dari root, lalu laporkan hasil aktualnya.
- Jangan ubah logika data, kontrak API, atau backend. Jangan menulis atau menghapus data di Neon.
- Dilarang shadcn/ui, MUI, daisyUI, Flowbite, Ant Design, Mantine, GSAP, three.js, dan library chart kedua.
- Semua teks UI dalam Bahasa Indonesia. Status selalu disertai label teks.
- Jika nilai di dokumen terbukti salah (mis. kontras gagal), perbaiki kodenya **dan** tulis nilai finalnya kembali ke `docs/design/`.
- Hapus file yang tidak terpakai di akhir tahap. Commit tanpa trailer Co-Authored-By.

---

## Tahap 1 — Token warna & tipografi

```
/better-colors /better-typography
Kerjakan Tahap 1 di docs/design/06-execution.md.
Implementasikan docs/design/02-tokens.md ke frontend/src/styles/tokens.css: netral, brand hijau (Ref 1), status + pasangan -subtle, aksen pastel, radius konsentris, shadow, dan token motion. Install @fontsource-variable/inter, pasang lewat --font-sans, aktifkan tabular-nums untuk angka. Terapkan skala tipografi compact.
Validasi kontras semua pasangan teks/latar (WCAG AA: 4.5:1 teks, 3:1 elemen UI), termasuk teks badge di atas latar -subtle dan teks di atas gradien nav aktif. Koreksi nilai OKLCH yang gagal dan tulis nilai finalnya ke 02-tokens.md.
Pertahankan nama token lama agar komponen tidak rusak. Belum mengubah layout atau komponen.
Jalankan typecheck, test, lint, build; laporkan hasil, lalu berhenti untuk review.
```

## Tahap 2 — App shell & layout

```
/better-layout
Kerjakan Tahap 2 di docs/design/06-execution.md sesuai docs/design/03-layout.md.
Refactor frontend/src/components/layout/app-shell.tsx dan navigation.ts:
- sidebar 240px berkelompok (gaya Ref 2) dengan label grup per role, item aktif bergradien hijau, collapse ke 64px (+ tooltip), status collapse di localStorage;
- submenu Master Data (Tutor, Siswa, Orang Tua, Mata Pelajaran) dengan garis pandu (gaya Ref 3), otomatis terbuka saat rute aktif;
- header: judul halaman, pencarian, avatar (placeholder dulu, avatar asli di Tahap 3), slot aksi utama;
- < 1024px: sidebar menjadi drawer Headless UI Dialog.
Pasang MotionConfig reducedMotion="user" + LazyMotion di providers (install motion).
Verifikasi tanpa scroll horizontal di 360px, 768px, 1440px. Test navigasi yang ada harus tetap lulus; tambah test untuk submenu dan drawer.
Jalankan typecheck, test, lint, build; laporkan, lalu berhenti untuk review.
```

## Tahap 3 — Komponen, animasi, skeleton, badge, avatar

```
/better-ui
Kerjakan Tahap 3 di docs/design/06-execution.md sesuai docs/design/04-components.md.
1. Restyle komponen di frontend/src/components/ui (button, badge, data-table, dialog, field, feedback, period-selector, layout-primitives) ke gaya compact.
2. Badge status: pill + titik status sesuai spesifikasi "Badge status"; label tetap dari konstanta yang ada di badge.tsx; titik "Menganalisis" berdenyut.
3. Buat komponen baru: StatCard, SegmentedTabs, SearchInput, Skeleton (+ varian SkeletonStatCards, SkeletonChart, SkeletonTable, SkeletonCardList, SkeletonForm, SkeletonProfile), Avatar.
4. Animasi persis mengikuti tabel "Per komponen": CSS untuk micro-interaction, transisi Headless UI untuk overlay, Motion untuk tab/filter/daftar/badge/stat. Hanya transform & opacity. Hormati reduced motion.
5. Skeleton: delay 150ms, tampil minimal 300ms, refetch memakai data lama + bar progres (bukan skeleton), aria-busy + teks sr-only.
6. Avatar: install @dicebear/core dan @dicebear/styles, lazy import critters.json, seed = ID internal (BUKAN ID Akses Orang Tua), generate lokal tanpa request ke api.dicebear.com.
7. DataTable < 640px menjadi daftar kartu; Dialog < 640px menjadi bottom sheet.
Tambahkan test untuk komponen baru (termasuk seed avatar dan delay skeleton dengan fake timers).
Jalankan typecheck, test, lint, build; laporkan ukuran bundle sebelum/sesudah, lalu berhenti untuk review.
```

## Tahap 4 — Halaman per role

```
/better-layout /better-ui
Kerjakan Tahap 4 di docs/design/06-execution.md sesuai docs/design/05-pages.md.
Terapkan susunan visual ke semua halaman Admin (Dashboard, Data Absensi, Penagihan, Honor Tutor, Master Data), Tutor (Dashboard, Form Absensi, Riwayat, Honor Saya, Profil), Orang Tua (Progress Anak, Riwayat Pembelajaran), dan Login.
Setiap halaman wajib punya skeleton yang sesuai bentuk, empty state, error state dengan tombol coba lagi, dan state pencarian kosong dengan reset filter.
Halaman Tutor & Orang Tua mobile-first (target sentuh ≥ 44px, form satu kolom, tombol submit sticky di HP).
Jangan ubah logika data, query key, atau kontrak API. Semua test yang ada harus tetap lulus.
Jalankan typecheck, test, lint, build; laporkan, lalu berhenti untuk review.
```

## Tahap 5 — Audit & polish akhir

```
/better-accessibility /better-interface /better-colors /better-typography
Kerjakan Tahap 5 di docs/design/06-execution.md: audit seluruh frontend terhadap docs/design/.
Periksa: kontras (termasuk badge & nav aktif), navigasi keyboard dan urutan fokus, focus-visible, dialog/drawer mengembalikan fokus, target sentuh ≥ 44px di perangkat sentuh, reduced motion untuk semua animasi dan shimmer, label Bahasa Indonesia, angka tabular, truncation teks panjang (nama murid/sekolah), tidak ada hex/font hardcode di luar tokens.css, dan tidak ada scroll horizontal di 360px.
Perbaiki semua temuan, catat yang sengaja tidak diperbaiki beserta alasannya.
Jalankan typecheck, test, lint, build; laporkan hasil dan ukuran bundle akhir, lalu berhenti untuk review.
```
