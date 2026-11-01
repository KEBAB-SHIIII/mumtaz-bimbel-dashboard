# Dependencies & UI Library Plan

Dokumen ini adalah daftar dependency yang disepakati untuk baseline MVP dengan tiga role (Admin, Tutor, Orang Tua). Coding agent harus memeriksa `package.json` sebelum install, memakai versi stable yang kompatibel, memperbarui lockfile, dan tidak menambah dependency di luar daftar tanpa alasan serta persetujuan owner.

## 1. Keputusan UI utama

**Gunakan Tailwind CSS v4 + Headless UI + komponen internal berbasis Tailwind. Jangan gunakan shadcn/ui.**

Alasan:

- Tailwind CSS v4 menyediakan utility-first styling dan plugin Vite resmi tanpa runtime styling framework.
- Headless UI menyediakan perilaku dan accessibility untuk komponen interaktif tanpa memaksakan style visual, jadi tampilan bisa dibuat modern, minimal, dan konsisten dengan design guidelines.
- Komponen internal tetap tipis dan hanya dibuat untuk pola yang benar-benar dipakai dalam MVP.
- `lucide-react` menyediakan ikon SVG outline yang tree-shakable.

Headless UI bukan komponen yang sudah diberi tema visual. Agent harus memberi styling melalui Tailwind dan design tokens. Jangan berasumsi memasang Headless UI otomatis menghasilkan tampilan seperti Dribbble.

## 2. Frontend dependencies

### Runtime dependencies — dibutuhkan

| Package | Fungsi | Aturan penggunaan |
|---|---|---|
| `react`, `react-dom` | UI library | React 19.x stable yang kompatibel dengan Vite dan dependency lain; gunakan versi stable yang kompatibel dan tercatat pada lockfile, jangan mengasumsikan nomor versi terbaru dari dokumen statis. |
| `react-router` (React Router v7) | Routing SPA dalam Declarative Mode untuk Vite SPA. Ikuti import dari dokumentasi v7; jangan install `react-router-dom` terpisah. | Dipakai untuk route publik dan route yang dilindungi berdasarkan role. |
| `axios` | HTTP client browser → Express | Gunakan satu `axios.create()` di `src/lib/api-client.ts`; dilarang request langsung dari komponen. |
| `@tanstack/react-query` | Server state, caching, retry, mutation | Semua query/mutation memanggil feature API functions yang menggunakan Axios. |
| `tailwindcss`, `@tailwindcss/vite` | Styling dan integrasi Tailwind v4 ke Vite | Pakai plugin resmi Vite; stylesheet utama memuat `@import "tailwindcss";`. |
| `@headlessui/react` | Dialog, Menu, Listbox/Combobox, Popover, Tabs, Switch | Gunakan hanya komponen interaktif yang dibutuhkan; styling melalui Tailwind. |
| `lucide-react` | Ikon | Impor ikon spesifik, bukan set ikon tambahan. |
| `recharts` | Grafik dashboard | Hanya grafik yang mendukung keputusan operasional; jangan tambah library chart kedua. |
| `react-hook-form`, `zod`, `@hookform/resolvers` | Form dan validasi | Gunakan untuk form yang memiliki validasi; Zod schema API tetap didefinisikan di shared contracts bila lintas workspace. |
| `@tanstack/react-table` | Sorting/filtering/pagination tabel | Gunakan untuk tabel absensi/master data yang memerlukan interaksi; elemen markup dan styling tetap buatan aplikasi. |
| `motion` | Animasi (layout, `AnimatePresence`, `layoutId`) | Satu-satunya library animasi. Impor dari `motion/react`, muat lewat `LazyMotion` + `domAnimation` + komponen `m.*`, bungkus app dengan `MotionConfig reducedMotion="user"`. Overlay (Dialog/Menu/Listbox/Popover) cukup memakai transisi bawaan Headless UI. Aturan detail: `docs/design/04-components.md`. |
| `@dicebear/core`, `@dicebear/styles` | Avatar otomatis gaya critters (CC0) | Generate SVG lokal, tanpa request ke API DiceBear. Impor hanya `@dicebear/styles/critters.json` secara lazy. Seed = ID internal akun/murid; dilarang memakai ID Akses Orang Tua atau data rahasia. |
| `@fontsource-variable/inter` | Font Inter Variable (keputusan tim, `docs/design/02-tokens.md`) | Self-host; tidak memakai CDN Google Fonts. Font family hanya dirujuk lewat token `--font-sans`. |

