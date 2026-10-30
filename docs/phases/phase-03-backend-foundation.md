# Phase 03 — Backend Database, Auth, and Core API

## Tujuan

Implementasikan database dan backend core yang menjadi kontrak bersama semua dashboard: auth, role access, CRUD Master Data, submit/list/review sesi.

## Tugas

1. Express 5 + TypeScript + Zod environment validation.
2. `pg` Pool + Drizzle; runtime URL dan migration URL mengikuti env contract.
3. Schema domain dan migration mengikuti `14-ERD-AND-DATA-DICTIONARY.md`: `users`, `tutors`, `students`, `parent_students`, `subjects`, `tutor_assignments`, `tutor_rates`, `lesson_sessions`, `anomaly_flags`, `sheet_export_runs`. Selain itu, buat tabel infrastruktur session `app_sessions` yang kompatibel dengan `connect-pg-simple`; tabel ini bukan entitas domain dan tetap harus dibuat lewat migration terkontrol.
4. Bootstrap user Admin lewat `BOOTSTRAP_ADMIN_USERNAME`/`BOOTSTRAP_ADMIN_PASSWORD`; hash dengan Argon2id atau bcrypt. Jangan hard-code password.
5. Admin/Tutor login username+password; Parent login satu ID akses rahasia acak tanpa password. Simpan digest HMAC dengan `PARENT_ACCESS_CODE_PEPPER`, implement rate limit, generic failure, session cookie HttpOnly, SameSite, Secure production, origin/CSRF defense.
6. Middleware role/scope `admin`, `tutor`, `parent`; Parent hanya dapat akses siswa melalui `parent_students`.
7. CRUD/deactivation master data: tutor, siswa, parent links, subject, assignment dan rates.
8. Implementasikan `POST /tutor/attendance`: identitas tutor dari session terautentikasi (cookie server-side), validasi assignment aktif, simpan `lesson_sessions` status pending. Jangan panggil Sheets.
9. Implementasikan API untuk admin attendance list/detail/decision, tutor history/edit revision, parent linked students/progress, admin recap dan tutor/admin payroll preview sesuai kontrak.
10. Pastikan semua query period menggunakan `lesson_date`. Parent access harus memeriksa `parent_students` di backend.
11. Business service payroll di backend; gunakan seed Rp50.000 per sesi dengan `is_demo_assumption=true` (UI: badge "Tarif demo"); jangan hard-code angka pada kalkulator. Tarif resmi UMKM tetap belum diketahui.
12. Buat seed sintetis yang eksplisit untuk environment development.
13. Jangan jalankan migrasi/destructive seed pada DB UMKM tanpa izin.

## Batas tanggung jawab

Backend agent menguasai `backend/` dan shared contract hanya melalui koordinasi. Jangan mengerjakan UI. Google Sheets exporter dikerjakan di Phase 08.

## Acceptance criteria

- [ ] Role guard/auth tests lulus.
- [ ] Tutor hanya submit/list/edit sesi yang terkait tutor login.
- [ ] Sesi submit disimpan ke Neon status pending dan tidak memanggil Sheets.
- [ ] Admin dapat memverifikasi/menolak/meminta revisi.
- [ ] Parent login access-code-only, rate-limited, dan tidak dapat membaca anak yang tidak terhubung.
- [ ] Rekap/honor menggunakan period filter yang benar.
- [ ] Migration, typecheck, lint dan API tests berhasil pada lingkungan development/test.
