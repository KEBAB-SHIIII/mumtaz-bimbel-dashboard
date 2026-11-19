# Start Here — Mumtaz Attendance & Learning Progress System

## Tujuan paket

Blueprint untuk coding agent membangun aplikasi role-based Bimbel Mumtaz Sampit. Dokumen ini menjelaskan keputusan produk dan alur yang sudah disepakati. Jangan mengembalikan arsitektur ke alur impor spreadsheet atau auto-sync yang bukan lagi keputusan MVP.

## Keputusan wajib diikuti

1. Neon PostgreSQL adalah sumber kebenaran operasional.
2. Tutor mengirim form pada Dashboard Tutor → backend Express memvalidasi → Neon menyimpan catatan sesi dengan status awal `pending`.
3. Admin meninjau sesi secara manual. Hanya sesi `approved` yang dihitung ke estimasi honor.
4. Admin, Tutor, dan Orang Tua membaca data melalui backend/API yang sama dengan filter akses berbeda; halaman satu role bukan sumber data role lain.
5. Google Sheets hanya menjadi tujuan ekspor laporan bulanan atas tindakan Admin. Tidak ada Sheets write saat tutor submit, impor rutin, atau sinkronisasi dua arah.
6. Ekspor standar Google Sheets berisi delapan kolom mentah UMKM: `no`, `nama tutor`, `nama murid`, `kelas`, `asal sekolah`, `mata pelajaran`, `tanggal les`, `durasi les`. Semua status review ikut diekspor sesuai keputusan owner. Kolom ekspor tetap delapan kolom, tanpa status, materi, anomaly, honor, ID internal, atau timestamp teknis.
7. Laporan bulan memakai `lesson_date`. Re-export bulan yang sama mengganti isi tab `Absensi YYYY-MM`, bukan menambah baris duplikat.
8. `no` adalah nomor urut output; setiap sesi di database punya UUID sendiri.
9. Form menyertakan materi pembelajaran. Working default saat ini mewajibkan `learning_material`, tetapi requiredness-nya belum dikonfirmasi owner (O-09). Catatan/fokus opsional; semua field pembelajaran disimpan di DB dan tidak masuk ekspor delapan kolom.
10. Tarif demo untuk development Rp50.000 per sesi, tersimpan di `tutor_rates` sebagai `is_demo_assumption=true`. UI wajib menyebut simulasi, bukan tarif resmi UMKM. Submenu Tarif Honor ada untuk konfigurasi demo, meskipun tarif resmi masih terbuka.
11. Modul anomali mengklasifikasikan dugaan duplikasi/pola anomali dan menampilkan finding kepada Admin. AI tidak memutuskan validitas, status sesi atau honor otomatis.
12. Admin/Tutor login username + password. Orang Tua login hanya dengan satu ID Akses Orang Tua yang acak/rahasia tanpa password. Jangan gunakan ID siswa/NPM publik atau nomor yang mudah ditebak sebagai credential.
13. Referensi visual final—palet warna, tipografi, logo, dan referensi spesifik—belum diputuskan tim. Gunakan semantic design tokens netral dan mudah diubah sampai keputusan desain tersedia.
14. Semua data sample bersifat sintetis. Spreadsheet dan credential live disiapkan kemudian; jangan klaim integrasi live sebelum smoke test.

## Urutan membaca

