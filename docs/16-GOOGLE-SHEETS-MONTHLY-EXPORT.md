# Ekspor Laporan Absensi Bulanan ke Google Sheets

## 1. Keputusan

Google Sheets digunakan sebagai **tujuan ekspor laporan bulanan** yang dipicu Admin, bukan database utama, bukan sumber input, dan bukan tujuan sinkronisasi otomatis setiap kali Tutor submit.

Alur operasional:

1. Tutor submit Form Absensi.
2. Backend memvalidasi dan menyimpan sesi ke Neon dengan status awal `pending`.
3. Admin meninjau data di aplikasi, memberi keputusan, dan menggunakan aplikasi untuk rekap/honor.
4. Jika membutuhkan laporan spreadsheet, Admin memilih bulan lalu menekan **Ekspor Absensi Bulanan ke Google Sheets**.
5. Backend mengambil data dari Neon dan menulis snapshot bulan itu ke tab Google Sheets yang dikelola oleh fitur export.

Tidak ada Google Sheets API call pada endpoint submit Tutor. Perubahan manual di Sheets tidak mengubah database. Jika data aplikasi berubah setelah ekspor, Admin mengekspor ulang periode terkait.

## 2. Isi laporan dan status yang diekspor

Ekspor standar memakai **delapan kolom mentah sesuai header UMKM saja**, dengan urutan persis:

```text
no | nama tutor | nama murid | kelas | asal sekolah | mata pelajaran | tanggal les | durasi les
```

Jangan tambahkan kolom `status`, `learning_material`, catatan pembelajaran, anomaly, ID internal, tarif, honor, email, atau timestamp teknis pada report standar. Materi/catatan tetap ada di Neon untuk Riwayat Mengajar dan Progress Anak.

Ekspor mencakup **semua submission pada periode terpilih tanpa memfilter status review**, termasuk `pending`, `approved`, `revision_requested`, dan `rejected`. Keputusan ini sudah dikonfirmasi owner. Format laporan tetap delapan kolom mentah tanpa status. Karena itu, sebelum menulis ke Sheets, UI harus menampilkan peringatan ringkas: “Laporan ini mencakup semua submission pada bulan terpilih, termasuk data yang belum disetujui.” Admin tetap dapat membatalkan sebelum write.

Mapping delapan kolom:

| Header Sheets | Sumber data | Aturan output |
|---|---|---|
| `no` | hasil query sesi terpilih | Nomor 1..N dibuat ulang setiap ekspor; bukan ID internal. |
| `nama tutor` | `users.full_name` melalui `tutors` | Nama profil tutor. |
| `nama murid` | `students.full_name` | Nama siswa. |
| `kelas` | `students.grade` | Nilai dari Master Data siswa. |
| `asal sekolah` | `students.school_name` | Nilai dari Master Data siswa. |
| `mata pelajaran` | `subjects.name` melalui assignment | Nama mata pelajaran pada penugasan sesi. |
| `tanggal les` | `lesson_sessions.lesson_date` | Working default text `DD/MM/YYYY`; jangan menggeser tanggal karena timezone. Cocokkan dengan format spreadsheet asli sebelum live export (O-11). |
| `durasi les` | `lesson_sessions.duration_minutes` | Working default `N menit`, contoh `90 menit`; cocokkan format/unit spreadsheet asli sebelum live export (O-11). |

Urutkan baris secara deterministik, misalnya `lesson_date ASC`, lalu nama tutor dan ID sesi sebagai tie-breaker.

## 3. UI dan tindakan

Lokasi: **Admin → Rekap → Ekspor Absensi Bulanan ke Google Sheets**.

Input:
- Periode `YYYY-MM`, contoh Oktober 2026 → `2026-10`.
- Nama tab target dibentuk sistem, bukan input bebas pada baseline.
- Dialog konfirmasi menyebut periode, jumlah semua submission yang akan ditulis, dan nama tab target. Semua status review ikut diekspor.
- Bila hasil query kosong dan tab target yang sama telah berisi laporan, server mengembalikan `409 EMPTY_EXPORT_CONFIRMATION_REQUIRED`. UI meminta konfirmasi kedua lalu mengirim `confirm_empty_replace: true`; tanpa flag tersebut tab lama tidak boleh diubah.

API yang diperlukan:
- `POST /admin/reports/google-sheets/attendance` untuk memulai ekspor.
- `GET /admin/reports/google-sheets/attendance/history?period=YYYY-MM&page=1&page_size=20` untuk menampilkan histori dan status ekspor.

Output UI:
- status `running`, `succeeded`, atau `failed`;
- periode dan nama tab;
- jumlah record yang diekspor;
- waktu ekspor;
- tautan spreadsheet jika URL/ID tersedia;
- histori ekspor sebelumnya dari `sheet_export_runs`, termasuk spreadsheet ID/link yang benar-benar menjadi tujuan;
- pesan error yang aman dan tindakan untuk mencoba lagi bila gagal.

Tombol dikunci saat proses berlangsung agar tidak memicu ekspor ganda. Jangan menampilkan status sukses sebelum API mengonfirmasi write.

## 4. Spreadsheet dan penamaan tab

