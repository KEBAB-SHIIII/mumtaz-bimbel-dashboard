# Phase 02 — Contract Gate and Synthetic Fixtures

## Tujuan

Menyamakan ERD, field, status, API schemas, contoh data dan ekspektasi test sebelum frontend/backend/integration lane berjalan paralel.

## Tugas

1. Review `04-API-CONTRACT.md`, `05-DATA-CONTRACT.md`, `14-ERD-AND-DATA-DICTIONARY.md`, `15-DASHBOARD-TABS.md` dan `16-GOOGLE-SHEETS-MONTHLY-EXPORT.md`.
2. Buat shared Zod schemas/TypeScript types untuk username/password auth, parent access-code auth, role, tutor/student assignments, attendance submit/response, anomaly findings/review decision, period query, recap/payroll dan sheet export.
3. Pertahankan `examples/attendance-sample.csv` hanya sebagai referensi delapan header dan fixture validasi/anomaly terisolasi. Jangan gunakan untuk seed relasional `lesson_sessions`: sebagian nama tutor/siswa/mapel tidak ada pada `seed-data.json`, dan ada baris sengaja invalid/duplikat. Jangan implementasikan import CSV/Sheets pada baseline.
4. Perbarui `examples/seed-data.json` sesuai tabel `users`, tutors, students, subjects, assignments dan tarif; semua nilai harus ditandai synthetic.
5. Buat fixture untuk valid submit, invalid assignment, sesi approved/pending/revision, periode berbeda, parent-child link dan export rows.
6. Tambahkan fake `GoogleSheetsExporter` untuk tests dan interface dengan implementasi live terpisah.
7. Tambahkan fake anomaly detector deterministic untuk `suspected_duplicate` dan `duration_outlier`; gunakan sebagai test double, bukan mengklaim hasil AI live.
8. Buat expected outcomes deterministic untuk period filter, semua status review payroll, rate demo Rp50.000/sesi, anomaly review, dan export mapping delapan kolom dengan row filter semua status review sesuai keputusan owner. Jangan gunakan output Gemini live sebagai test oracle tunggal.

## Acceptance criteria

- [ ] Status, schema dan role konsisten lintas docs/TypeScript/tests.
- [ ] ID session memakai UUID; header `no` output tidak dianggap primary key.
- [ ] Month filter berbasis `lesson_date`.
- [ ] Fixture auth mencakup username admin/tutor dan parent access code khusus test; fixture dapat dipakai offline tanpa Neon/Sheets/AI live.
- [ ] Export mock dapat menguji write, re-export, empty period dan failure paths.