1. [`01-PRD.md`](./01-PRD.md) — tujuan, scope dan acceptance criteria.
2. [`02-AGENT-CONTEXT.md`](./02-AGENT-CONTEXT.md) — aturan kerja agent, stack dan keamanan.
3. [`03-TECHNICAL-ARCHITECTURE.md`](./03-TECHNICAL-ARCHITECTURE.md) — pembagian modul dan alur server.
4. [`04-API-CONTRACT.md`](./04-API-CONTRACT.md) dan [`05-DATA-CONTRACT.md`](./05-DATA-CONTRACT.md) — endpoint, schema, status dan format data.
5. [`14-ERD-AND-DATA-DICTIONARY.md`](./14-ERD-AND-DATA-DICTIONARY.md) — tabel dan relasi.
6. [`15-DASHBOARD-TABS.md`](./15-DASHBOARD-TABS.md) — breakdown tab per role.
7. [`12-USER-FLOWS.md`](./12-USER-FLOWS.md) — user/system flow.
8. [`16-GOOGLE-SHEETS-MONTHLY-EXPORT.md`](./16-GOOGLE-SHEETS-MONTHLY-EXPORT.md) — ekspor bulanan.
9. [`07-DESIGN-GUIDELINES.md`](./07-DESIGN-GUIDELINES.md), [`06-TESTING-STRATEGY.md`](./06-TESTING-STRATEGY.md), [`08-IMPLEMENTATION-CHECKLIST.md`](./08-IMPLEMENTATION-CHECKLIST.md).
10. [`09-REAL-INTEGRATIONS.md`](./09-REAL-INTEGRATIONS.md), [`11-ENVIRONMENT-SETUP.md`](./11-ENVIRONMENT-SETUP.md), [`13-DEPENDENCIES-AND-UI-LIBRARY.md`](./13-DEPENDENCIES-AND-UI-LIBRARY.md), [`17-DECISIONS-AND-OPEN-QUESTIONS.md`](./17-DECISIONS-AND-OPEN-QUESTIONS.md).
11. `docs/19-OWNER-CLARIFICATIONS-V5.md` — keputusan terbaru tentang tiga route utama, ekspor semua status, dan prinsip UX.
12. `docs/20-QA-REPORT.md` — hasil QA Phase 09 (otomatis + live), acceptance criteria, dan risiko.
12. Kerjakan `docs/phases/` sesuai urutan dan acceptance criteria.

## Label informasi

- **[FAKTA USE CASE]**: informasi tentang proses UMKM yang sudah disampaikan.
- **[KEPUTUSAN MVP]**: keputusan owner untuk implementasi.
- **[DEMO]**: nilai/akun/data sintetis untuk development dan test, bukan data resmi.
- **[MANUAL SETUP]**: tindakan owner yang baru dilakukan saat integrasi live dibutuhkan.
- **[BELUM DIPUTUSKAN]**: detail yang menunggu hasil diskusi tim/UMKM.

## Konteks bisnis

Proses lama memakai Google Form dan Google Sheets untuk mencatat sesi les tutor; aplikasi baru memindahkan input ke Dashboard Tutor. Sistem menyimpan sesi, mengelola review dan rekap di Neon, memberi Tutor riwayat/honor, dan memberi Orang Tua riwayat/progres pembelajaran anak. Header spreadsheet yang sudah diketahui tetap menjadi format ekspor.

## Urutan eksekusi

1. Phase 01: repository, config, security baseline dan scripts.
2. Phase 02: shared contracts, ERD dan synthetic fixtures.
3. Phase 03: backend auth, database, master data dan role policy.
4. Phase 04: frontend shell, login tiga role dan design tokens placeholder.
5. Phase 05: implementasikan anomaly module termasuk klasifikasi dugaan duplikasi. Unit/offline tests memakai fake detector deterministik; integrasi Gemini live dilakukan setelah credential disiapkan dan tidak boleh dipalsukan.
6. Phase 06: form tutor, status review admin, riwayat dan progress.
7. Phase 07: rekap bulanan dan honor demo Rp50.000 per sesi.
8. Phase 08: ekspor report bulanan ke Google Sheets memakai semua status review, sesuai keputusan owner; cocokkan format tanggal/durasi spreadsheet asli (O-11) sebelum live export.
9. Phase 09: integrasi end-to-end, QA keamanan/UX dan demo.

## Prompt awal untuk coding agent

