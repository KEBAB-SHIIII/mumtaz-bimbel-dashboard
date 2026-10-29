> **Catatan versi:** laporan ini merekam audit paket v4 dan sebagian isi bersifat historis. Untuk keputusan terbaru, baca `docs/19-OWNER-CLARIFICATIONS-V5.md`. Pada v5, O-08 ditutup: ekspor mencakup semua status review; entry route frontend hanya `/admin`, `/tutor`, `/orang-tua-murid`.

# Audit Report — Agent Pack v3 → v4 audited

**Tanggal audit:** 27 Oktober 2026  
**Objek:** `mumtaz-attendance-agent-pack-v3-with-project-context.zip` (39 ZIP entries; berisi docs, phase prompts, fixtures, project context/instructions).  
**Metode:** membaca dan membandingkan dokumen produk, konteks agent, API/data contract, ERD, user flow, dashboard, dependencies, setup integrations, phase docs, serta contoh fixtures. Ini adalah audit dokumentasi, bukan audit kode aplikasi karena source aplikasi belum termasuk dalam ZIP.

## Ringkasan hasil

Paket v3 **belum sepenuhnya bebas ambiguitas**. Mayoritas arah produk sudah konsisten (Neon sebagai source of truth, submit tutor ke DB, review manual, tarif demo Rp50.000/sesi, AI sebagai indikator untuk review, export bulanan manual ke Google Sheets), tetapi ditemukan:

- 6 temuan prioritas tinggi (A-01–A-06) yang menyangkut keputusan bisnis, kontrak API, autentikasi, atau fixture;
- 11 ketidaksinkronan/ambiguitas menengah (B-01–B-11);
- 8 keputusan produk/implementasi provisional yang tetap membutuhkan konfirmasi (O-08–O-15), ditambah risiko keamanan residual untuk ID akses orang tua.

Paket v4 menormalkan konflik yang bisa dibereskan secara dokumenter, dan mencatat keputusan yang belum dikonfirmasi sebagai `O-08` sampai `O-15`. Temuan awal dari v3 adalah 6 temuan prioritas tinggi (A-01–A-06) dan 11 ketidaksinkronan menengah (B-01–B-11). Final pass v4 juga memperjelas CSRF flow, aturan export kosong, status `published` yang tidak ada pada model, struktur tabel dependency, lifecycle finding saat revisi, istilah session auth, field revisi yang diizinkan, dan batas durasi yang masih terbuka. Temuan lanjutan yang masih memerlukan keputusan produk atau hardening implementasi disebut secara eksplisit di bawah; jangan menganggap audit ini sebagai persetujuan bisnis untuk default provisional.

## A. Temuan prioritas tinggi

### A-01 — Filter status ekspor dilabeli keputusan owner tanpa konfirmasi yang jelas
**Severity: HIGH / keputusan bisnis**  
**Lokasi v3:** `PROJECT-CONTEXT.md` §3 baris ekspor, `docs/00-START-HERE.md` keputusan #6, `docs/01-PRD.md` §2/§8, `docs/04-API-CONTRACT.md` §8, `docs/05-DATA-CONTRACT.md` §3, `docs/15-DASHBOARD-TABS.md` Rekap, `docs/16-GOOGLE-SHEETS-MONTHLY-EXPORT.md`, `docs/17-DECISIONS-AND-OPEN-QUESTIONS.md` D-13.  
**Masalah:** pengguna secara eksplisit menyetujui delapan kolom mentah dan ekspor laporan per bulan, tetapi tidak secara eksplisit memutuskan apakah row filter hanya approved atau semua submission. V3 menyebut semua status review sebagai keputusan owner yang sudah final.  
**Dampak:** pending/revision/rejected bisa hilang dari laporan bulanan tanpa disadari.  
**Catatan historis v4:** filter ekspor masih provisional. Keputusan owner terbaru pada v5 menutup O-08: semua status review ikut diekspor.

