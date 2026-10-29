# Environment Setup — Manual Checklist Owner

Dokumen ini mencatat konfigurasi untuk development dan integrasi. Credential live disiapkan manual oleh owner ketika fase terkait dimulai; jangan tempel secret ke chat/prompt agent dan jangan commit ke Git. Panduan langkah demi langkah pembuatan credential bisa dilakukan saat tim siap menghubungkan layanan nyata.

## 1. Neon PostgreSQL

1. [x] Buat project/branch development terpisah di https://neon.tech/. *(Selesai)*
2. [x] Isi `DATABASE_URL` dengan pooled connection untuk runtime API. *(Selesai)*
3. [x] Isi `DATABASE_MIGRATION_URL` dengan direct/unpooled connection untuk migration Drizzle bila dibutuhkan. *(Selesai)*
4. [x] Simpan di `backend/.env`, jangan commit. *(Selesai)*
5. [ ] Review migration sebelum dijalankan; gunakan synthetic seed. Jangan seed/destructive migration ke DB UMKM tanpa izin.

## 2. Auth dan ID Akses Orang Tua

- `BOOTSTRAP_ADMIN_USERNAME` dan `BOOTSTRAP_ADMIN_PASSWORD` hanya untuk bootstrap Admin lokal/development.
- `SESSION_SECRET` harus berupa secret acak kuat, berbeda dari secret lainnya. Session baseline memakai `express-session` + `connect-pg-simple` dengan tabel `app_sessions` yang dibuat lewat migration terkontrol; jangan gunakan MemoryStore pada production. Token sesi tidak disimpan di localStorage.
- `PARENT_ACCESS_CODE_PEPPER` harus secret acak yang berbeda dari `SESSION_SECRET`. Dipakai untuk digest ID Akses Orang Tua. Jangan mengubahnya setelah kode live diterbitkan tanpa rencana rotasi/migrasi.
- Admin dan Tutor login dengan username/password; password disimpan hanya sebagai hash kuat.
- Orang Tua login melalui satu field ID Akses Orang Tua tanpa password. Sistem/Admin menerbitkan ID yang unik, privat, dan sulit ditebak. Jangan gunakan NPM publik, ID siswa, nomor HP, tanggal lahir, atau angka berurutan sebagai credential.
- Kode mentah hanya ditampilkan ketika dibuat/dirotasi; DB menyimpan digest HMAC, bukan kode mentah. Berikan kode kepada wali secara privat dan sediakan mekanisme rotasi saat hilang/terekspos.
- Terapkan rate limit, respons login gagal generik, session expiry/logout, HttpOnly/SameSite cookie, Secure pada production, origin allowlist, dan backend scope check. Gunakan `GET /auth/csrf` untuk mendapatkan synchronizer token; frontend menyimpannya di memory dan mengirim `X-CSRF-Token` untuk request state-changing, lalu mengambil token baru setelah login/session regeneration.

## 3. Spreadsheet tujuan ekspor

Google Sheets bukan sumber input. Spreadsheet hanya dibutuhkan saat Admin memakai fitur ekspor bulanan.

- [x] Buat spreadsheet demo terpisah untuk smoke test sebelum memakai spreadsheet UMKM. *(Selesai)*
- [x] `GOOGLE_SHEETS_SPREADSHEET_ID` menyimpan ID target pada backend environment. *(Selesai)*
- [x] Aktifkan Google Sheets API dan siapkan service account/server identity dengan akses Editor pada spreadsheet target. *(Selesai)*
- [x] Credential path, bila memakai key file, disimpan di `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` pada backend; jangan commit key. *(Selesai)*
- [ ] Exporter membuat tab `Absensi YYYY-MM` saat ekspor pertama. Tidak diperlukan tab source untuk dibaca aplikasi.
- [ ] Ekspor semua status review dengan tepat delapan kolom mentah. Tidak ada Sheets API call saat tutor submit.
- [ ] Credential nyata dan spreadsheet UMKM baru disiapkan saat tim siap live smoke test. Jangan menulis ke spreadsheet UMKM tanpa izin.

## 4. Provider AI untuk anomaly screening

Anomaly screening dan klasifikasi kandidat duplikasi adalah bagian baseline development. Implementasikan interface provider agar dapat dites tanpa credential; live AI dihubungkan saat tim siap setup key.