> Baca `docs/00-START-HERE.md` dan semua kontrak yang relevan sebelum coding. Ikuti alur Tutor submit → Express validasi → Neon dengan status pending; Admin review manual; honor demo Rp50.000 per sesi hanya untuk status approved; anomaly module mengklasifikasikan dugaan seperti duplicate dan tidak membuat keputusan otomatis; Admin mengekspor report bulanan ke Google Sheets dengan semua status review sesuai keputusan owner dengan delapan kolom mentah saja. Admin/Tutor login username+password; Orang Tua login dengan ID akses rahasia acak tanpa password dan hanya melihat anak yang terhubung. Gunakan ERD, API/data contract, user flow, dan dashboard breakdown sebagai satu sumber spesifikasi. Jangan hard-code warna/font final sebelum tim memberi keputusan desain. Gunakan TypeScript strict, React, Axios terpusat, Tailwind v4, Express 5, Drizzle dan Neon. Jangan menggunakan native fetch untuk API aplikasi, jangan install shadcn/ui, jangan meminta/mencetak secret, dan jangan menampilkan hasil integrasi mock sebagai live. Sebelum edit, laporkan scope; setelah edit, jalankan checks yang tersedia dan laporkan hasil aktual.

## Keputusan kerja yang masih provisional

- **O-08:** O-08 sudah diputuskan: semua status review ikut ekspor.
- **O-09:** `learning_material` currently required sebagai default agar Progress Anak ada konten; requiredness belum dikonfirmasi owner.
- **O-10:** ekspor historis memakai join master data terbaru; belum ada snapshot nama/kelas/sekolah/mapel pada waktu sesi.
- **O-11:** format tanggal/durasi pada spreadsheet asli harus diverifikasi sebelum live export.
- **O-12:** batas durasi yang ditolak validator versus yang hanya ditandai outlier belum disepakati.
- **O-13:** `learning_notes` dan `next_focus` direkomendasikan sebagai field opsional; cakupan MVP-nya belum dikonfirmasi.
- **O-14:** default menolak tanggal les di masa depan dan mengizinkan tanggal lampau; kebijakan ini masih perlu dikonfirmasi.
- **O-15:** baseline tidak menyediakan edit field sesi langsung oleh Admin, delete, atau reopen `approved`/`rejected`; konfirmasi apakah UMKM membutuhkan alur koreksi tersebut.

O-08 adalah keputusan owner yang sudah ditutup; O-09 sampai O-15 masih provisional.

## Sumber kebenaran saat konflik

1. **Keputusan owner dan konteks produk kanonik:** [`docs/PROJECT-CONTEXT.md`](./PROJECT-CONTEXT.md) dan keputusan terbaru di `docs/17-DECISIONS-AND-OPEN-QUESTIONS.md`. Untuk Project ChatGPT, file `Mumtaz-Bimbel-Project-Context.md` harus disinkronkan dari `PROJECT-CONTEXT.md` ini.
2. **Kontrak normatif implementasi:** `docs/01-PRD.md`, `docs/04-API-CONTRACT.md`, dan `docs/05-DATA-CONTRACT.md`, selama tidak bertentangan dengan keputusan owner/open questions.
3. **Detail model/tampilan/integrasi:** `docs/14-ERD-AND-DATA-DICTIONARY.md`, `docs/15-DASHBOARD-TABS.md`, `docs/16-GOOGLE-SHEETS-MONTHLY-EXPORT.md`, dan `docs/12-USER-FLOWS.md`.
4. **Dokumen fase, testing, dependency dan design** menerjemahkan kontrak; tidak boleh menciptakan keputusan bisnis baru.
5. `docs/00-START-HERE.md` adalah panduan orientasi, bukan sumber kebenaran bisnis yang mengalahkan `PROJECT-CONTEXT.md`.

Jangan membiarkan instruksi lama yang bertentangan tetap aktif. Perbarui dokumen, fixture dan tests terkait bersamaan.
