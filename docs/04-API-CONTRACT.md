# API Contract — v1

Base URL: `/api/v1` pada origin aplikasi (laptop: `http://localhost:3001/api/v1`; UI dan API satu origin). Kontrak ini harus selaras dengan shared Zod schemas di `packages/contracts/`.

## 1. Konvensi umum

- JSON memakai `snake_case`.
- Identifier internal adalah UUID. `no` pada tampilan/ekspor adalah nomor urut, bukan ID.
- `lesson_date`: `YYYY-MM-DD`; timestamp: ISO 8601/timestamptz; periode bulanan: `YYYY-MM`.
- `duration_minutes`: integer menit.
- Nominal honor dihitung di backend dan dikembalikan sebagai string desimal/format uang; frontend tidak menghitung ulang.
- Autentikasi browser menggunakan session cookie `HttpOnly`, `SameSite=Lax`, `Secure` pada production. Cookie/session tidak dikirim sebagai field response dan tidak disimpan di localStorage.
- Axios memakai `withCredentials: true`. Backend membatasi CORS ke `FRONTEND_ORIGIN`, memeriksa Origin pada operasi mutasi, dan menerapkan synchronizer-token CSRF (`GET /auth/csrf`, header `X-CSRF-Token`) pada semua request state-changing termasuk login.
- Role guard di backend: `admin`, `tutor`, `parent`. Menyembunyikan menu bukan kontrol keamanan.
- Kode akses orang tua adalah credential rahasia, bukan public ID. Endpoint akses diberi rate limit dan pesan gagal generik.
- Error codes: `400` request tidak dapat diproses, `401` kredensial/session tidak valid, `403` role atau scope tidak punya akses, `404` data tidak ditemukan, `409` konflik state/idempotency atau `EMPTY_EXPORT_CONFIRMATION_REQUIRED`, `422` validasi gagal, `429` rate limit, `500` error internal aman, `503` integrasi eksternal belum siap/gagal.
- Bentuk body error seragam: `{ "error": { "code": "SNAKE_UPPER_CODE", "message": "Pesan aman untuk user", "details": [ { "field": "lesson_date", "message": "..." } ] } }`. `details` opsional dan dipakai untuk `422` validasi Zod (per field). Contoh `code`: `VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `CSRF_INVALID`, `NOT_FOUND`, `CONFLICT` (data unik/overlap, mis. username dipakai atau periode tarif overlap; `details[].field` menunjuk field terkait), `RATE_LIMITED`, `SESSION_STATE_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `EMPTY_EXPORT_CONFIRMATION_REQUIRED`, `INTEGRATION_UNAVAILABLE`, `INTERNAL_ERROR`. Jangan menyertakan stack trace, SQL, atau detail credential.
- Token CSRF hilang/tidak cocok atau `Origin` tidak diizinkan → `403` dengan `code: "CSRF_INVALID"`.
- Session memakai idle timeout yang dapat dikonfigurasi (`SESSION_IDLE_TIMEOUT_MINUTES`, default development 480 menit). Rate limit login/parent-access dapat dikonfigurasi (`AUTH_RATE_LIMIT_MAX` percobaan per `AUTH_RATE_LIMIT_WINDOW_MINUTES`, default development 5 per 15 menit) per IP dan identifier; nilai ini default teknis, bukan kebijakan bisnis final.

## 2. Health dan autentikasi

### `GET /health`

Publik. `200`: `{ "status": "ok" }`.

### `GET /auth/csrf`

Publik dan dipanggil saat aplikasi mulai mempersiapkan login. Set header `Cache-Control: no-store`. Backend memastikan anonymous session tersedia, membuat token acak synchronizer yang disimpan pada server-side session bila belum ada, lalu mengembalikan `{ "csrf_token": "..." }`. Frontend menyimpan token hanya di memory dan mengirimkannya pada header `X-CSRF-Token` untuk `POST`, `PATCH`, `PUT`, dan `DELETE`.

`POST /auth/login` dan `POST /auth/parent-access` juga wajib melewati validasi CSRF token dari anonymous session serta pemeriksaan `Origin`. Setelah login berhasil, backend meregenerasi session ID, membuat token CSRF baru yang terikat ke authenticated session, lalu mengembalikan `csrf_token` baru bersama `user`. Frontend mengganti token lama. Logout dan semua mutasi terproteksi memerlukan token dari session aktif. Gunakan constant-time comparison saat memvalidasi token; jangan log token.

### Session storage default

Gunakan server-side session dengan cookie opaque dan PostgreSQL-backed session store. Jangan memakai Express `MemoryStore` pada deployment. `SESSION_SECRET` menandatangani session cookie; data session disimpan pada tabel store infrastruktur terpisah dari ERD domain. Detail session store harus ditambahkan ke setup/README implementasi.

### `POST /auth/login`

Untuk Admin dan Tutor, memakai username + password.

Request:

```json
{ "username": "farhan", "password": "password-lokal" }
```

Success `200`: server meregenerasi session ID, memasang session cookie baru, dan response mengembalikan data pengguna non-rahasia serta CSRF token baru:

```json
{
  "user": {
    "id": "uuid",
    "full_name": "Farhan",
    "role": "tutor"
  },
  "csrf_token": "token-baru-yang-terikat-ke-session-authenticated"
}
```