- Spreadsheet ID dibaca dari environment/config backend, tidak di-hard-code.
- Nama tab deterministik: `Absensi YYYY-MM`, misalnya `Absensi 2026-10`.
- Bila tab belum ada, backend membuat tab.
- Bila tab sudah ada, backend **mengganti isi data report yang dikelola fitur ini**, bukan menggunakan append berulang yang menambah duplikasi. Siapkan payload baru lebih dulu; untuk existing tab, utamakan `spreadsheets.batchUpdate` yang menulis rentang baru dan mengosongkan sisa cell A:H lama dalam satu batch atomik. Jangan mengosongkan tab terlebih dahulu lalu baru mencoba menulis payload, karena kegagalan di tengah dapat menghilangkan report lama.
- Ekspor hanya boleh menyentuh tab dengan pola nama yang dikelola fitur; jangan mengubah tab lain.
- Jika report bulan tersebut kosong dan tab lama berisi data, UX harus mengonfirmasi secara eksplisit melalui kontrak `409 EMPTY_EXPORT_CONFIRMATION_REQUIRED` + `confirm_empty_replace: true` sebelum mengganti isi tab dengan header saja.

## 5. Error handling dan konsistensi

- Export merupakan operasi eksternal yang tidak berada dalam transaksi Neon. Kegagalan export tidak membatalkan atau mengubah record di Neon.
- Setelah authorization, periode, query, dan preflight empty-replace lolos (tanpa `409`), buat satu `sheet_export_runs` status `running` sebelum menjalankan external write. Gagal credential/permission/API dicatat sebagai `failed`; berhasil menjadi `succeeded`. Simpan `spreadsheet_id`, periode, tab target, jumlah data row yang berhasil ditulis (tanpa header), dan error aman. Retry membuat log percobaan baru.
- Preflight `409 EMPTY_EXPORT_CONFIRMATION_REQUIRED` tidak melakukan write, sehingga tidak boleh meninggalkan row `sheet_export_runs`. Jika log sementara dibuat sebelum membaca target Sheets, hapus row itu saat mengembalikan 409. Kegagalan API saat membaca target dicatat `failed`. Jika konfigurasi/spreadsheet ID belum tersedia, return `503` sebelum run dibuat karena tidak ada tujuan ekspor valid. Setelah Admin menyetujui penggantian report kosong, request ulang menjalankan export attempt yang dicatat.
- Jangan menyimpan access token, service account private key, raw credential, atau response sensitif di log.
- API/credential/permission failure harus menghasilkan status gagal yang jelas, bukan fake success.
- Jika credential belum tersedia, gunakan mock adapter hanya untuk UI/test dan beri label mock. Jangan mengklaim live integration berhasil tanpa smoke test real.
- Re-export bulan yang sama menimpa/memperbarui tab bulan tersebut dengan snapshot terkini; tidak meng-append baris lama.

## 6. Integrasi backend

Pisahkan API endpoint, report query, mapping data, dan Google client. Contoh file: `backend/src/integrations/google-sheets/google-sheets-exporter.ts`.

Urutan service:

1. Memastikan role Admin.
2. Memvalidasi parameter `period=YYYY-MM`.
3. Membaca sesi dari Neon dengan filter `lesson_date` dalam bulan itu; semua status review tanpa filter status.
4. Melakukan join data tutor, siswa, kelas/sekolah, dan mapel.
5. Memetakan hanya delapan kolom sesuai urutan header dan mengurutkan hasil stabil (`lesson_date`, tutor, siswa, mapel, ID sesi).
6. Memastikan tab tersedia, lalu mengganti nilai laporan. Pada tab existing, utamakan satu `spreadsheets.batchUpdate` atomik untuk menulis payload baru sekaligus mengosongkan sisa cell A:H dari report sebelumnya bila hasil baru lebih pendek. Jangan clear data lama sebelum payload baru siap. Simpan spreadsheet ID tujuan pada log ekspor.
7. Jika tidak ada row dan tab target berisi data, berhenti tanpa write kecuali `confirm_empty_replace=true`.
8. Mencatat hasil ekspor di `sheet_export_runs`.

Untuk operasi tulis, gunakan API Google Sheets dari backend saja. Service account/service identity harus memiliki akses editor ke spreadsheet target. Kredensial berada di environment/server secret, tidak pernah di browser/frontend.

## 7. Pengujian minimum

- Header dan urutan kolom tepat delapan kolom.
- Data `pending`, `revision_requested`, dan `rejected` tidak ikut ekspor baseline.
- Periode memakai `lesson_date`, bukan `submitted_at`/`reviewed_at`.
- Nomor `no` selalu 1..N per hasil ekspor.
- Ekspor pertama membuat tab yang benar.
- Ekspor kedua untuk bulan sama memperbarui tab, tidak append duplikat.
- Ekspor bulan kosong memicu `409 EMPTY_EXPORT_CONFIRMATION_REQUIRED` bila tab lama berisi data; hanya konfirmasi eksplisit memperbolehkan replace.
- Credential, API quota, dan permission failure tercatat `failed`; Neon tetap utuh.
- Pengguna selain Admin ditolak.
- Tests menggunakan fake exporter; live smoke test hanya setelah owner menyediakan credential valid.

## 8. Batasan saat ini

- Ekspor bersifat snapshot. Perubahan pada aplikasi setelah ekspor baru terlihat di Sheets setelah Admin mengekspor ulang.
- Tidak ada sinkronisasi dua arah.
- Tidak ada ekspor honor pada baseline. Format report honor perlu ditetapkan terpisah jika dibutuhkan.
- Tidak ada impor otomatis dari spreadsheet lama. Migrasi historis merupakan pekerjaan terpisah setelah diputuskan.

## Referensi

- Google Sheets API values guide: https://developers.google.com/workspace/sheets/api/guides/values
- Google Sheets `values.update`: https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/update
- Google credentials: https://developers.google.com/workspace/guides/create-credentials
