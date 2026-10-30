# Mumtaz Bimbel — Project Context & Product Specification

**Last updated:** 27 Oktober 2026  
**Purpose:** Dokumen konteks utama untuk percakapan, brainstorming, perencanaan produk, implementasi, dan evaluasi aplikasi Bimbel Mumtaz Sampit.  
**Status:** Baseline MVP; detail yang belum diputuskan ditandai secara eksplisit.

> **Aturan sumber kebenaran:** ikuti keputusan owner terbaru di dokumen ini. Jangan membuat asumsi baru untuk mengganti keputusan yang sudah disepakati. Jika detail belum diputuskan, jelaskan bahwa itu masih terbuka dan usulkan opsi beserta trade-off-nya. Jika dokumentasi lama bertentangan, utamakan keputusan terbaru di sini lalu sarankan sinkronisasi dokumen teknis terkait.

---

## 1. Ringkasan proyek

Bimbel Mumtaz Sampit membutuhkan aplikasi untuk mengganti pencatatan sesi les yang sebelumnya dilakukan melalui Google Form dan Google Sheets, kemudian direkap manual oleh admin. Sistem baru memindahkan input dan kegiatan operasional ke dashboard aplikasi yang terhubung ke database.

Aplikasi memiliki tiga role:

1. **Admin** — mengelola master data, memeriksa dan memverifikasi catatan sesi, melihat rekap, menghitung estimasi honor, memeriksa temuan anomali, serta mengekspor laporan bulanan ke Google Sheets.
2. **Tutor** — login, mengirim form pertemuan setelah sesi les, melihat riwayat mengajar dan estimasi honor miliknya.
3. **Orang Tua/Wali** — login dengan satu ID Akses Orang Tua, lalu melihat riwayat dan materi pembelajaran anak yang terhubung dengan akun tersebut.

Tujuan MVP adalah mengurangi input berulang, membuat rekap bulanan lebih mudah, memberikan alur review manual yang jelas, serta menyediakan dasar data untuk riwayat pembelajaran anak.

Sistem harus mengurangi pekerjaan manual/repetitif: isi form sesingkat mungkin, auto-fill data tutor/penugasan, validasi dan normalisasi otomatis, filter bulanan yang jelas, review anomali terpusat, dan ekspor bulanan satu tindakan dengan konfirmasi yang mudah dipahami.

## Tiga route utama dashboard (frontend)

Aplikasi memiliki tiga entry route utama berbasis role:

- `/admin` — dashboard Admin dengan Dashboard, Data Absensi, Rekap, Honor Tutor, dan Master Data.
- `/tutor` — dashboard Tutor dengan Dashboard, Form Absensi, Riwayat Mengajar, Honor Saya, dan Profil.
- `/orang-tua-murid` — dashboard Orang Tua/Wali untuk melihat progres dan riwayat pembelajaran anak yang terhubung.

Login dapat menjadi halaman/state sebelum route role dibuka. Setelah login, arahkan pengguna ke route sesuai role. Tab dapat memakai nested route atau navigasi internal, tetapi tidak perlu membuat aplikasi terpisah per tab.

**Penting:** tiga route ini adalah route halaman frontend, bukan berarti REST API hanya memiliki tiga endpoint. Backend tetap memerlukan endpoint internal `/api/v1/...` untuk autentikasi, CRUD, review, rekap, anomaly, dan ekspor. Kelompokkan endpoint berdasarkan domain, gunakan satu backend, dan satu database.

## 2. Teknologi yang sudah dipilih

### Frontend

- React 19.x + TypeScript strict.
- Vite.
- Tailwind CSS v4.
- React Router.
- Axios melalui satu instance terpusat; **jangan memakai native `fetch` untuk request API aplikasi**.
- TanStack Query untuk server state jika sesuai kebutuhan.
- React Hook Form + Zod untuk form dan validasi UX.
- TanStack Table/Recharts jika memang mendukung kebutuhan tabel/grafik.
- Headless UI, komponen internal, dan `lucide-react`.
- **Jangan menggunakan shadcn/ui** tanpa persetujuan owner.

### Backend dan data