Jangan mengembalikan `password_hash` atau session secret. Jangan membocorkan apakah username atau password yang salah melalui pesan error yang berbeda.

### `POST /auth/parent-access`

Untuk Orang Tua/Wali. Login hanya dengan satu ID Akses Orang Tua, tanpa username/password.

Request:

```json
{ "access_code": "kode-akses-acak-rahasia" }
```

Server memvalidasi CSRF dari anonymous session dan Origin, menghitung digest kode, mencari akun parent aktif, lalu meregenerasi session ID dan memasang session cookie baru. Response memuat profil/role non-rahasia dan `csrf_token` baru yang terikat pada authenticated session. Kode harus acak, tidak dapat ditebak, dan berbeda dari UUID siswa, NPM publik, nomor telepon, atau nomor berurutan. Batasi percobaan gagal per IP dan identifier digest; gunakan respons error generik. Kode mentah tidak boleh masuk log.

Format kode akses baseline: minimal 128 bit dari CSPRNG (`crypto.randomBytes`), di-encode base32 Crockford uppercase dan dikelompokkan dengan tanda hubung agar mudah disalin (misalnya `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-X`). Sebelum HMAC-SHA-256 dengan `PARENT_ACCESS_CODE_PEPPER`, input dinormalisasi: trim, uppercase, hapus spasi dan tanda hubung. Fixture `MUMTAZ-DEMO-PARENT-ACCESS-ONLY` di `examples/seed-data.json` hanya untuk test/dev lokal dan tidak memenuhi format produksi.

### `POST /auth/logout`

Memerlukan sesi valid dan CSRF check. Hapus/expire cookie session.

### `GET /auth/me`

Mengembalikan identitas user dari session aktif. Jangan mengirim hash password/kode akses. Untuk Tutor, response boleh menyertakan `username` dan `phone` agar tab Profil dapat ditampilkan read-only.

### `PATCH /tutor/me/password`

Tutor only; memerlukan session valid dan CSRF. Dipakai tab Profil Tutor.

Request:

```json
{ "current_password": "password-lama", "new_password": "password-baru" }
```

Backend memverifikasi `current_password` terhadap hash, memvalidasi `new_password` (panjang minimal dikonfigurasi; berbeda dari password lama), menyimpan hash Argon2id baru, meregenerasi session ID, dan mengembalikan `200` `{ "csrf_token": "..." }` baru. Password lama salah → `401` generik; validasi gagal → `422`. Endpoint diberi rate limit seperti login. Jangan pernah log password. Reset password oleh Admin belum termasuk baseline (O-16).

### Kode akses Orang Tua — administrasi Admin

- `POST /admin/parents` membuat profil parent dan relasi `parent_students`; membuat kode akses acak.
- `POST /admin/parents/:id/rotate-access-code` menonaktifkan kode lama dan membuat kode baru.
- Kode mentah hanya dikembalikan sekali pada respons saat pembuatan/rotasi agar Admin dapat menyampaikannya secara privat. UI harus memperingatkan untuk menyalin dan menyimpan kode dengan aman; jangan menampilkannya kembali setelah modal ditutup.
- Simpan digest berkunci, bukan kode mentah. Jangan kirim email/SMS otomatis kecuali kanal tersebut memang dibangun dan disetujui.

## 3. Ringkasan dashboard

### `GET /admin/dashboard/summary?period=2026-10`

Admin only. Mengembalikan total tutor/siswa aktif, sesi untuk periode, status review, jumlah anomaly finding pending review, dan estimasi honor dari sesi approved (`honor: { estimated_amount }`, tarif tunggal per sesi — D-24). Jangan menampilkan pemasukan bisnis tanpa sumber data pemasukan.

### `GET /tutor/dashboard/summary?period=2026-10`

Tutor only. Hanya untuk tutor dari session: jumlah sesi per status dan estimasi honor sesi approved miliknya.

### `GET /parent/dashboard/summary?student_id=<uuid>&period=2026-10`

Parent only. Backend memvalidasi hubungan `parent_students`. Ringkasan hanya berisi data siswa yang terhubung dan sesi berstatus `approved` (tidak ada status `published` pada baseline).

## 4. Master Data (Admin only kecuali read options sesuai role)

- `GET|POST /admin/tutors`, `GET|PATCH /admin/tutors/:id`
- `GET|POST /admin/students`, `GET|PATCH /admin/students/:id`
- `GET /admin/parents`, `POST /admin/parents`, `GET|PATCH /admin/parents/:id`
- `POST /admin/parents/:id/rotate-access-code`
- `GET|POST /admin/subjects`, `GET|PATCH /admin/subjects/:id`
- `POST /admin/tutors/:id/reset-password` — password sementara acak baru (sekali tampil); password lama dan semua session tutor dicabut.
- `GET /tutor/attendance-options` — murid & mata pelajaran aktif yang dipilih Tutor di Form Absensi (tanpa penugasan, D-24).
- `GET /parent/me/students` — hanya siswa yang terhubung ke akun parent.