### Dev dependencies — dibutuhkan

| Package | Fungsi |
|---|---|
| `vite`, `@vitejs/plugin-react` | Dev server dan build frontend |
| `typescript` | Type checking strict |
| `vitest` | Test runner |
| `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom` | Test behavior komponen di DOM simulasi |
| `eslint`, plugin/config TypeScript dan React yang kompatibel | Lint source |
| `prettier`, `prettier-plugin-tailwindcss` | Formatting konsisten dan pengurutan class Tailwind; boleh dipasang bila repo memilih Prettier sebagai formatter |

### Opsional — pasang hanya jika memang diperlukan

| Package | Kapan dipakai |
|---|---|
| `sonner` | Jika UI perlu toast untuk hasil background/action. Gunakan satu sistem notifikasi saja; inline feedback tetap lebih baik untuk error yang perlu dibaca sebelum lanjut. |
| `clsx` | Membuat conditional class lebih mudah bila class logic mulai berulang. Tidak wajib untuk implementasi sederhana. |
| Font package | Sudah diputuskan: `@fontsource-variable/inter` (lihat runtime dependencies). Jangan menambah font kedua. |

Jangan menambahkan global state library seperti Redux/Zustand untuk MVP kecuali kebutuhan lintas halaman yang nyata muncul. TanStack Query untuk server state dan state lokal React biasanya cukup.

## 3. Backend dependencies

### Runtime dependencies — baseline

| Package | Fungsi | Aturan penggunaan |
|---|---|---|
| `express` | REST API | Gunakan Express 5 dan routing modular. |
| `zod` | Validasi body/query/params, environment, dan payload integrasi | Validasi backend otoritatif; share schemas melalui `packages/contracts/` bila cocok. |
| `drizzle-orm` | ORM dan query PostgreSQL | Schema/domain contract mengikuti `14-ERD-AND-DATA-DICTIONARY.md`. |
| `pg` | PostgreSQL pool dan transaksi | Gunakan pool yang dikonfigurasi untuk Neon. |
| `express-session` | Session middleware server-side | Opaque cookie browser; regenerasi session ID setelah login. |
| `connect-pg-simple` | PostgreSQL-backed session store | Gunakan tabel `app_sessions` dengan schema yang kompatibel dengan library; buat melalui migration/setup yang terdokumentasi. Di production jangan mengandalkan auto-create yang tidak dimigrasikan dan jangan gunakan Express `MemoryStore`. |
| `argon2` | Hash password Admin/Tutor | Utamakan Argon2id dengan konfigurasi aman. |
| `express-rate-limit` | Membatasi percobaan login dan akses kode Parent | Gunakan limiter terpisah yang sesuai untuk login dan akses terproteksi. |
| `helmet` | Security headers | Sesuaikan CSP/security headers untuk deployment. |
| `cors` | CORS allowlist | Izinkan hanya origin frontend yang dikonfigurasi, dengan credentials bila diperlukan. |
| `googleapis` | Google Sheets API untuk ekspor laporan bulanan on-demand | Hanya backend; tidak dipanggil saat Tutor submit. |
| `@google/genai` | Gemini provider untuk klasifikasi anomaly | Hanya backend; gunakan adapter/fake detector untuk test offline. |
| `decimal.js` | Aritmetika uang presisi | Gunakan untuk honor, jangan hitung nominal finansial dengan floating point biasa. |
| `dotenv` | Memuat environment lokal | Production secrets disediakan environment/platform, bukan file committed. |

