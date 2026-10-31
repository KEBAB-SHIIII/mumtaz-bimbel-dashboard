# Environment Setup — Manual Checklist Owner

Dokumen ini mencatat konfigurasi aplikasi. Sejak D-23 aplikasi berjalan **satu mode (production)** dengan satu file `backend/.env` — di laptop maupun server. Credential live disiapkan manual oleh owner ketika fase terkait dimulai; jangan tempel secret ke chat/prompt agent dan jangan commit ke Git. Panduan langkah demi langkah pembuatan credential bisa dilakukan saat tim siap menghubungkan layanan nyata.

## 1. Neon PostgreSQL

1. [x] Buat project Neon di https://neon.tech/ — satu branch (production) dipakai untuk semua keperluan (D-23). *(Selesai)*
2. [x] Isi `DATABASE_URL` dengan pooled connection untuk runtime API. *(Selesai)*
3. [x] Isi `DATABASE_MIGRATION_URL` dengan direct/unpooled connection untuk migration Drizzle bila dibutuhkan. *(Selesai)*
4. [x] Simpan di `backend/.env`, jangan commit. *(Selesai)*
5. [ ] Review migration sebelum dijalankan. Tidak ada seed sintetis/reset; jangan menjalankan migration destruktif tanpa izin owner.

## 2. Auth dan ID Akses Orang Tua

- `BOOTSTRAP_ADMIN_USERNAME` (`admin`) dan `BOOTSTRAP_ADMIN_PASSWORD` (≥ 12 karakter) untuk membuat Admin awal (`db:bootstrap-admin`, idempoten).
- `SESSION_SECRET` harus berupa secret acak kuat, berbeda dari secret lainnya. Session baseline memakai `express-session` + `connect-pg-simple` dengan tabel `app_sessions` yang dibuat lewat migration terkontrol; jangan gunakan MemoryStore pada production. Token sesi tidak disimpan di localStorage.
- `PARENT_ACCESS_CODE_PEPPER` harus secret acak yang berbeda dari `SESSION_SECRET`. Dipakai untuk digest ID Akses Orang Tua. Jangan mengubahnya setelah kode live diterbitkan tanpa rencana rotasi/migrasi.
- Admin dan Tutor login dengan username/password; password disimpan hanya sebagai hash kuat.
- Orang Tua login melalui satu field ID Akses Orang Tua tanpa password. Sistem/Admin menerbitkan ID yang unik, privat, dan sulit ditebak. Jangan gunakan NPM publik, ID siswa, nomor HP, tanggal lahir, atau angka berurutan sebagai credential.
- Kode mentah hanya ditampilkan ketika dibuat/dirotasi; DB menyimpan digest HMAC, bukan kode mentah. Berikan kode kepada wali secara privat dan sediakan mekanisme rotasi saat hilang/terekspos.
- Terapkan rate limit, respons login gagal generik, session expiry/logout, HttpOnly/SameSite cookie, Secure bila origin HTTPS, origin allowlist, dan backend scope check. Gunakan `GET /auth/csrf` untuk mendapatkan synchronizer token; frontend menyimpannya di memory dan mengirim `X-CSRF-Token` untuk request state-changing, lalu mengambil token baru setelah login/session regeneration.

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

## 5. Environment

Template satu-satunya: `backend/.env.example` (salin ke `backend/.env`). Ringkasnya:

- `NODE_ENV=production` selalu. Backend menolak start bila origin publik bukan HTTPS (localhost boleh HTTP), DB tanpa TLS, secret < 32 karakter/placeholder, password Admin < 12 karakter, atau `SEED_TUTOR_PASSWORD` diset.
- Laptop: `FRONTEND_ORIGIN=http://localhost:3001`, `TRUST_PROXY=0`. Server publik: `FRONTEND_ORIGIN=https://domain-anda`, `TRUST_PROXY=1`.
- `FRONTEND_DIST_DIR=../frontend/dist`: API ikut menyajikan UI dari origin yang sama (`npm run prod`). Saat `npm run dev`, Vite (:5173) mem-proxy `/api` ke :3001.
- Frontend **tidak memakai env**: base URL API selalu `/api/v1` (same-origin). Jangan menaruh secret di variabel `VITE_*`.
- Jangan mengganti `PARENT_ACCESS_CODE_PEPPER` setelah kode diterbitkan tanpa rencana rotasi.

## 6. Checklist smoke test

- [x] `.env` dan credential file tidak dilacak Git. *(Selesai, diatur via .gitignore)*
- [x] Neon (branch production) menerima migration Drizzle. *(Selesai)*
- [ ] Admin/Tutor login username-password; Parent login dengan satu ID akses saja.
- [ ] Parent ID tidak disimpan mentah, login rate-limited, kode salah tidak mengungkap apakah akun ada.
- [ ] Tutor submit satu sesi ke Neon dengan status `pending`.
- [ ] Anomaly service dipanggil melalui adapter; fake test dan live Gemini dibedakan dengan jelas.
- [ ] Admin dapat review sesi; hanya `approved` masuk Honor/Progress Anak.
- [ ] Tarif Rp50.000 per sesi dipakai sebagai tarif aktif (D-22); tarif yang ditandai demo berbadge "Tarif demo".
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