- Node.js 22+; Express 5 + TypeScript.
- Zod untuk validasi server-side.
- Neon PostgreSQL.
- Drizzle ORM + drizzle-kit + `pg`.
- Google Sheets API melalui `googleapis`, hanya untuk ekspor atas permintaan admin.
- Integrasi AI anomaly lewat adapter service. `@google/genai`/Gemini adalah pilihan provider yang direncanakan jika tim tidak memakai model lain. Jangan berpura-pura memanggil layanan live saat credential belum disiapkan.
- Testing: Vitest, Supertest, React Testing Library sesuai kebutuhan.

Semua integrasi eksternal harus dipisahkan dari aturan bisnis melalui service/adapter. Jangan menaruh kode Google atau AI langsung di komponen React atau controller besar.

## 3. Keputusan produk yang sudah disepakati

- Neon PostgreSQL adalah **source of truth** untuk data operasional aplikasi.
- Tutor mengisi form di Dashboard Tutor; tidak ada lagi input rutin lewat Google Form.
- Form dikirim ke backend Express, divalidasi, lalu disimpan ke Neon.
- Setiap catatan sesi baru berstatus `pending`.
- Admin melakukan review manual. Hanya sesi `approved` yang masuk perhitungan estimasi honor.
- Data sesi yang sama dipakai oleh Riwayat Mengajar Tutor, Data Absensi Admin, Rekap, Honor, dan Progress Anak melalui query API yang berbeda. Jangan membuat tabel terpisah hanya karena masing-masing dashboard memiliki tampilan sendiri.
- Google Sheets **bukan** database utama, bukan tujuan submit tutor, dan tidak disinkronkan otomatis setiap kali tutor submit.
- Admin dapat memicu ekspor laporan absensi per bulan langsung ke Google Sheets menggunakan Google Sheets API.
- Ekspor standar berisi delapan kolom mentah yang digunakan UMKM: `no`, `nama tutor`, `nama murid`, `kelas`, `asal sekolah`, `mata pelajaran`, `tanggal les`, `durasi les`.
- Ekspor standar hanya mengekspor kolom tersebut; status review, materi pembelajaran, catatan anomali, honor, UUID internal, dan timestamp teknis tidak ditambahkan ke format standar.
- **Keputusan ekspor:** semua sesi pada periode terpilih diekspor tanpa memfilter status review, termasuk `pending`, `approved`, `revision_requested`, dan `rejected`. Delapan kolom mentah tetap dipertahankan tanpa kolom status.
- Ekspor menggunakan `lesson_date` untuk menentukan bulan laporan, bukan waktu submit atau waktu verifikasi.
- Tab tujuan Google Sheets dibuat deterministik per bulan, misalnya `Absensi 2026-10`. Ekspor ulang bulan yang sama memperbarui isi tab tersebut, bukan melakukan append berulang yang menggandakan baris.
- Kolom `no` hanya nomor urut tampilan/ekspor; setiap record punya UUID internal.
- Data honor resmi dari UMKM belum tersedia. Untuk development gunakan **Rp50.000 per sesi** sebagai data dummy; nominal dari tarif demo ditandai badge kecil "Tarif demo" di halaman Honor (D-20), bukan tarif resmi.
- `learning_material` dimasukkan ke form dan database untuk pengembangan Progress Anak saat ini. `learning_notes` dan `next_focus` adalah field tambahan yang berguna; buat opsional jika belum disepakati sebagai wajib.
- Sistem AI membantu mengklasifikasikan temuan anomali, terutama dugaan data duplikat. Temuan ditinjau admin; AI tidak otomatis menghapus, menolak, menyetujui sesi, atau mengubah honor.
- Admin dan Tutor login menggunakan username + password.
- Orang Tua login melalui satu ID Akses Orang Tua saja, tanpa password, sesuai kebutuhan UX yang sudah dipilih.
- Palet warna, tipografi, logo, dan referensi desain final akan ditentukan tim kemudian. Sebelum keputusan tersebut tersedia, bangun UI dashboard modern, bersih, responsif, mudah dipakai dengan semantic design tokens yang mudah diganti.

## 4. User flow dan system flow

### 4.1 Tutor mengirim catatan pertemuan