Pembuatan tutor oleh Admin hanya mengisi nama + username (+ telepon). Sistem membuat **password sementara acak** (12 karakter, CSPRNG) yang dikembalikan SEKALI di respons `201`/reset dengan `Cache-Control: no-store`; yang disimpan hanya hash Argon2id. Admin menyampaikannya ke tutor secara privat; tutor menggantinya sendiri di Profil (`PATCH /tutor/me/password`). Tutor lupa password → `POST /admin/tutors/:id/reset-password` (password lama dan session aktif dicabut). Jangan menulis password ke log.

Gunakan soft deactivation (`is_active`) untuk data yang sudah direferensikan. Jangan hard-delete tutor/siswa/mapel jika telah memiliki sesi.

### Kontrak request Master Data

Semua route di bawah ini Admin-only kecuali route options yang secara eksplisit ditujukan ke role lain. Body memakai `snake_case`, backend memvalidasi dengan Zod, create mengembalikan `201`, detail/list/update mengembalikan `200`. Untuk list, gunakan `{ items, page, page_size, total }`, dengan default `page=1`, `page_size=20`, dan batas maksimum `page_size=100`; gunakan `search` untuk pencarian bila sesuai entitas. `PATCH` hanya mengubah field yang dikirim; unknown fields ditolak. Entitas yang memiliki riwayat tidak boleh hard-delete.

| Endpoint | Body `POST` / field yang boleh diubah pada `PATCH` | Aturan historis/keamanan |
|---|---|---|
| `/admin/tutors` | `POST`: `{ full_name, username, phone? }` → `201 { tutor, temporary_password }`. | Password dibuat sistem dan hanya tampil sekali; hash saja yang disimpan. Satu transaksi membuat `users` role tutor + `tutors`. `initial_password` dari body ditolak (`422`). |
| `/admin/tutors/:id/reset-password` | `POST` tanpa body → `200 { tutor, temporary_password }`. | Mengganti hash, menaikkan `credential_version` (mencabut session tutor). Hanya Admin. |
| `/admin/tutors/:id` | `PATCH`: `full_name?`, `username?`, `phone?`, `is_active?`, `login_active?`. | `is_active` mengatur status operasional `tutors`; `login_active` mengatur `users.is_active`. Tutor bisa tetap login untuk melihat histori jika profil operasional dinonaktifkan tetapi `login_active=true`. |
| `/admin/students` | `POST`: `{ full_name, grade, school_name }`. | `is_active` default true; data yang direferensikan sesi tidak dihapus. |
| `/admin/students/:id` | `PATCH`: `full_name?`, `grade?`, `school_name?`, `is_active?`. | Menonaktifkan siswa menghilangkannya dari pilihan Form Absensi; tidak menghapus histori approved yang dapat dilihat wali terhubung. |
| `/admin/parents` | `POST`: `{ full_name, email?, student_links: [{ student_id, relationship }] }`. | Buat `users` role parent + `parent_students` dalam transaksi; response mengembalikan access code mentah satu kali saja. |
| `/admin/parents/:id` | `PATCH`: `full_name?`, `email?`, `is_active?`, `student_links?`. | `is_active` mengatur login parent. Jika `student_links` dikirim, itu mengganti seluruh relasi dalam satu transaksi; jika tidak dikirim, relasi tidak berubah. Jangan pernah return code/hash lama. |
| `/admin/parents/:id/rotate-access-code` | Body kosong. | Nonaktifkan kode lama, generate kode acak baru, simpan digest, kembalikan kode mentah hanya sekali. |
| `/admin/subjects` | `POST`: `{ name }`. | Nama harus unik; `is_active` default true. |
| `/admin/subjects/:id` | `PATCH`: `name?`, `is_active?`. | Jangan hard-delete mapel yang telah dirujuk sesi. |

`student_links` harus mengacu pada siswa yang valid; kode akses parent tetap satu credential rahasia per akun. Jika endpoint/field di atas berubah, update shared Zod contracts, API tests, ERD, dan UI bersama-sama.

## 5. Submit, list, dan review absensi

### `POST /tutor/attendance`

Tutor only. Backend menentukan tutor dari session dan memvalidasi murid & mata pelajaran yang dipilih (ada dan aktif; tanpa penugasan, D-24). `lesson_date` memakai tanggal lokal sesi dalam format `YYYY-MM-DD`; working default O-14 menolak tanggal masa depan menurut `Asia/Jakarta` tetapi menerima tanggal lampau untuk pelaporan terlambat. Kebijakan ini masih provisional, bukan aturan resmi UMKM.

Request contoh:

```json
{
  "client_submission_id": "uuid-stabil-untuk-retry-request",
  "student_id": "uuid",
  "subject_id": "uuid",
  "lesson_date": "2026-10-17",
  "duration_minutes": 90,
  "learning_material": "Persamaan linear satu variabel",
  "learning_notes": "Siswa memahami persamaan sederhana, masih perlu latihan soal cerita.",
  "next_focus": "Latihan soal cerita bertahap."
}
```

`201`: sesi tersimpan dengan `status: "pending"`, `anomaly_analysis_status: "pending"`, `submitted_at`, dan ID sesi. `client_submission_id` adalah UUID idempotency yang dibuat frontend sekali per submit dan digunakan ulang untuk retry; backend menyimpan unique key tersebut dan mengembalikan sesi yang sama untuk retry identik. Key yang sama dengan body berbeda harus menghasilkan `409`. `tutor_id`, status, tarif dan nama dari master tidak diterima dari body sebagai sumber kebenaran.