- [x] Provider live yang direncanakan adalah Gemini melalui `@google/genai`. *(Selesai)*
- [x] Saat siap, buat key di https://aistudio.google.com/app/apikey lalu simpan `GEMINI_API_KEY` hanya di backend. *(Selesai)*
- [x] Atur `GEMINI_MODEL` ke model yang tersedia pada project ketika integrasi dilakukan; jangan mengunci asumsi model yang bisa berubah. *(Selesai, default: gemini-3.1-flash-lite)*
- [ ] Unit test memakai fake detector deterministik. Jangan menampilkan output fake sebagai hasil AI live.
- [ ] Jika live provider belum dikonfigurasi atau gagal, simpan status analisis `not_evaluated`/`failed`. Submit dan review tetap berjalan; jangan mengarang hasil model.
- [ ] Minimalkan/pseudonymize data sebelum dikirim ke model. Jangan kirim parent access code, password, email, telepon, atau nama lengkap bila tidak diperlukan.

## 5. Environment backend contoh

```dotenv
NODE_ENV=development
PORT=3001
API_PREFIX=/api/v1
FRONTEND_ORIGIN=http://localhost:5173

DATABASE_URL=postgresql://USER:PASSWORD@HOST-pooler/DB?sslmode=require
DATABASE_MIGRATION_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
SESSION_SECRET=replace-with-a-long-random-local-secret
PARENT_ACCESS_CODE_PEPPER=replace-with-a-different-random-local-secret
BOOTSTRAP_ADMIN_USERNAME=admin.demo
BOOTSTRAP_ADMIN_PASSWORD=replace-with-a-local-password

# Google Sheets: ekspor bulanan on-demand dari Dashboard Admin
GOOGLE_SHEETS_EXPORT_ENABLED=false
GOOGLE_SHEETS_SPREADSHEET_ID=replace-with-demo-spreadsheet-id
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./secrets/google-service-account.json

# Gemini: siapkan saat live integration; jangan commit nilai asli
# Unit test/offline memakai fake detector, bukan credential kosong sebagai hasil live
GEMINI_API_KEY=
GEMINI_MODEL=replace-with-model-available-to-your-project
```

Nama variabel aktual harus konsisten dengan Zod environment schema yang dibuat agent. Semua nilai di atas placeholder, bukan credential valid. `VITE_*` hanya untuk konfigurasi browser non-rahasia seperti `VITE_API_BASE_URL=http://localhost:3001/api/v1`; jangan pernah menaruh secret di variabel frontend.

## 6. Checklist smoke test

- [x] `.env` dan credential file tidak dilacak Git. *(Selesai, diatur via .gitignore)*
- [ ] Neon branch development menerima migration Drizzle.
- [ ] Admin/Tutor login username-password; Parent login dengan satu ID akses saja.
- [ ] Parent ID tidak disimpan mentah, login rate-limited, kode salah tidak mengungkap apakah akun ada.
- [ ] Tutor submit satu sesi sintetis ke Neon dengan status `pending`.
- [ ] Anomaly service dipanggil melalui adapter; fake test dan live Gemini dibedakan dengan jelas.
- [ ] Admin dapat review sesi; hanya `approved` masuk Honor/Progress Anak.
- [ ] Tarif demo Rp50.000 per sesi muncul sebagai simulasi, bukan tarif resmi.
- [ ] Parent hanya dapat melihat siswa yang terhubung.
- [ ] Rekap periode memfilter `lesson_date`.
- [x] Spreadsheet demo memberi akses Editor kepada service identity. *(Selesai)*
- [ ] Export bulanan membuat/memperbarui tab `Absensi YYYY-MM` dengan delapan kolom mentah; re-export tidak append duplikat.
- [ ] Credential/API gagal memberi pesan gagal yang jujur; data Neon tetap utuh.
- [ ] Temuan anomaly/duplikasi tampil terpisah dari status sesi dan tidak otomatis mengubah honor.
- [ ] Palet/font final tetap dapat diganti melalui tokens sampai tim menetapkan referensi desain.

## 7. Spreadsheet asli UMKM dan design handoff

Sebelum live export, konfirmasi spreadsheet ID, izin, aturan tab yang boleh dibuat/diubah, dan uji satu bulan kecil. Jangan overwrite tab yang tidak dikelola fitur ini. Perubahan manual di Sheets tidak kembali ke Neon.

Palet, typography, logo, dan referensi dashboard spesifik ditentukan tim pada meeting desain berikutnya. Setelah owner memberikan hasil, update `docs/07-DESIGN-GUIDELINES.md` dan token CSS terlebih dahulu; hindari menyebarkan keputusan visual hard-coded ke komponen.

## Referensi

- Neon: https://neon.com/docs/get-started/connect-neon
- Drizzle + Neon: https://orm.drizzle.team/docs/get-started/neon-existing
- Google Sheets API: https://developers.google.com/workspace/sheets/api/guides/values
- Google credentials: https://developers.google.com/workspace/guides/create-credentials
- Gemini API: https://ai.google.dev/gemini-api/docs/models
