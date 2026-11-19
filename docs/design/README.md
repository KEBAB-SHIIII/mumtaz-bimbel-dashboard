# Design System — Mumtaz Bimbel

Folder ini adalah spesifikasi **visual** dashboard: tampilannya seperti apa dan diambil dari referensi mana. Fungsi halaman (apa isi tiap tab, siapa boleh apa) tetap di `docs/07-DESIGN-GUIDELINES.md` dan `docs/15-DASHBOARD-TABS.md`; jangan diduplikasi di sini.

## Arah desain (keputusan owner)

Modern dan rapi setara dashboard kurasi Dribbble/Awwwards, tetapi tetap alat kerja harian: **compact, mudah dipindai, cepat dibaca.**

- **Compact:** kepadatan informasi tinggi tanpa terasa sesak. Kontrol 36px di desktop, baris tabel 44px, padding kartu 16–20px, gap 16px. Di perangkat sentuh (`pointer: coarse`) target tetap ≥ 44px.
- **Mudah dilihat:** hierarki lewat ukuran dan berat font serta ruang kosong, bukan lewat warna atau kotak berlapis. Satu fokus utama per kartu. Angka penting paling menonjol.
- **Polish:** radius konsentris, border 1px + shadow sangat tipis, ikon yang selaras optik, animasi singkat (≤ 300ms) yang memberi makna (masuk/keluar, perubahan daftar, posisi tab aktif). Tidak ada efek dekoratif yang mengganggu keterbacaan: tanpa parallax, partikel, glassmorphism berat, atau kursor kustom.
- **Warna hemat:** latar netral, hijau brand hanya untuk aksi utama, state aktif, dan data utama. Warna pastel hanya di kotak ikon dan grafik.

## Urutan prioritas

Jika ada konflik, yang lebih atas menang:

1. `CLAUDE.md` (aturan arsitektur, larangan library, keamanan role).
2. `docs/design/*` (keputusan visual yang sudah disetujui owner).
3. Screenshot di `docs/design/references/` (inspirasi, bukan spesifikasi pixel).

## Isi

| File | Isi |
|---|---|
| [01-references.md](01-references.md) | Tiga referensi dan matriks mixing: bagian mana diambil dari mana |
| [02-tokens.md](02-tokens.md) | Warna, tipografi, spacing, radius, shadow, motion → `frontend/src/styles/tokens.css` |
| [03-layout.md](03-layout.md) | App shell (sidebar + header), grid, breakpoint, perilaku mobile per role |
| [04-components.md](04-components.md) | Inventaris komponen, state, animasi, avatar |
| [05-pages.md](05-pages.md) | Komposisi tiap halaman per role |
| [06-execution.md](06-execution.md) | Prompt eksekusi per tahap + pemetaan skill `better-*` |
| `references/` | Screenshot referensi asli dari tim |

## Aturan yang tidak boleh dilanggar

- Stack UI: Tailwind CSS v4 + Headless UI + Lucide + komponen internal tipis. **Dilarang** shadcn/ui, Flowbite, daisyUI, MUI, Ant Design, Mantine.
- Animasi: `motion` (Motion for React) + transisi bawaan Headless UI. Tidak ada library animasi kedua (GSAP, react-spring, three.js).
- Grafik: hanya `recharts` (sudah terpasang).
- Avatar: DiceBear **critters** digenerate lokal di browser. Tidak memanggil API eksternal dan tidak pernah memakai ID Akses Orang Tua sebagai seed.
- Semua teks UI dalam Bahasa Indonesia.
- Status tidak boleh hanya dibedakan lewat warna; selalu ada label teks.
- Komponen hanya memakai token (`bg-surface`, `text-muted`), bukan hex atau nama font langsung.
- Setiap animasi menghormati `prefers-reduced-motion`.
- Referensi adalah inspirasi. Jangan menyalin logo, aset, ilustrasi, atau konten dari karya aslinya.