Setelah commit DB, anomaly screening berjalan asynchronous; response `201` dapat mengembalikan `anomaly_analysis_status: "pending"`. Proses harus menangkap error, memperbarui status agregat menjadi `completed`/`failed`/`not_evaluated`, dan pada startup memulihkan sesi yang masih `pending` untuk analisis. Analisis tidak boleh menghapus/mengubah status sesi. Jika provider AI gagal, record tetap tersimpan dan submit tetap dianggap tersimpan.

### `GET /admin/attendance?period=2026-10&tutor_id=&student_id=&subject_id=&status=&anomaly_status=&search=&page=1&page_size=20`

Admin only. Periode memakai `lesson_date`; response ter-paginasi `{ items, page, page_size, total }`. Item memuat delapan kolom inti, status review, status analisis anomali dan temuan ringkas.

### `GET /admin/attendance/:id`

Admin only. Detail sesi, materi/catatan, identitas tutor/siswa, status, anomaly findings, serta **keputusan review terakhir**. Baseline hanya menyimpan status/decision terakhir; full review audit history belum termasuk MVP (P1).

### `GET /tutor/me/attendance?period=2026-10&status=&page=1&page_size=20`

Tutor only. Backend mengambil tutor dari session, bukan dari query yang dikirim client.

### `PATCH /tutor/me/attendance/:id`

Tutor only; hanya jika sesi milik tutor itu berstatus `revision_requested`. Field revisi yang diizinkan adalah `student_id` dan `subject_id` (murid/mapel aktif; Tutor boleh memperbaiki pilihan yang salah), `lesson_date`, `duration_minutes`, `learning_material`, `learning_notes`, dan `next_focus`. Sesi tutor lain tidak dapat dibuka atau diambil alih (`404`). Identitas tutor, status, tarif/snapshot, catatan admin, dan metadata review tidak dapat diubah dari payload Tutor. Setelah resubmit record yang sama kembali ke `pending` dan `submitted_at` diperbarui ke waktu pengiriman payload terbaru; kosongkan `reviewed_by_user_id`, `reviewed_at`, dan `admin_note` karena metadata review baseline hanya berlaku untuk payload saat ini (riwayat review penuh tidak disimpan pada MVP). Reset `anomaly_analysis_status` ke `pending`, tandai finding dari payload lama `superseded` dengan `review_note="superseded_by_revision"`, lalu jadwalkan analisis ulang satu kali. Untuk retry setelah respons hilang: jika sesi sudah `pending` dan semua field editable sama dengan payload yang baru saja diterima, kembalikan `200` untuk record yang sama tanpa mengubah timestamp atau menjadwalkan analisis ulang; jika state/payload tidak cocok, kembalikan `409 SESSION_STATE_CONFLICT`. Terapkan perubahan status secara atomik/conditional di database.