### Optional runtime dependencies — hanya jika ada kebutuhan/keputusan baru

| Package | Kapan dipakai |
|---|---|
| `csv-parse` | Hanya jika nanti dibuat fitur parsing CSV yang disetujui. Bukan dependency runtime baseline; `attendance-sample.csv` adalah fixture, bukan sumber import. |
| `pdfkit` | Hanya jika owner menyetujui ekspor PDF sebagai scope tambahan. Bukan bagian baseline. |

### Dev dependencies — dibutuhkan

| Package | Fungsi |
|---|---|
| `tsx` | Menjalankan TypeScript saat development |
| `drizzle-kit` | Generate dan menjalankan migration Drizzle |
| `vitest` | Unit/integration test |
| `supertest` | Pengujian HTTP Express |
| `typescript` | Type checking strict |
| `@types/node`, `@types/express`, `@types/express-session`, `@types/connect-pg-simple`, `@types/cors`, `@types/pg`, `@types/supertest` | Tipe yang diperlukan untuk TypeScript/test; jangan pasang `@types/*` bila package sudah menyertakan types. |
| `@electric-sql/pglite` | **Ditambahkan Phase 03.** PostgreSQL asli in-process (WASM) untuk integration/API test offline: migration Drizzle, CHECK/exclusion constraint, transaksi, dan session store `connect-pg-simple` yang sama dengan Neon diuji tanpa credential live. Dev-only; tidak dipakai runtime. |
| `eslint` dan konfigurasi TypeScript/Node yang kompatibel | Lint source |
| `prettier` | Formatting konsisten bila repo memilih Prettier |

## 4. Root / workspace tooling

- Node.js 22+.
- npm workspaces; satu `package-lock.json` yang di-commit.
- TypeScript strict untuk frontend, backend, dan shared contracts.
- Shared Zod schemas/types disimpan di `packages/contracts/` agar API frontend-backend tidak divergen.
- Root scripts untuk `dev`, `build`, `typecheck`, `lint`, dan `test` bila workspace memungkinkan.
- Jangan membuat workspace `ai/` berbasis Python. Integrasi AI dilakukan dari backend TypeScript melalui `@google/genai`.

## 5. Setup Tailwind CSS v4 dengan Vite

Ikuti dokumentasi resmi terbaru: https://tailwindcss.com/docs/installation/using-vite

Dependency utama:

```bash
npm install tailwindcss @tailwindcss/vite
```

Pada `vite.config.ts`, tambahkan plugin `tailwindcss()` dari `@tailwindcss/vite`. Pada CSS utama gunakan:

```css
@import "tailwindcss";
```

Jangan mengikuti tutorial Tailwind v3 lama secara tidak sadar: v4 menggunakan plugin Vite resmi dan import CSS tersebut. Tailwind v4 menyasar browser modern (Safari 16.4+, Chrome 111+, Firefox 128+); jika proyek harus mendukung browser lama, konfirmasi kebutuhan sebelum memilih v3.4.

## 6. Strategi komponen UI

### Gunakan Headless UI untuk

- Dialog/confirmation modal.
- Menu/dropdown yang membutuhkan keyboard behavior.
- Listbox/Combobox bila native select tidak cukup.
- Popover, tabs, dan switch bila benar-benar dibutuhkan.

### Buat sendiri dengan Tailwind untuk

- Button, Input, Label, Card, Badge, StatusBadge.
- PageHeader, Breadcrumb, Sidebar, Topbar.
- DataTable styling, KPI summary, filter bar, EmptyState, LoadingState, ErrorState.
- Panel ringkasan, review status dan inline alert.

Gunakan native HTML semantics untuk link, form field, checkbox, table, dan button kecuali ada kebutuhan interaksi khusus. Semua custom component harus punya props sederhana, focus-visible state, disabled/loading state bila relevan, dan aksesibilitas yang memadai.