### A-02 — Endpoint Master Data Orang Tua menggunakan path ganda
**Severity: HIGH / kontrak API**  
**Lokasi v3:** `docs/04-API-CONTRACT.md` §2.4 dan §4.  
**Masalah:** pembuatan orang tua dijelaskan pada `/admin/parents`, tetapi daftar CRUD menyebut `/parents`, lalu rotasi kode kembali menggunakan `/admin/parents/:id/rotate-access-code`.  
**Dampak:** frontend dan backend agent bisa menerapkan route berbeda atau menggandakan handler.  
**Normalisasi v4:** seluruh operasi administrasi parent menggunakan `/admin/parents...`; endpoint self-service parent tetap `/parent/...`.

### A-03 — CSRF header wajib, tetapi token tidak punya bootstrap flow
**Severity: HIGH / blocker implementasi keamanan**  
**Lokasi v3:** `docs/04-API-CONTRACT.md` §1, §2; `docs/11-ENVIRONMENT-SETUP.md`; `docs/12-USER-FLOWS.md`.  
**Masalah:** request mutasi wajib mengirim `X-CSRF-Token`, tetapi tidak ada endpoint/flow untuk frontend mendapatkan token atau menggantinya setelah login.  
**Dampak:** agent harus mengarang mekanisme atau semua mutasi akan gagal.  
**Normalisasi v4:** menambahkan kontrak `GET /auth/csrf`, token disimpan hanya di memory, dan frontend mengambil token baru setelah login/session regeneration.

### A-04 — Janji riwayat keputusan review tidak didukung skema
**Severity: HIGH / konsistensi data/API**  
**Lokasi v3:** `docs/04-API-CONTRACT.md` detail sesi menyebut riwayat keputusan; `docs/14-ERD-AND-DATA-DICTIONARY.md` hanya menyimpan current status, satu admin note, dan reviewer/timestamp terakhir. PRD menempatkan audit history lebih detail sebagai P1.  
**Dampak:** agent mungkin membangun UI histori yang tidak punya sumber data atau mencoba menyimpannya di satu kolom yang akan tertimpa.  
**Normalisasi v4:** baseline menjanjikan **keputusan terakhir saja**; riwayat penuh ditandai future/P1 kecuali owner menambah tabel `lesson_session_reviews`.

### A-05 — CSV fixture dikatakan dapat menjadi seed sesi, tetapi entitasnya tidak ada di seed DB
**Severity: HIGH / fixture integrity**  
**Lokasi v3:** `examples/README.md`, `docs/phases/phase-02-contracts-and-fixtures.md`, `examples/attendance-sample.csv`, `examples/seed-data.json`.  
**Masalah:** CSV berisi Tutor Demo C, siswa 4–6, mapel Mengaji/Bahasa Indonesia/Calistung, durasi kosong, tutor tidak terdaftar, dan row duplikat. `seed-data.json` hanya berisi Tutor Demo A/B, siswa 1–3, dan tiga mapel lain.  
**Dampak:** seeding `lesson_sessions` dari CSV gagal pada FK atau membutuhkan mapping palsu; importer yang tidak termasuk baseline bisa terimplementasi tanpa diminta.  
**Normalisasi v4:** CSV dinyatakan sebagai fixture sintetis terisolasi untuk merepresentasikan header/duplikasi, bukan DB seed dan bukan kebutuhan fitur parser/import baseline; `seed-data.json` menjadi relational seed.

### A-06 — Session cookie dan strategi session store belum diputuskan
**Severity: HIGH / keamanan dan runtime**  
**Lokasi v3:** `docs/04-API-CONTRACT.md`, `docs/03-TECHNICAL-ARCHITECTURE.md`, `docs/13-DEPENDENCIES-AND-UI-LIBRARY.md`, `docs/11-ENVIRONMENT-SETUP.md`.  
**Masalah:** dokumen meminta session cookie dan `SESSION_SECRET`, tetapi tidak menetapkan apakah sesi disimpan server-side atau berupa JWT/signed cookie. Dependency `jose` (jika JWT) dan `cookie-parser` bersifat opsional, namun tidak ada session store.  
**Dampak:** agent dapat memilih strategi berbeda atau memakai MemoryStore yang tidak cocok untuk production.  
**Normalisasi v4:** rekomendasi baseline dibuat eksplisit: server-side session dengan PostgreSQL-backed store; table store merupakan infrastruktur auth, terpisah dari ERD domain. Implementasi harus mendokumentasikan setup store nyata dan tidak memakai MemoryStore di production.