1. Tutor login dengan username dan password.
2. Tutor membuka **Form Absensi / Pertemuan Les**.
3. Nama tutor berasal dari akun login dan tidak dapat dipilih manual.
4. Tutor memilih siswa dari daftar penugasan yang aktif. Backend harus tetap memvalidasi bahwa siswa/mata pelajaran memang berada dalam penugasan tutor tersebut.
5. Kelas dan asal sekolah diambil dari master data siswa; jangan meminta tutor mengetik ulang jika data sudah tersedia.
6. Tutor memilih mata pelajaran yang diizinkan, mengisi tanggal les, durasi dalam menit, dan materi pembelajaran.
7. Frontend mengirim ke backend. Backend memvalidasi identity, assignment, tanggal, durasi, dan field wajib.
8. Backend menyimpan satu row `lesson_sessions` ke Neon dengan status `pending` dan UUID internal.
9. Sistem menjalankan atau menjadwalkan screening anomali secara terpisah. Jika AI/provider gagal, penyimpanan sesi tidak dibatalkan.
10. Tutor mendapat konfirmasi bahwa data tersimpan dan statusnya menunggu review.

### 4.2 Admin meninjau sesi

1. Admin login.
2. Admin membuka **Data Absensi**, memfilter bulan/tutor/siswa/mapel/status.
3. Admin melihat detail sesi dan finding anomali jika ada.
4. Admin dapat menyetujui, meminta revisi, atau menolak dengan alasan yang sesuai.
5. Status terakhir, admin yang mengambil keputusan terakhir, waktu review, dan alasan saat ini disimpan. Finding anomali tidak otomatis mengubah status sesi. Audit trail lengkap untuk setiap perubahan status belum termasuk baseline.
6. Sesi berstatus `approved` masuk ke perhitungan estimasi honor dan dapat ditampilkan kepada orang tua.

Status sesi MVP: `pending`, `approved`, `revision_requested`, `rejected`.

### 4.3 Riwayat Tutor, Honor, dan Progress Anak

- Riwayat Mengajar Tutor membaca `lesson_sessions` milik tutor yang sedang login.
- Honor Saya menampilkan estimasi per bulan dari sesi `approved`, dengan tarif demo Rp50.000 per sesi. Jangan menyebutnya pembayaran aktual.
- Progress Anak membaca sesi `approved` dari siswa yang terhubung dengan akun orang tua; tampilkan tanggal, mata pelajaran, durasi, dan `learning_material`. Jangan membuka catatan internal admin, finding anomali, honor tutor, atau data siswa lain.
- Filter bulanan memakai `lesson_date`.

### 4.4 Ekspor Google Sheets

1. Admin memilih jenis laporan absensi dan bulan.
2. Backend mengambil semua sesi berdasarkan `lesson_date` pada periode terpilih, tanpa memfilter status review.
3. Backend memetakan data ke delapan kolom mentah UMKM dalam urutan yang tepat. Working default format fixture adalah tanggal `DD/MM/YYYY` dan durasi `N menit`; format spreadsheet asli harus dikonfirmasi pada O-11 sebelum live export.
4. Backend membuat atau memperbarui tab `Absensi YYYY-MM`.
5. Ekspor ulang mengganti/memperbarui laporan bulan yang sama agar tidak membuat duplikat.
6. Backend menyimpan log hasil ekspor, misalnya actor, periode, waktu, jumlah row, status, dan error ringkas.
7. Jika Google Sheets gagal, data di Neon tetap utuh. UI menampilkan kegagalan dengan jelas dan memberi kesempatan untuk mencoba kembali. Jangan mengklaim sukses sebelum API write dikonfirmasi.

## 5. Spesifikasi dashboard

### 5.1 Admin

Navigasi utama:

- **Dashboard:** statistik jumlah tutor, siswa, sesi, sesi pending, dan estimasi honor. Jangan menampilkan pendapatan bimbel jika belum ada data pembayaran siswa.
- **Data Absensi:** daftar semua sesi, filter bulanan, detail, review, revisi/penolakan, status, serta temuan anomali.
- **Rekap:** jumlah sesi dan total durasi per bulan, tutor, siswa, atau mata pelajaran.
- **Honor Tutor:** estimasi honor per tutor dan rincian sesi `approved`; memakai tarif demo Rp50.000/sesi. Pembayaran aktual belum masuk scope baseline.
- **Master Data:** submenu Tutor, Siswa, Orang Tua/Wali, Mata Pelajaran, Penugasan Tutor-Siswa-Mapel, dan Tarif Honor. Tarif Honor dibutuhkan untuk konfigurasi/demo Rp50.000 per sesi; tarif resmi UMKM tetap belum diketahui.

Submenu Master Data:

