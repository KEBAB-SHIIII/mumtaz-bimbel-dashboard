# Phase 08 — Ekspor Absensi Bulanan ke Google Sheets

## Tujuan

Menyediakan aksi Admin untuk mengekspor report sesi dari Neon langsung ke Google Sheets (semua status review, sesuai keputusan owner) lewat Google Sheets API. Fitur ini **export-only**, tidak ada import sumber data dan tidak ada auto-sync saat tutor submit.

## Prasyarat

- ERD/API/data contracts sudah stabil.
- Admin attendance dan recap service tersedia.
- Owner menyiapkan spreadsheet demo, Google Sheets API, credential backend dan akses Editor ketika siap melakukan live smoke test.
- Unit tests/exporter mock dapat dibuat tanpa credential nyata.

## Tugas

1. Implementasikan interface `GoogleSheetsExporter`; implementasi live menggunakan `googleapis`, dan fake adapter untuk tests.
2. Endpoint Admin: `POST /api/v1/admin/reports/google-sheets/attendance`, request `{ "period": "YYYY-MM", "confirm_empty_replace": false }`; tambahkan `GET /api/v1/admin/reports/google-sheets/attendance/history?period=YYYY-MM&page=1&page_size=20` untuk histori ekspor.
3. Role guard Admin dan validasi periode.
4. Query data dari Neon berdasarkan `lesson_date`; **semua sesi tanpa filter status review** untuk baseline report. Keputusan owner: tidak ada filter status review.
5. Mapping **tepat delapan kolom mentah** berurutan: `no`, `nama tutor`, `nama murid`, `kelas`, `asal sekolah`, `mata pelajaran`, `tanggal les`, `durasi les`.
6. Tidak memasukkan status, materi, catatan, anomaly, honor, ID internal, email atau timestamp teknis.
7. `no` dibuat ulang 1..N sesuai urutan report yang stabil; jangan gunakan sebagai ID internal.
8. Tab deterministik `Absensi YYYY-MM`, contoh `Absensi 2026-10`.
9. Jika tab belum ada, buat. Jika sudah ada, replace/update isi report dan bersihkan sisa baris lama bila hasil baru lebih pendek. Utamakan satu `spreadsheets.batchUpdate` atomik untuk menulis report baru sekaligus membersihkan sisa cell A:H; jangan clear report lama sebelum payload baru siap. Jangan append report berulang.
10. Setelah authorization, validasi periode, query data dan konfigurasi awal selesai, buat satu `sheet_export_runs` dengan status `running` sebelum Google Sheets preflight/read/write. Jika credential valid tetapi Google API read, permission, atau write gagal, ubah menjadi `failed`; jika berhasil, ubah menjadi `succeeded`. Simpan `spreadsheet_id`, jumlah data row (tanpa header), waktu dan error aman. Retry membuat row baru. Preflight `409 EMPTY_EXPORT_CONFIRMATION_REQUIRED` tidak melakukan write dan tidak boleh meninggalkan row log; jika ada row provisional, hapus sebelum return. Jika konfigurasi/spreadsheet ID belum tersedia, return `503` tanpa run karena belum ada target ekspor valid.
11. Credential dan spreadsheet ID hanya dari backend env/secret; service account perlu akses Editor ke target spreadsheet.
12. Jika credential/API belum siap atau gagal, kembalikan error terstruktur/503 yang jujur. Jangan fake success; jangan mengubah data Neon.
13. Jika query tidak memiliki baris hasil dan tab target sudah berisi laporan, API mengembalikan `409 EMPTY_EXPORT_CONFIRMATION_REQUIRED`; UI meminta konfirmasi eksplisit lalu mengirim `confirm_empty_replace: true` sebelum tab diganti menjadi header saja.
14. Admin dapat melihat status/history export dan mencoba ulang setelah kegagalan.

## Acceptance criteria

- [ ] Submit tutor tidak memanggil Google Sheets.
- [ ] Semua status review diekspor tanpa filter status; output tetap delapan kolom mentah.
- [ ] Header tepat delapan kolom mentah dan urutannya benar.
- [ ] Filter periode berbasis `lesson_date`.
- [ ] Export pertama membuat tab bulan yang benar.
- [ ] Re-export memperbarui tab yang sama tanpa duplikasi.
- [ ] Export kosong mengembalikan `409 EMPTY_EXPORT_CONFIRMATION_REQUIRED` bila tab target berisi data; overwrite hanya setelah konfirmasi eksplisit.
- [ ] Permission/API failure tercatat gagal, credential tidak bocor, dan Neon tetap utuh.
- [ ] Non-Admin ditolak.
- [ ] Live smoke test hanya diklaim sukses bila credential valid digunakan.