## B. Ketidaksinkronan/ambiguitas menengah

### B-01 — `verified_at` / `verified_by_user_id` mewakili semua keputusan, bukan hanya verifikasi
**Severity: MEDIUM**  
Kolom dipakai juga untuk `revision_requested` dan `rejected`, sehingga nama `verified_*` menyesatkan. V4 menamai ulang menjadi `reviewed_at` dan `reviewed_by_user_id` secara konsisten.

### B-02 — Requiredness `learning_material` belum merupakan pernyataan eksplisit owner
**Severity: MEDIUM / UX**  
Owner setuju field materi dicantumkan, tetapi required/optional belum jelas. V3 menetapkannya required di Start Here, Data Contract, API sample, dan dashboard. V4 mempertahankan required sebagai working default dan menambah O-09. Jika dibatalkan, kontrak validasi, empty state progres, dan test harus disesuaikan.

### B-03 — Tarif Honor ditulis `jika diperlukan`, tetapi route/schema/UI menganggapnya tersedia
**Severity: MEDIUM**  
V3 menyebut submenu tarif bersifat opsional, padahal kalkulator memakai `tutor_rates`, ada API CRUD, dan phase backend memintanya. V4 menetapkan submenu Tarif Honor untuk data demo sebagai baseline; tarif resmi UMKM tetap terbuka.

### B-04 — `invalid_data` adalah finding AI padahal data invalid ditolak validator
**Severity: MEDIUM / domain semantics**  
Data Contract dan integration docs menyebut `invalid_data` sebagai output model, sedangkan validasi deterministic seharusnya menolak record invalid sebelum sesi dibuat dan tidak ada import baseline. V4 membatasi finding baseline ke `suspected_duplicate`, `duration_outlier`, dan `unusual_pattern`; invalid input tetap validation error.

### B-05 — PDF terkesan bagian fase wajib padahal hanya future option
**Severity: MEDIUM / scope creep**  
Nama file phase mengandung `payroll-and-pdf`, `pdfkit` muncul di tabel runtime dependencies, sementara PRD menempatkan PDF sebagai P1/future. V4 mengganti nama phase ke `phase-07-monthly-recap-and-payroll.md` dan memindahkan PDFKit ke opsi setelah persetujuan owner.

### B-06 — Anomaly status berulang di level sesi dan flag tanpa penjelasan yang tegas
**Severity: MEDIUM**  
V3 mempunyai `lesson_sessions.anomaly_analysis_status` dan `anomaly_flags.analysis_status`, keduanya bisa memuat `failed/not_evaluated`. V4 menetapkan status proses agregat otoritatif pada sesi; baris `anomaly_flags` hanya menyimpan finding yang dihasilkan dan status review manusia.

### B-07 — Tarif snapshot belum menyebut kapan dibekukan
**Severity: MEDIUM / audit honor**  
V3 menyebut rate efektif pada tanggal sesi, tetapi juga menyebut snapshot ketika diputuskan tanpa waktu tepat. V4 menetapkan working rule: snapshot diisi saat sesi disetujui, mencari tarif yang masa berlakunya mencakup `lesson_date`, supaya perubahan rate berikutnya tidak mengubah histori sesi yang sudah disetujui.

### B-08 — Nilai master historis pada ekspor belum didefinisikan
**Severity: MEDIUM / laporan historis**  
Export join ke `users/tutors/students/subjects` sehingga perubahan nama/kelas/sekolah di master dapat mengubah ekspor ulang bulan lama. V4 mencatat O-10; working default memakai master values terkini, tanpa snapshot historis.