- **Tutor:** profil, akun, status aktif.
- **Siswa:** nama, kelas, asal sekolah, status aktif.
- **Orang Tua/Wali:** akun/ID akses dan relasi anak.
- **Mata Pelajaran:** daftar mapel yang digunakan.
- **Penugasan:** tutor yang mengajar siswa tertentu untuk mata pelajaran tertentu, termasuk masa berlaku/status.
- **Tarif Honor:** konfigurasi rate per sesi untuk data demo; tarif resmi menunggu konfirmasi UMKM.

Data yang sudah direferensikan sebaiknya dinonaktifkan (soft deactivate), bukan dihapus permanen hingga merusak histori.

### 5.2 Tutor

Navigasi utama:

- **Dashboard:** ringkasan sesi bulanan, status review, estimasi honor.
- **Form Absensi:** siswa dan mapel dari assignment, tanggal, durasi, materi.
- **Riwayat Mengajar:** sesi tutor sendiri; filter bulan dan status; detail catatan.
- **Honor Saya:** sesi approved yang dihitung, tarif demo yang jelas diberi label, dan total estimasi per bulan.

Field form baseline:

- Nama tutor: otomatis dari akun login.
- Nama siswa: pilihan dari penugasan yang aktif.
- Kelas: otomatis dari Master Data siswa.
- Asal sekolah: otomatis dari Master Data siswa.
- Mata pelajaran: pilih dari penugasan.
- Tanggal les: input tanggal.
- Durasi les: input/pilihan durasi, disimpan konsisten sebagai integer `duration_minutes`.
- Materi pembelajaran: `learning_material`.
- Catatan pembelajaran/fokus berikutnya: optional sampai disepakati sebagai wajib.

Status dan waktu submit dibuat backend, bukan diisi tutor. Hindari input yang sama dua kali; tampilkan preview/ringkasan sebelum submit bila membantu.

### 5.3 Orang Tua/Wali

- Login sederhana melalui satu ID Akses Orang Tua.
- Halaman Progress Anak/riwayat pembelajaran.
- Tampilkan sesi yang sudah `approved` dari anak yang terhubung: tanggal les, mata pelajaran, durasi, materi pembelajaran, dan catatan yang memang ditujukan untuk wali.
- Sembunyikan internal notes, anomaly, honor, data anak lain, dan informasi operasional yang tidak relevan.

## 6. ERD konseptual / tabel inti

Rujuk ERD penuh di `docs/14-ERD-AND-DATA-DICTIONARY.md`. Gambaran tabel yang diperkirakan:

- `users`: akun dan role (`admin`, `tutor`, `parent`); password hash untuk Admin/Tutor; Parent access-code verifier/digest tidak disimpan sebagai plaintext.
- `tutors`: profil tutor yang terhubung ke `users`.
- `students`: profil siswa; kelas dan asal sekolah sebagai atribut master untuk MVP.
- `parent_students`: relasi akun orang tua dan siswa.
- `subjects`: referensi mata pelajaran.
- `tutor_assignments`: relasi tutor, siswa, mapel dan status/masa berlaku penugasan.
- `tutor_rates`: tarif per sesi dan penanda demo; tarif resmi masih belum diketahui.
- `lesson_sessions`: record sesi, assignment, tanggal, durasi menit, materi, status, informasi submit/review terakhir, catatan admin, snapshot rate setelah sesi disetujui.
- `anomaly_flags`: klasifikasi, alasan, tingkat/keyakinan bila tersedia, status review admin, dan referensi sesi yang terkait.
- `sheet_export_runs`: log ekspor bulanan ke Google Sheets.

Jangan membuat tabel riwayat terpisah hanya untuk setiap dashboard. Semua tampilan riwayat berasal dari `lesson_sessions` dengan filter role/relasi server-side.

## 7. Login dan keamanan

### Admin dan Tutor

- Login username + password.
- Password di-hash dengan algoritma yang sesuai, tidak disimpan plaintext.
- Gunakan sesi aman, cookie `HttpOnly`, `Secure` di production, konfigurasi `SameSite`, origin allowlist, CSRF protection untuk mutasi, dan rate limiting.
- Validasi role serta scope di backend, bukan sekadar menyembunyikan menu di UI.

### Orang Tua