> **D-25 (revisi PM, Stand Up #6):** keputusan review per baris oleh Admin dihapus. `PATCH /admin/attendance/:id/decision` dan `PATCH /admin/anomalies/:id/review` tidak ada lagi. Validitas data dilabeli AI dan dapat dikoreksi Admin; Admin juga mendapat CRUD penuh atas sesi. Lihat "Detail implementasi D-25" di bawah.

## 6. Riwayat pembelajaran Orang Tua

### `GET /parent/me/students`

Parent only. Mengembalikan siswa yang terhubung ke akun login melalui `parent_students`.

### `GET /parent/students/:student_id/progress?period=2026-10`

Parent only. Backend memeriksa relasi parent-child setiap request. Hanya kembalikan sesi approved dan materi/catatan yang diperbolehkan tampil: tanggal, tutor, mapel, durasi, `learning_material`, `learning_notes`, dan `next_focus` bila ada. Jangan mengembalikan `admin_note`, anomaly flag internal, tarif/honor, kode akses, ataupun siswa lain.

## 7. Rekap dan Honor

### `GET /admin/billing?period=2026-10&student_id=`

Admin only. Menggantikan `GET /admin/recap` (D-25): tagihan orang tua per murid. Lihat "Detail implementasi D-25 — Penagihan Orang Tua".

### `GET /admin/payroll/preview?period=2026-10`

Admin only. Per tutor: `counted_sessions`, `not_counted_sessions`, `gross_amount` (subtotal tarif les), `admin_fee_amount` (potongan Admin), `net_amount` (pendapatan bersih tutor), dan rincian sesi (`gross_amount`/`admin_fee`/`net_amount` per sesi). `totals`: `gross_amount` (pendapatan kotor), `admin_fee_amount` (pendapatan bersih bimbel), `net_amount` (gaji yang harus dibayarkan). Nominal dari snapshot yang dikunci saat sesi dihitung (D-25). Jangan menampilkan status sudah dibayar tanpa fitur payment tracking.

### `GET /tutor/me/payroll?period=2026-10`

Tutor only. Perhitungan yang sama, terbatas ke tutor login, dan HANYA nominal bersih (`TutorPayrollResponse`: `counted_sessions`, `not_counted_sessions`, `net_amount`, sesi dengan `net_amount`). Tarif kotor dan potongan Admin tidak pernah dikirim ke Tutor (D-25). `GET /tutor/dashboard/summary` → `honor.estimated_amount` = pendapatan bersih.

## 8. Ekspor laporan ke Google Sheets

### `GET /admin/reports/google-sheets/attendance/history?period=2026-10&page=1&page_size=20`

Admin only. Mengembalikan riwayat ekspor absensi dari `sheet_export_runs`, diurutkan `started_at DESC`, dengan pagination. `period` opsional untuk memfilter bulan; bila diisi gunakan format `YYYY-MM`. `completed_at` bernilai `null` selama status `running` dan terisi saat attempt selesai. Jangan mengembalikan credential atau stack trace.

Response contoh:

```json
{
  "items": [{"id": "uuid", "period": "2026-10", "spreadsheet_id": "configured-spreadsheet-id", "spreadsheet_url": "https://docs.google.com/spreadsheets/d/configured-spreadsheet-id/edit", "sheet_title": "Absensi 2026-10", "records_exported": 42, "status": "succeeded", "safe_error_message": null, "started_at": "2026-11-01T03:00:00Z", "completed_at": "2026-11-01T03:00:02Z"}],
  "page": 1, "page_size": 20, "total": 1
}
```

### `POST /admin/reports/google-sheets/attendance`

Admin only. Ekspor bulanan on-demand; tidak dipanggil saat submit tutor.

Request:

```json
{ "period": "2026-10", "confirm_empty_replace": false }
```

`confirm_empty_replace` opsional dan default `false`. Behavior:
1. Validasi `period`.
2. Query Neon berdasarkan `lesson_date`. **Query semua sesi berdasarkan `lesson_date` pada periode terpilih tanpa memfilter status review.**
3. Mapping **hanya delapan kolom mentah**: `no`, `nama tutor`, `nama murid`, `kelas`, `asal sekolah`, `mata pelajaran`, `tanggal les`, `durasi les`.
4. Materi, catatan pembelajaran, status, anomaly, ID internal, dan honor tidak ikut ekspor standar.
5. Pastikan tab `Absensi YYYY-MM` tersedia; tulis ulang report periode tersebut, jangan append. Urutkan stabil: `lesson_date ASC`, nama tutor, nama murid, mata pelajaran, lalu `lesson_sessions.id` sebagai tie-breaker; bangun ulang `no` dari 1..N.
6. Jika hasil query kosong dan tab target sudah berisi laporan, kembalikan `409 EMPTY_EXPORT_CONFIRMATION_REQUIRED` tanpa mengubah tab. Ini adalah preflight/confirmation response, bukan export run yang disimpan: response 409 tidak boleh meninggalkan row `sheet_export_runs`. UI minta konfirmasi eksplisit; pengulangan request dengan `confirm_empty_replace: true` baru boleh mengganti isi tab dengan header saja. Jika row log sementara sudah dibuat untuk merekam Google API preflight, hapus row tersebut sebelum mengembalikan 409.
7. Setelah authorization, validasi periode, query Neon, dan pemeriksaan konfigurasi awal selesai, buat satu row `sheet_export_runs` status `running` sebelum Google Sheets preflight/read/write. Jika Google API preflight/read atau write gagal, ubah menjadi `failed`; jika berhasil, ubah menjadi `succeeded`. Simpan `spreadsheet_id` tujuan yang valid. `records_exported` menghitung baris data yang berhasil ditulis tanpa header (0 jika write tidak berhasil). Respons 409 tetap tidak meninggalkan row log. Jika konfigurasi/spreadsheet ID belum tersedia, kembalikan error `503` sebelum membuat run karena belum ada tujuan ekspor valid. Retry setelah kegagalan membuat row percobaan baru.

Success `200` contoh:

```json
{
  "export": {
    "id": "uuid",
    "period": "2026-10",
    "spreadsheet_id": "configured-spreadsheet-id",
    "spreadsheet_url": "https://docs.google.com/spreadsheets/d/configured-spreadsheet-id/edit",
    "sheet_title": "Absensi 2026-10",
    "records_exported": 42,
    "status": "succeeded",
    "completed_at": "2026-11-01T03:00:02Z"
  }
}
```

Jika credential/API belum siap atau write gagal, kembalikan error terstruktur/`503` yang sesuai dan jangan tampilkan sukses palsu. Data Neon tetap utuh. Re-export bulan sama memperbarui tab, tidak menambah duplikasi. Jika sesi berubah setelah ekspor (misalnya pending menjadi approved), Admin perlu mengekspor ulang periode yang sama untuk memperbarui snapshot.

## 9. Kontrak frontend

- Semua HTTP request browser ke Express memakai Axios instance terpusat dengan `withCredentials: true`.
- Feature API functions dipanggil melalui TanStack Query; jangan menaruh request langsung dalam komponen UI.
- Jangan menyimpan session credential di localStorage. Ikuti mekanisme cookie + CSRF di bagian konvensi.
- Query key memasukkan role/entitas/filter/periode yang relevan agar cache tidak bocor antar user; reset query cache saat logout/pergantian akun.
- Form memakai React Hook Form + Zod jika sesuai; backend tetap melakukan validasi otoritatif.
- Mock API/export/anomaly harus berlabel mock. Jangan melaporkan integrasi live sebelum smoke test credential valid.

## 10. Implementasi shared schema (`@mumtaz/contracts`, Phase 02)

Schema Zod di `packages/contracts/src/` adalah bentuk implementasi kontrak ini. Detail teknis yang tidak ditentukan dokumen di atas memakai default berikut; semuanya **default teknis/provisional**, bukan aturan bisnis UMKM:

- Request body memakai object strict: field tak dikenal (mis. `tutor_id`, `status` pada submit) ditolak `422`.
- `duration_minutes`: integer positif dengan batas atas teknis 1440 menit (24 jam) sebagai guard nilai absurd; batas bisnis tetap terbuka (O-12).
- `learning_material` wajib, maks 255 karakter (O-09); `learning_notes`/`next_focus` opsional, maks 5000, string kosong dinormalisasi ke `null` (O-13).
- `new_password` minimal 8 karakter; backend boleh menaikkan batas ini.
- `review_note` wajib pada `PATCH /admin/anomalies/:id/review`.
- Nominal uang (`rate_amount`, `estimated_amount`, dll.) selalu string desimal.
- Payroll preview per tutor memuat `rate_lines` (nilai tarif snapshot, jumlah sesi, subtotal, `session_ids`) agar nominal dapat ditelusuri, serta `approved_sessions_without_rate` untuk warning tarif kosong.
- Fixture test-only tersedia di subpath `@mumtaz/contracts/fixtures` dan tidak boleh diimpor kode runtime production.

### Detail implementasi Phase 03

- `POST /auth/logout` → `204` tanpa body; cookie session dihapus.
- `GET /parent/me/students` → `{ "items": [...] }` (tanpa pagination; jumlahnya kecil). `GET /tutor/attendance-options` → `{ students: [...], subjects: [...] }`.
- `PATCH /tutor/me/attendance/:id` → `200 { "session": TutorSession }`.
- `POST /tutor/attendance` retry identik mengembalikan `201` dengan sesi yang sama (status terkini); key sama dari tutor lain atau payload berbeda → `409 IDEMPOTENCY_CONFLICT`.
- Murid/mata pelajaran tidak ada atau nonaktif → `422` pada field `student_id`/`subject_id`; tanggal masa depan → `422` pada `lesson_date`. Profil tutor nonaktif → `403`.
- Sesi tutor lain pada `PATCH /tutor/me/attendance/:id` → `404`. Anak yang tidak terhubung pada endpoint parent → `403`.
- Rate limit hanya menghitung percobaan gagal: login per IP dan per username; parent-access per IP dan per IP+kode (di-hash); ganti password per akun. Store in-memory (satu instance); scale-out butuh store bersama.
- `TRUST_PROXY` (default `0`) menentukan apakah `X-Forwarded-For` dipercaya untuk IP rate limit.

### Detail implementasi Phase 05 — modul anomali

- Alur: submit/revisi commit → worker in-process (`AnomalyWorker`) → candidate generator deterministik → detektor (Gemini) → `anomaly_flags`. Respons submit tidak menunggu analisis. Startup melanjutkan sesi `anomaly_analysis_status='pending'`.
- Candidate generator (heuristik demo, O-03 terbuka): `suspected_duplicate` bila tutor+murid+mapel+tanggal+durasi sama dengan sesi yang disubmit lebih awal, atau murid+mapel+tanggal sama dicatat tutor lain; `duration_outlier` bila durasi > `ANOMALY_DURATION_OUTLIER_MINUTES`. Pembanding dibatasi ±7 hari untuk tutor/siswa yang sama (maks. 30 dikirim ke model).
- Status analisis ditetapkan backend: provider tidak dikonfigurasi → `not_evaluated`; provider dipanggil lalu timeout (`ANOMALY_PROVIDER_TIMEOUT_MS`)/error/output tidak valid → `failed`; selesai → `completed`. Bila rule engine tidak menemukan kandidat, screening dinyatakan `completed` tanpa memanggil model.
- Payload ke Gemini dipseudonimkan (alias S/A/T/P/M, tanggal, durasi); tanpa nama, materi/catatan, kontak, atau kode akses. Output divalidasi Zod secara ketat: setiap kandidat wajib diklasifikasikan, referensi tak dikenal → `failed` (tidak ada hasil parsial). Error transien 429/5xx di-retry sekali dalam batas waktu yang sama.
- Hasil ditulis kondisional terhadap payload yang dianalisis; revisi di tengah analisis membuat hasil lama dibuang.
- `PATCH /admin/anomalies/:id/review` → `200 AnomalyFinding`. Body `{ review_status: confirmed_anomaly|false_positive|resolved, review_note }` (note wajib). Temuan `superseded` → `409 SESSION_STATE_CONFLICT`. Tidak mengubah `lesson_sessions.status` atau honor.

### Detail implementasi Phase 06 — submission & review end-to-end

- `GET /tutor/me/attendance` menerima `student_id` (filter siswa, docs/15 §3.3); tetap dibatasi ke sesi milik tutor login.
- Batas atas durasi submit/revisi dapat dikonfigurasi lewat `ATTENDANCE_MAX_DURATION_MINUTES` (default 1440 = batas teknis kontrak). Melebihi batas → `422` field `duration_minutes`. Ini konfigurasi teknis, bukan aturan UMKM (O-12); durasi di atas `ANOMALY_DURATION_OUTLIER_MINUTES` tetap diterima dan hanya menjadi finding.
- UI Tutor: detail sesi (waktu submit/verifikasi, alasan revisi/penolakan) dan form revisi untuk sesi `revision_requested` (`PATCH /tutor/me/attendance/:id`). Temuan anomali tidak ditampilkan ke Tutor.
- UI Admin: status analisis **tidak ditampilkan** (keputusan owner) — Admin cukup melihat temuan anomali. `anomaly_analysis_status` tetap dipakai backend (resume worker, filter API `anomaly_status`) dan frontend memperbarui daftar/detail otomatis (polling 5 detik) selama ada analisis `pending` agar temuan baru muncul tanpa reload.

### Detail implementasi Phase 07 — rekap & honor

- `GET /admin/payroll/preview` dan `GET /tutor/me/payroll` (service sama, scope sesuai role): setiap tutor membawa `sessions[]` — semua sesi tutor pada periode (`lesson_date`), urut tanggal, dengan `status`, `rate_amount` dari snapshot, `amount`, dan `counted`. Hanya sesi `approved` dengan snapshot tarif yang `counted=true`; Σ `amount` sesi `counted` = `estimated_amount` (dapat ditelusuri). Konsep tarif demo dihapus (D-22/D-24).
- `GET /admin/recap` menambah `totals` (jumlah per status + durasi approved untuk seluruh periode), dihitung backend.
- `GET /admin/dashboard/summary` & `GET /tutor/dashboard/summary`: `honor` = `{ estimated_amount }`.

### Detail implementasi Phase 08 — ekspor Google Sheets bulanan

- `POST /admin/reports/google-sheets/attendance` (Admin, CSRF) body `{ period, confirm_empty_replace? }` → `200 SheetExportResponse`. Baris = SEMUA sesi dengan `lesson_date` di periode (O-08), delapan kolom, urut tanggal → tutor → murid → mapel; `no` 1..N.
- Integrasi belum dikonfigurasi (`GOOGLE_SHEETS_EXPORT_ENABLED`/spreadsheet id/key file) → `503 INTEGRATION_UNAVAILABLE` tanpa membuat run (tidak ada sukses palsu).
- Kunci per periode: partial unique index `sheet_export_runs_one_running_per_period` (satu run `running` per `report_type+period`) → ekspor bersamaan `409 CONFLICT`. Run `running` > 10 menit (proses mati) ditandai `failed` saat startup dan sebelum ekspor berikutnya.
- Periode kosong + tab berisi tanpa `confirm_empty_replace=true` → `409 EMPTY_EXPORT_CONFIRMATION_REQUIRED`, tidak menulis dan tidak meninggalkan run. Periode kosong + tab belum ada → tab header saja.
- Penulisan atomik: satu `spreadsheets.batchUpdate` (addSheet dengan `sheetId` deterministik bila tab baru, header + data, sisa baris lama ditimpa sel kosong). Laporan lama tidak dikosongkan lebih dulu, sehingga kegagalan meninggalkan tab utuh. Hanya tab berpola `Absensi YYYY-MM` yang disentuh. Tanggal/durasi ditulis sebagai teks.
- Error Google dipetakan ke pesan aman (403 akses, 404 spreadsheet, 429 kuota, timeout `GOOGLE_SHEETS_TIMEOUT_MS`) → run `failed` + `503`; data Neon tidak berubah.
- `GET /admin/reports/google-sheets/attendance/history?period=&page=&page_size=` → `Paginated<SheetExportRun>` terbaru dulu, termasuk `safe_error_message`; tanpa credential.
- Submit Tutor tidak pernah memanggil Sheets (diuji).

### Detail implementasi D-24 — tanpa penugasan & tarif per penugasan

- Endpoint `/admin/tutor-assignments*`, `/admin/tutor-rates*`, dan `GET /tutor/me/assignments` dihapus. Tutor memilih murid dan mata pelajaran sendiri lewat `GET /tutor/attendance-options` (semua murid & mapel aktif).
- `POST /tutor/attendance` dan `PATCH /tutor/me/attendance/:id` memakai `student_id` + `subject_id` menggantikan `assignment_id`. Respons sesi memuat `tutor_id/student_id/subject_id` langsung (tanpa `assignment_id`).
- Honor (digantikan D-25): tarif tunggal `HONOR_RATE_PER_SESSION` (default 50000) dikunci ke `rate_amount_snapshot` saat approve; mengganti konfigurasi tidak mengubah sesi yang sudah disetujui. Field `is_demo_assumption`/`rate_type` dihapus dari kontrak payroll dan dashboard.
- `POST /admin/tutors` tanpa `initial_password` → `{ tutor, temporary_password }` (sekali tampil); `POST /admin/tutors/:id/reset-password` baru.
- Candidate anomali: sinyal `same_tutor_student_subject_date_duration` menggantikan `same_assignment_date_duration`.

### Detail implementasi D-25 — validitas AI, jam les, multi-mapel, CRUD Admin

- **Payload sesi** (`POST /tutor/attendance`, `PATCH /tutor/me/attendance/:id`, `POST/PUT /admin/attendance`): `subject_ids` (1–3 mapel unik, tarif tetap per sesi), `start_time` + `end_time` (`HH:MM`, WIB, selesai > mulai pada hari yang sama). `duration_minutes` TIDAK diterima dari body; backend menghitungnya dari jam. `subject_id` tunggal ditolak.
- **Respons sesi**: `subject_ids`, `subject_name` (nama digabung koma, urut abjad), `start_time`/`end_time` (`null` untuk sesi lama), `validity` (`valid|needs_revision|rejected|null`), `approval_status` (`pending|approved|rejected`, hanya untuk `needs_revision`), `validity_reason`.
- **Validitas** (setelah commit, asynchronous): rule engine membentuk kandidat (duplikat persis, murid+mapel+tanggal sama oleh tutor lain, durasi > `ANOMALY_DURATION_OUTLIER_MINUTES`=180, mulai setelah `ANOMALY_LATE_START_AFTER`=21:00). Tanpa kandidat → **Valid** tanpa memanggil model. Ada kandidat → LLM (baseline Gemini, akan diganti model tim AI) memberi label + alasan. Provider tidak ada/gagal → sesi tetap `pending` (menunggu validasi), Admin menetapkan manual. Hasil AI hanya ditulis bila sesi masih `pending`.
- **Status efektif** `status` diturunkan dari validitas: `valid → approved`, `rejected → rejected`, `needs_revision → revision_requested | approved | rejected` sesuai approval. Hanya `approved` yang dihitung (honor, tagihan, Progress Anak).
- `PATCH /admin/attendance/:id/validity` body `{ validity, approval? (wajib & hanya untuk needs_revision), admin_note? }` → `200 AdminAttendanceDetail`. Koreksi label AI atau status approval hasil banding via WA; berlaku dari status apa pun.
- `GET /admin/attendance-options` → murid & mapel aktif + tutor aktif (form Admin). `POST /admin/attendance` (tutor_id + payload) → `201`, divalidasi AI seperti submit Tutor. `PUT /admin/attendance/:id` mengoreksi data tanpa mengubah validitas (snapshot dihitung ulang bila sesi dihitung). `DELETE /admin/attendance/:id` → `204`, menghapus sesi + temuannya (rujukan temuan sesi lain dilepas).
- Tutor hanya dapat merevisi sesi `needs_revision` dengan approval `pending`; revisi → `pending` + analisis ulang. Sesi Ditolak tidak dapat diedit Tutor.
- **Tarif** (`services/billing/tariff.ts`): per jam SD 1-3 Rp50.000, SD 4-6 Rp70.000; ≤ 60 menit = 1 jam, tiap 30 menit penuh berikutnya +0,5×. Potongan Admin Rp10.000 flat per sesi. Saat dihitung, `rate_amount_snapshot` (kotor) & `admin_fee_snapshot` dikunci. Kelas siswa dibatasi `1 SD`–`6 SD`. `HONOR_RATE_PER_SESSION` dihapus.
- `GET /admin/dashboard/summary` → `{ period, active_tutors, students_with_sessions, total_sessions, gross_revenue }` (omzet kotor = Σ tarif sesi yang dihitung).
- Filter `GET /admin/attendance` menambah `validity` (`valid|needs_revision|rejected|unvalidated`). Ekspor Google Sheets dipindah ke halaman Data Absensi; kolom "mata pelajaran" berisi nama mapel digabung koma.
- Migration 0005–0006: tabel `lesson_session_subjects`, kolom `start_time/end_time/validity/validity_reason/admin_fee_snapshot`, finding `late_start`; data lama dipertahankan (status lama → validitas).


### Detail implementasi D-25 — Penagihan Orang Tua (menggantikan Rekap)

- `GET /admin/recap` dihapus. Penggantinya `GET /admin/billing?period=&student_id=` → `BillingResponse { period, students[], total_sessions, total_amount, warnings[] }`. Per murid: `student_name`, `grade`, `school_name`, `parent_names[]`, `sessions`, `total_amount`, `lines[]` (`lesson_date`, `start_time`/`end_time`, `tutor_name`, `subject_name`, `duration_minutes`, `amount` = tarif les sesi itu).
- Hanya sesi yang dihitung (`status=approved`: Valid, atau Perlu revisi yang Disetujui) dengan snapshot tarif. Sesi dihitung tanpa tarif tidak ditagih dan muncul di `warnings`.
- `GET /admin/billing/:student_id/invoice.pdf?period=` → `200 application/pdf` (`Content-Disposition: attachment; filename="tagihan-YYYY-MM-<murid>.pdf"`, `Cache-Control: no-store`), dibuat backend dengan `pdfkit` (A4, nomor invoice `INV-YYYYMM-XXXXXX`, rincian sesi, total, catatan tarif). Murid tanpa sesi ditagih pada periode → `404`.
- Omzet kotor di dashboard = Σ snapshot tarif sesi yang dihitung = total tagihan periode yang sama.