### B-09 — Status `is_active` terduplikasi di akun dan profil tutor/siswa
**Severity: MEDIUM / aturan akses**  
V3 punya `users.is_active`, `tutors.is_active`, dan `students.is_active` tanpa membedakan maknanya. V4 menjelaskan: `users.is_active` menentukan login; `tutors.is_active`/`students.is_active` menentukan eligibility operasional untuk assignment/sesi baru. Histori tidak dihapus saat deactivation.

### B-10 — Anomaly analysis lifecycle ambigu (status response pending vs screening sesudah commit)
**Severity: MEDIUM / integrasi asynchronous**  
API mengatakan `201` mengembalikan `anomaly_analysis_status=pending`, tetapi tidak menetapkan apakah model dipanggil sebelum response atau berjalan setelahnya. V4 menetapkan screening asynchronous, pending dikembalikan setelah DB commit, error ditangkap terpisah, dan pending perlu dipulihkan saat startup. Agent tetap perlu menguji flow ini pada implementasi.

### B-11 — `tutor_rates` menu/editability dan official rate
**Severity: MEDIUM / product scope**  
V4 membuat submenu diperlukan untuk tarif demo, tetapi tarif resmi dan rules different per tutor/mapel/siswa masih open. Jangan menyebut nilai Rp50.000 sebagai data bisnis; label simulasi wajib.

## C. Risiko yang bukan kontradiksi tetapi harus dipahami

1. **Parent access-code-only:** satu kode adalah bearer credential. Siapa pun yang mendapatkannya dapat mengakses progres anak terkait selama kode aktif. Dokumentasi sudah meminta kode acak, digest HMAC, rate limit, rotasi, error generik, cookie session, dan scope check; risiko residual ini tetap perlu diterima owner.
2. **Anomaly bukan pembuktian:** dua sesi sama bisa sama-sama valid. Model hanya menghasilkan kandidat; admin memutuskan status sesi dan honor.
3. **Data historis belum dimigrasi:** tidak ada import otomatis dari Sheets pada baseline. Gunakan seed sintetis sampai kebutuhan migrasi disetujui.
4. **Waktu sesi tidak ada:** tanggal dan durasi tidak memungkinkan deteksi overlap waktu yang akurat; jangan klaim fitur tersebut.
5. **No adalah display sequence:** jangan memakai `no` sebagai primary key atau idempotency identifier.
6. **Tarif resmi belum ada:** kalkulasi Rp50.000/sesi hanya untuk demo; jangan menampilkan status dibayar.

## D. Hal yang sudah konsisten dengan baik

- Neon PostgreSQL sebagai source of truth; submit tutor tidak menulis ke Sheets.
- Data sesi yang sama digunakan oleh Admin/Tutor/Orang Tua melalui API dan permission scope berbeda.
- Status sesi awal `pending`; honor hanya menghitung sesi approved.
- Tarif demo Rp50.000/sesi dan label simulasi tersebar konsisten.
- Sheets export-only, delapan kolom mentah, filter bulan berdasarkan `lesson_date`, tab per bulan, re-export mengganti tab dan tidak append.
- AI tidak boleh auto-approve/reject/delete atau mengubah honor.
- Field pembelajaran tidak masuk format ekspor delapan kolom.
- Design tokens sementara dan larangan shadcn konsisten.

## E. Temuan final pass tambahan yang ditemukan saat menyelaraskan v4

### F-01 — API mendefinisikan CSRF endpoint tetapi response lifecycle perlu dijelaskan
**Status:** ditangani di v4.
`GET /auth/csrf` sekarang secara eksplisit mengeluarkan synchronizer token no-store untuk anonymous session; login/admin-parent-access memvalidasi token dan Origin; successful login meregenerasi session ID dan mengembalikan token baru. Ini harus diimplementasikan sebagai kontrak tunggal bersama frontend.