- UX hanya satu input ID Akses Orang Tua dan tanpa password untuk MVP.
- Karena ID akses menjadi satu-satunya credential, ia harus dianggap rahasia: buat secara acak dan sulit ditebak, bukan nomor siswa/NPM publik atau sequence.
- Simpan verifier/digest yang aman (misalnya HMAC dengan pepper server-side), bukan nilai akses mentah; tampilkan kode raw hanya saat dibuat/dirotasi.
- Rate limit percobaan, pesan error generik, sediakan rotasi/revoke oleh Admin, jangan memasukkan kode ke log, dan hanya izinkan akses siswa yang terhubung melalui `parent_students`.
- Jika kelak UMKM ingin memakai nomor ID yang mudah ditebak atau dibagikan secara publik, rekomendasikan faktor verifikasi tambahan sebelum digunakan untuk data anak.

### AI dan data sensitif

- Jangan mengirim password, access code, email/nomor telepon, atau PII yang tidak diperlukan ke model AI.
- Pseudonymize data yang dikirim untuk klasifikasi bila memungkinkan.
- AI tidak boleh otomatis menyetujui/menolak/menghapus sesi atau mengubah perhitungan honor.
- Jika model gagal, beri status `not_evaluated`/`failed` yang jelas; jangan berpura-pura analisis AI sukses.

## 8. Deteksi anomali

- Baseline: klasifikasi dugaan duplikasi dan pola tidak biasa pada data sesi.
- Validasi deterministik (field wajib, durasi/tanggal valid, assignment sah) tetap dijalankan terlepas dari AI.
- AI anomaly service boleh membantu memprioritaskan kandidat dan memberi alasan yang dapat ditinjau; jangan dianggap bukti kesalahan/kecurangan.
- Simpan finding di `anomaly_flags`, terpisah dari status sesi.
- Temuan duplikat tidak boleh otomatis menghapus record, menolak sesi, atau mengubah honor.
- Dua sesi yang tampak sama bisa saja valid; admin perlu memutuskan.
- Batas durasi/pola dianggap heuristik yang configurable sampai UMKM mengonfirmasi business rules.

## 9. Design system dan UX

- Referensi visual yang diharapkan: dashboard SaaS modern dan minimalis seperti referensi desain yang akan dipilih tim, termasuk inspirasi umum dari Dribbble.
- **Belum ada palet warna, typography, logo, atau referensi visual final. Jangan mengarang keputusan brand.** Gunakan semantic tokens sementara yang netral dan mudah diubah setelah tim memberi keputusan.
- Jangan menggunakan shadcn/ui.
- Prioritaskan navigasi jelas, tidak terlalu banyak submenu, form yang pendek, auto-fill, label dan helper text yang jelas, tabel yang mudah dicari/filter, dan feedback status yang dapat dipahami.
- Semua halaman perlu loading, empty, error, success, disabled/loading state, responsive layout, keyboard accessibility, kontras yang cukup, dan konfirmasi untuk aksi penting.
- Tampilkan nominal Rp50.000 sebagai **simulasi** sampai aturan resmi tersedia.

## 10. Batasan MVP dan future features

### MVP / baseline development

- Role Admin, Tutor, Orang Tua.
- CRUD Master Data inti.
- Form Tutor menyimpan sesi ke Neon dengan status pending.
- Review Admin: approve, request revision, reject.
- Riwayat Mengajar Tutor dan Progress Anak berbasis sesi yang approved.
- Rekap bulanan berdasarkan `lesson_date`.
- Honor demo Rp50.000 per sesi, hanya sesi approved dihitung.
- AI anomaly classification dengan review manusia.
- Ekspor laporan absensi bulanan secara on-demand langsung ke Google Sheets; semua status review ikut diekspor.
- Security baseline dan tests untuk alur utama.

### Future features / jangan ditambahkan ke MVP tanpa persetujuan

- Pencatatan pembayaran aktual, payroll period, pembayaran sebagian, status lunas, slip honor.
- Tarif honor resmi dan aturan berbeda per tutor/mapel/siswa.
- Progres akademik lanjutan: nilai evaluasi, target belajar, rubrik kemampuan, grafik perkembangan formal.
- Jam mulai/jam selesai, kehadiran tidak hadir/terlambat/pembatalan, deteksi sesi overlap yang membutuhkan data waktu tambahan.
- Sinkronisasi dua arah Google Sheets atau auto-sync setiap submission.
- Import/migrasi historis dari Google Sheets.
- Notifikasi otomatis, chat, booking jadwal, LMS/materi digital, pembayaran siswa, analisis prediktif.
- Ekspor PDF atau report tambahan jika kebutuhan UMKM dikonfirmasi.
- AI analytics lebih canggih setelah dataset, kriteria, dan evaluasi model disepakati.