### Jangan digunakan di repo ini

- `shadcn/ui` dan shadcn CLI.
- Flowbite React, daisyUI, MUI, Ant Design, Mantine, atau library komponen besar lain tanpa persetujuan owner.
- Lebih dari satu UI primitive library atau charting library.
- Icon packs tambahan di luar Lucide React tanpa kebutuhan yang terdokumentasi.

Flowbite React memang memiliki komponen Tailwind yang siap pakai, tetapi baseline ini memilih Headless UI agar styling tetap dikontrol oleh design system ringan milik aplikasi dan tidak menghasilkan campuran visual dari dua sistem komponen.

## 7. Design direction sementara — referensi final menunggu tim

> **Update:** referensi tim sudah disetujui. Arah visual final ada di [`docs/design/`](design/README.md) dan menggantikan bagian ini. Komponen salin-tempel dari ReactBits hanya boleh diadaptasi bila dependensinya sebatas `motion` atau CSS murni (tanpa GSAP, three.js, ogl).

Tim akan menetapkan palet warna, typography, logo, dan referensi dashboard spesifik pada diskusi berikutnya. Bagian ini tidak menetapkan palette atau font final. Sampai referensi diterima, gunakan dashboard minimal/modern dengan token semantik netral dan mudah diganti.

- Gunakan CSS variables/semantic tokens terpusat untuk surface, text, border, accent, status, typography, spacing, radius dan shadow.
- Jangan menyebarkan hex code atau font family ke banyak komponen.
- Pertahankan pola dashboard SaaS yang jelas: sidebar role-based, header halaman, filter periode, tabel yang mudah dipindai, status dengan label teks, empty/loading/error states.
- Referensi Dribbble yang disampaikan tim nanti menjadi input visual; jangan mengambil aset, identitas merek, atau menyalin karya spesifik secara pixel-perfect.
- Semua gaya harus tetap responsive, keyboard-accessible dan menjaga kontras.

Inspirasi pencarian umum (bukan keputusan visual final):

- [Minimal admin dashboard — Dribbble](https://dribbble.com/search/minimal-admin-dashboard)
- [SaaS dashboard — Dribbble](https://dribbble.com/search/saas-dashboard)
- [Dashboard data table — Dribbble](https://dribbble.com/search/dashboard-data-table)
- [Headless UI](https://headlessui.com/)
- [Tailwind CSS](https://tailwindcss.com/docs/installation/using-vite)

## 8. Aturan penggunaan dependency oleh coding agent

1. Periksa package yang sudah terinstal sebelum menambahkan dependency.
2. Jangan install package untuk masalah yang dapat ditangani dengan fitur bawaan React, CSS, atau API native yang jelas.
3. Hindari duplicate responsibilities (dua toast system, dua chart library, dua form library, dua HTTP client).
4. Tambahkan dependency hanya jika dipakai oleh fitur MVP dan update dokumen ini bila ada keputusan baru.
5. Jangan mengklaim ukuran bundle tanpa mengukurnya. Jalankan build dan tinjau bundle jika performa bundle menjadi concern.
6. Kunci versi melalui `package-lock.json`; gunakan versi stable kompatibel, bukan `latest` yang tak tercatat di lockfile.

## 9. Referensi resmi dependency

- React versions: https://react.dev/versions
- Vite: https://vite.dev/guide/
- Tailwind CSS + Vite: https://tailwindcss.com/docs/installation/using-vite
- Headless UI React: https://headlessui.com/
- Lucide React: https://lucide.dev/guide/react/
- Axios: https://axios-http.com/docs/intro
- TanStack Query: https://tanstack.com/query/latest/docs/framework/react/quick-start
- TanStack Table: https://tanstack.com/table/latest/docs/framework/react/quick-start
- React Router modes: https://reactrouter.com/start/modes
- React Hook Form: https://react-hook-form.com/
- Zod: https://zod.dev/
- Flowbite React (alternative not selected): https://flowbite-react.com/