### F-02 — Ekspor kosong memerlukan perilaku API eksplisit
**Status:** ditangani di v4.
API request memiliki `confirm_empty_replace`. Jika hasil kosong sedangkan tab target lama memiliki data, server mengembalikan `409 EMPTY_EXPORT_CONFIRMATION_REQUIRED` tanpa menulis; UI meminta konfirmasi lalu mengulang dengan `confirm_empty_replace: true`.

### F-03 — Status `published` dipakai tetapi tidak ada dalam state machine
**Status:** ditangani di v4.
Kontrak Parent kini hanya menggunakan `approved`; jangan menambahkan status `published` kecuali keputusan produk dan ERD diubah bersama.

### F-04 — Dependency table backend sebelumnya terpotong menjadi tabel Markdown yang tidak valid
**Status:** ditangani di v4.
Runtime, optional runtime, dan dev dependencies kini masing-masing memakai tabel yang valid. `csv-parse` dan PDFKit tidak menjadi dependency baseline.

### F-05 — Finding anomali lama setelah sesi direvisi
**Status:** ditangani di v4.
Ketika Tutor merevisi payload, finding dari payload sebelumnya ditandai `superseded`, status analisis di-reset ke `pending`, lalu payload baru dianalisis. `superseded` bukan keputusan manual Admin dan ditambahkan secara eksplisit ke enum `review_status`. Metadata review pada record sesi dibersihkan karena baseline hanya menyimpan keputusan untuk payload saat ini; full audit trail masih future/P1.


### F-06 — Riwayat temuan v4: filter status ekspor belum diputuskan
**Status:** ditangani di final pass.
PRD dan Project Context kini menyebut semua status review sebagai *working default* di semua bagian, bukan keputusan owner. Tetap perlu konfirmasi sebelum live export.

### F-07 — UI menjanjikan riwayat ekspor, tetapi API tidak punya endpoint pembacaan
**Status:** ditangani di final pass.
Ditambahkan `GET /admin/reports/google-sheets/attendance/history` dengan filter periode, pagination, status, jumlah row, timestamp, pesan error aman, dan referensi spreadsheet.

### F-08 — Flow anomali menyatakan status proses disimpan pada `anomaly_flags`
**Status:** ditangani di final pass.
User flow kini menyimpan status proses agregat hanya di `lesson_sessions.anomaly_analysis_status`; setiap `anomaly_flags` menyimpan finding dan status review manusia.

### F-09 — Makna `submitted_at` ketika sesi diminta revisi tidak ditentukan
**Status:** ditangani di final pass.
`submitted_at` ditetapkan sebagai waktu submit payload yang saat ini tersimpan dan diperbarui ketika Tutor mengirim revisi. Riwayat submit lama tetap future/P1.

### F-10 — Response export menggunakan `exported_at`, sementara data dictionary memakai `completed_at`
**Status:** ditangani di final pass.
Response ekspor dan histori kini menggunakan `completed_at`, dan `spreadsheet_id` disimpan agar link histori tetap mengarah ke file tujuan yang benar.

### F-11 — Preflight ekspor kosong bertentangan dengan aturan “setiap percobaan membuat log”
**Status:** ditangani di final pass.
Preflight `409 EMPTY_EXPORT_CONFIRMATION_REQUIRED` tidak melakukan write dan tidak boleh meninggalkan row `sheet_export_runs`; bila row provisional dibuat sebelum membaca target Sheets, hapus saat mengembalikan 409. Kegagalan Google API read/write setelah konfigurasi valid dicatat `failed`; konfigurasi target yang belum tersedia menghasilkan 503 sebelum log dibuat. `records_exported` menghitung baris data tanpa header.

### F-12 — Strategi replace report dapat menghapus report lama jika clear dilakukan sebelum write gagal
**Status:** mitigasi ditambahkan.
Dokumen export kini meminta menyiapkan payload dahulu dan mengutamakan `spreadsheets.batchUpdate` atomik untuk menulis data baru sekaligus membersihkan sisa cell A:H. Implementasi harus diuji dengan kegagalan write; jangan clear report lama terlebih dahulu.