## 11. Pertanyaan yang masih terbuka

Jangan mengisi pertanyaan ini dengan asumsi tanpa mencatatnya sebagai keputusan baru:

2. **O-09 — Requiredness form:** owner setuju `learning_material` dicantumkan untuk current development, tetapi apakah field ini wajib diisi agar form bisa disubmit, atau opsional? Working default saat ini required supaya Progress Anak punya materi. `learning_notes` dan `next_focus` tetap opsional.
3. Berapa tarif honor resmi dan adakah aturan pembulatan/pembatalan? Rp50.000 per sesi hanya dummy development.
4. Apa kriteria anomaly yang disetujui UMKM, dan model AI apa yang benar-benar akan digunakan tim?
5. Apakah data lama perlu dimigrasikan?
6. Bagaimana ID akses orang tua dibagikan dan dipulihkan secara operasional?
7. Referensi desain, warna, typography, dan logo final apa yang dipilih tim?
8. Apakah perlu mencatat pembayaran aktual dalam scope MVP?
9. **O-10 — Nilai historis pada laporan:** jika nama tutor, nama siswa, kelas, sekolah, atau mapel di Master Data berubah setelah sesi, apakah ekspor sesi lama harus menampilkan nilai master terbaru atau nilai pada saat sesi berlangsung? Working default MVP memakai join ke Master Data terkini; snapshot historis dapat ditambah bila UMKM membutuhkan.
10. **O-11 — Format laporan:** format tanggal/durasi dalam spreadsheet asli belum diverifikasi. Working default untuk fixture adalah `DD/MM/YYYY` dan `N menit`; cocokkan dengan spreadsheet asli sebelum live export.
11. **O-12 — Validasi durasi:** bedakan nilai yang ditolak sebagai input invalid dari durasi yang diterima tetapi ditandai outlier. Default validator menolak nilai bukan integer positif; threshold outlier configurable. Batas maksimum bisnis belum disepakati.
12. **O-13 — Catatan progres:** `learning_notes` dan `next_focus` direkomendasikan sebagai field opsional untuk memperkaya Progress Anak; owner belum mengonfirmasi apakah keduanya termasuk MVP atau cukup `learning_material` dahulu.
13. **O-14 — Tanggal sesi:** working default menolak `lesson_date` masa depan menurut tanggal lokal `Asia/Jakarta`, tetapi mengizinkan sesi lampau untuk laporan terlambat. Konfirmasi kebijakan ini dengan UMKM.
14. **O-15 — Koreksi absensi oleh Admin:** working default tidak menyediakan endpoint edit field absensi oleh Admin atau delete; Admin hanya memutuskan review. Tutor mengoreksi melalui `revision_requested`, sedangkan `approved`/`rejected` terminal tanpa reopen. Konfirmasi apakah UMKM membutuhkan edit langsung, koreksi/reopen pascakeputusan, atau penghapusan; jika ya, rancang izin, workflow, dan audit history terlebih dahulu.

## 12. Cara coding agent harus membantu

- Gunakan konteks ini sebagai latar proyek untuk brainstorming, product decisions, UX, architecture, ERD, API contracts, dan implementasi.
- Saat pengguna meminta coding atau update dokumen, baca file proyek relevan sebelum mengubah rancangan.
- Utamakan jawaban terstruktur dalam Bahasa Indonesia, lugas dan konkret. Jelaskan trade-off saat ada lebih dari satu opsi.
- Bedakan **keputusan yang sudah disetujui**, **rekomendasi**, dan **pertanyaan terbuka**. Jangan menyajikan rekomendasi sebagai keputusan owner.
- Untuk tugas yang menyentuh beberapa modul, sinkronkan PRD, API contract, data contract, ERD, user flow, breakdown dashboard, test/fixtures, dan phase docs sekaligus.
- Untuk coding agent: periksa struktur repo, `git status`, scripts, dan dokumen sebelum edit; lakukan perubahan kecil dan modular; jalankan test/typecheck/lint/build yang tersedia; laporkan hasil aktual. Jangan klaim test atau live integration berjalan jika belum dijalankan.
- Hindari menambah dependency besar, fitur di luar scope, atau UI yang belum disepakati tanpa alasan dan persetujuan.