### F-13 — Agent Context punya satu kalimat ekspor yang memperlakukan O-08 sebagai keputusan final
**Status:** ditangani pada audit mendalam.
Catatan historis v4; pada v5 semua status review ikut diekspor sesuai keputusan owner.

### F-14 — Istilah autentikasi “token” tidak selaras dengan kontrak server-side session
**Status:** ditangani pada audit mendalam.
`phase-03-backend-foundation.md` dan `docs/03-TECHNICAL-ARCHITECTURE.md` kini menyatakan identitas berasal dari session terautentikasi berbasis cookie, bukan bearer/JWT token sebagai kontrak baseline.

### F-15 — Field revisi dan state yang dapat direview belum eksplisit di API contract
**Status:** ditangani pada audit mendalam.
`PATCH /tutor/me/attendance/:id` kini mendaftar field yang boleh direvisi dan validasi ownership assignment. Endpoint keputusan Admin hanya menerima sesi `pending`; `approved` dan `rejected` terminal, sedangkan `revision_requested` menunggu revisi Tutor.

### F-16 — Batas hard-validation durasi bercampur dengan klasifikasi outlier
**Status:** ditandai sebagai keputusan terbuka, bukan ditebak.
Ditambahkan O-12: input durasi harus berupa integer positif; ambang outlier bersifat configurable, tetapi batas maksimum bisnis/hard rejection belum ditetapkan. Agent tidak boleh membuat angka maksimum yang diklaim sebagai aturan UMKM.

### F-17 — Scope field catatan pembelajaran belum dikonfirmasi penuh
**Status:** ditandai sebagai keputusan terbuka, bukan ditebak.
Owner menyetujui `learning_material` untuk development, tetapi `learning_notes` dan `next_focus` sebelumnya berasal dari rekomendasi desain. O-13 sekarang menandai keduanya sebagai optional recommended fields, dan meminta konfirmasi sebelum menganggapnya requirement wajib MVP.


### F-18 — `completed_at` tidak menyatakan nullable saat export masih `running`
**Status:** ditangani pada audit mendalam.
Data dictionary kini menyatakan `completed_at` nullable selama status `running`; API history menggunakan `null` sampai attempt berakhir.

### F-19 — Tabel session store infrastruktur tidak tercantum dalam tugas migrasi fase backend
**Status:** ditangani pada audit mendalam.
Phase 03 kini mewajibkan migration untuk `app_sessions` selain tabel domain, mengikuti `connect-pg-simple` dan environment setup.

### F-20 — Bentuk DTO normalisasi anomaly belum jelas dipisahkan dari raw model output dan tabel finding
**Status:** ditangani pada audit mendalam.
Data Contract kini menjelaskan `examples/anomaly-response.json` sebagai DTO service; `analysis_status` dipetakan ke sesi, hanya finding valid yang disimpan ke `anomaly_flags`, dan `suggested_action` tidak mengeksekusi keputusan otomatis.

### F-21 — Kebijakan tanggal future/backdated belum eksplisit
**Status:** ditandai sebagai keputusan terbuka.
O-14 mencatat default development: tolak tanggal masa depan pada `Asia/Jakarta`, izinkan tanggal lampau untuk pelaporan terlambat. Konfirmasi dengan UMKM sebelum diperlakukan sebagai aturan final.


### F-22 — Master Data CRUD memiliki route tetapi payload dan aturan edit historis terlalu umum
**Status:** ditangani pada audit mendalam.
API Contract kini mendefinisikan minimum body untuk tutor, siswa, parent/student links, mata pelajaran, assignment, dan tarif; juga membedakan status operasional tutor dari akses login. Assignment yang sudah dirujuk sesi tidak boleh mengubah tutor/siswa/mapel; perubahan relasi dibuat sebagai assignment baru. Tarif yang telah dipakai tidak boleh diubah secara retroaktif.


### F-23 — Status approved/rejected terminal belum merupakan keputusan bisnis owner
**Status:** ditandai sebagai pertanyaan O-15.

V4 sebelumnya menetapkan `approved` dan `rejected` terminal, tidak menyediakan endpoint edit field sesi oleh Admin, delete, atau reopen, tetapi owner hanya menetapkan review manual dan status awal pending. Kebijakan koreksi sebelum/ setelah keputusan final belum dikonfirmasi. Tidak ada edit/delete/reopen menjadi working default agar agent tidak mengarang route, bukan keputusan bisnis final. O-15 meminta konfirmasi; jika UMKM membutuhkan koreksi langsung atau pascakeputusan, tambahkan izin, endpoint, state transition, dan audit trail secara eksplisit.

### F-24 — Retry request revisi dapat mengulang efek samping jika response hilang
**Status:** ditangani pada kontrak API.

`PATCH /tutor/me/attendance/:id` kini menetapkan safe retry: jika sesi sudah kembali ke pending dan payload editable cocok dengan request yang diulang, server mengembalikan sesi yang sama tanpa mengubah timestamp atau menjadwalkan anomaly analysis kedua kali. State transition dilakukan secara atomic/conditional; payload atau state yang tidak cocok mendapat `409 SESSION_STATE_CONFLICT`. Testing strategy perlu memverifikasi behavior ini.


## E.1 Matriks cakupan lintas dokumen

| Kontrak | Canonical source | Dokumen yang harus konsisten | Status akhir audit |
|---|---|---|---|
| Role/login/session/CSRF | `docs/04-API-CONTRACT.md` + `docs/14-ERD-AND-DATA-DICTIONARY.md` | `02`, `03`, `11`, `12`, `13`, phase 01/03/04/09 | Konsisten; gunakan server-side session, bukan bearer/JWT sebagai kontrak baseline. |
| Submit form/status/review/revisi | `docs/04-API-CONTRACT.md` + `docs/05-DATA-CONTRACT.md` | `01`, `03`, `06`, `12`, `14`, `15`, phase 03/06/09 | Field revisi dan retry eksplisit; status approved/rejected terminal hanya working default O-15 sampai owner konfirmasi. |
| Honor | `docs/05-DATA-CONTRACT.md` + `docs/14-ERD-AND-DATA-DICTIONARY.md` | `01`, `02`, `03`, `06`, `15`, phase 07/09, seed | Konsisten: Rp50.000/session hanya dummy; semua status review; tidak berarti sudah dibayar. |
| Anomaly | `docs/05-DATA-CONTRACT.md` + `docs/14-ERD-AND-DATA-DICTIONARY.md` | `02`, `03`, `06`, `09`, `12`, `15`, phase 05/06, fixtures | Konsisten: finding terpisah dari status sesi; DTO normalized; human review. Threshold dan provider live tetap belum final. |
| Google Sheets export | `docs/16-GOOGLE-SHEETS-MONTHLY-EXPORT.md` + API contract | `01`, `02`, `03`, `05`, `06`, `09`, `11`, `12`, `15`, `17`, phase 08/09 | Sesuai keputusan v5: semua status review; delapan kolom mentah; on-demand, re-export replace; no submit sync. |
| Design/UX | `docs/07-DESIGN-GUIDELINES.md` + keputusan owner | `01`, `02`, `15`, Project Context, phase 04/09 | Konsisten: semantic tokens sekarang; palet/font/reference final belum diputuskan. |
| Fixtures/seed | `examples/README.md` + `examples/fixture-expectations.md` | phase 02/05/09, data contract, testing | Konsisten: JSON relational seed, CSV hanya fixture; jangan buat import feature baseline. |

## F. Sisa keputusan/risiko yang sengaja belum dianggap kontradiksi terselesaikan

Paket v4 sudah memperjelas titik yang dapat diputuskan dari keputusan owner dan kontrak teknis. Berikut ini masih sengaja dibuka; agent harus menggunakan default sementara yang dicatat, bukan menyamarkannya sebagai requirement final:

- **O-08 — filter row ekspor:** ditutup pada v5; semua status review ikut ekspor.
- **O-09 — requiredness `learning_material`:** working default wajib untuk development; pastikan UX dan API schema tidak diam-diam berubah tanpa keputusan.
- **O-10 — nilai master historis pada re-export:** baseline memakai data Master Data terkini; jika laporan historis harus menampilkan nilai pada saat sesi, perlu snapshot tambahan.
- **O-11 — format target sheet:** default fixture tanggal `DD/MM/YYYY` dan durasi `N menit`; verifikasi dengan spreadsheet asli sebelum live export.
- **O-12 — batas durasi:** input non-positive/non-integer ditolak; batas maksimum/hard reject versus anomali outlier belum disepakati.
- **O-13 — field progres tambahan:** `learning_notes` dan `next_focus` direkomendasikan opsional, belum dikonfirmasi sebagai requirement MVP.
- **Parent ID access-only:** desain memenuhi kebutuhan UX yang dipilih, tetapi satu secret menjadi satu-satunya credential. Randomness, kerahasiaan distribusi, rate limit, rotasi, cookie/session, dan parent-child scope wajib; risiko residual perlu dipahami.
- **O-15 — koreksi absensi oleh Admin:** baseline tidak menyediakan edit field sesi, delete, atau reopen; konfirmasi apakah UMKM membutuhkan workflow koreksi tersebut.
- **Review audit history:** baseline hanya menyimpan keputusan untuk payload terkini. Audit trail lengkap adalah P1, bukan sesuatu yang bisa dibangun dari kolom snapshot saat ini.
- **Durasi/anomali:** batas durasi masih heuristik konfigurasi; tidak ada start/end time sehingga overlap waktu tidak dapat diverifikasi.
- **Live providers:** Google Sheets dan Gemini belum dianggap berhasil sampai credential nyata dan smoke test dilakukan.

Setelah perbaikan final pass dan matriks lintas dokumen, tidak ditemukan konflik dokumenter eksplisit lain yang diketahui dalam static cross-check. Yang tersisa sengaja dicatat sebagai O-09–O-15 atau risiko/limitasi baseline, bukan keputusan yang disembunyikan. Pernyataan ini bukan jaminan bahwa implementasi kode akan benar; audit tidak menjalankan application tests dan belum memverifikasi integrasi live.

## G. Urutan tindakan sebelum delegasi ke coding agent

1. Gunakan paket v4 audited, bukan v3, setelah meninjau perubahan dokumentasi.
1. O-08 ditutup pada v5; O-09 (materi wajib/opsional) dan O-13 (catatan/fokus progres) sebelum finalisasi form; O-10/O-11 sebelum live report; O-12 sebelum menetapkan batas validasi/outlier durasi; O-14 sebelum finalizing date validation; O-15 sebelum menetapkan kebijakan koreksi/delete/reopen sesi sebagai keputusan bisnis final.
3. Implementasikan auth dengan server-side session store, migrasi tabel `app_sessions`, dan alur `GET /auth/csrf`; jangan hanya membuat cookie/header tanpa token bootstrap.
4. Implementasikan route histori ekspor yang dirujuk UI: `GET /admin/reports/google-sheets/attendance/history`.
5. Gunakan endpoint Master Data dengan prefix `/admin` konsisten.
6. Jangan seed database relasional langsung dari `attendance-sample.csv`; gunakan `seed-data.json` dan factories dengan FK valid.
7. Implementasikan replace Google Sheets agar tidak menghapus report lama sebelum payload pengganti siap; gunakan batch update atomik bila memungkinkan.
8. Jangan implementasikan PDF, download CSV, import Sheets, atau auto-sync pada baseline kecuali owner menambahkan scope.
9. Setelah implementasi berubah, perbarui seluruh kontrak yang terdampak beserta fixtures/tests, lalu jalankan checks dan laporkan yang benar-benar lulus.

---

Audit ini tidak menjalankan application tests karena ZIP berisi blueprint dokumentasi, bukan kode aplikasi. Pemeriksaan struktur arsip dan konsistensi dokumen dilakukan statis.
