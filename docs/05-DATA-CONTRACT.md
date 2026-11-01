# Data Contract — Sesi Les, Status, Honor, Anomali, dan Ekspor

Dokumen kontrak bersama frontend, backend, database, modul anomali, dan integrasi Google Sheets. Skema tabel lengkap ada di `14-ERD-AND-DATA-DICTIONARY.md`.

## 1. Autentikasi dan role

- Admin dan Tutor masuk menggunakan `username` + password.
- Orang Tua/Wali masuk menggunakan satu `parent_access_code`/ID Akses Orang Tua tanpa password. Kode adalah credential rahasia dengan entropi tinggi, bukan ID publik/berurutan. Jangan gunakan NPM siswa, nomor telepon, tanggal lahir, atau UUID internal sebagai kode login.
- Simpan kode orang tua sebagai digest HMAC menggunakan secret backend `PARENT_ACCESS_CODE_PEPPER`; kode mentah hanya ditampilkan saat dibuat/dirotasi dan tidak boleh masuk log.
- Proteksi endpoint login dari brute force dengan rate limit, generic error, monitoring percobaan gagal, dan sesi berumur terbatas.
- Backend cookie/session menjadi sumber autentikasi; jangan menyimpan credential persisten di localStorage. Gunakan HttpOnly/Secure/SameSite cookie sesuai environment, origin allowlist, dan perlindungan CSRF untuk operasi mutasi.

## 2. Form Dashboard Tutor

| Label UI | Field API/database | Aturan |
|---|---|---|
| Nama tutor | Diturunkan dari sesi login → `lesson_sessions.tutor_id` | Tidak dikirim sebagai sumber identitas yang dipercaya dari browser. |
| Nama murid | `student_id` → student | Tutor memilih sendiri dari murid aktif (Master Data Siswa). |
| Kelas | `students.grade` | Auto-fill dari Master Data. |
| Asal sekolah | `students.school_name` | Auto-fill dari Master Data. |
| Mata pelajaran | `subject_id` → subject | Tutor memilih sendiri dari mata pelajaran aktif (Master Data Mata Pelajaran). |
| Tanggal les | `lesson_date` | Format `YYYY-MM-DD`; tanggal sesi aktual dan dasar filter bulan. Working default (O-14): tolak tanggal masa depan menurut `Asia/Jakarta`, izinkan tanggal lampau untuk pelaporan terlambat. |
| Durasi les | `duration_minutes` | Integer menit, bukan jam desimal. Rentang valid harus config yang jelas dan bisa diubah. |
| Materi pembelajaran | `learning_material` | Working default required untuk Progress Anak; owner setuju field dicantumkan tetapi requiredness belum dikonfirmasi (O-09). |
| Catatan pembelajaran | `learning_notes` | Opsional pada baseline; ditulis oleh tutor, bukan hasil generasi AI yang disamarkan sebagai catatan tutor. |
| Fokus berikutnya | `next_focus` | Opsional. Ditampilkan ke orang tua jika tersedia dan sesi approved. |

`no`, status review, timestamp, honor, status anomali, dan field ekspor bukan input form Tutor. Submit baru menghasilkan status `pending`. Untuk validasi baseline, `duration_minutes` harus integer positif. Batas maksimum hard-rejection belum ditentukan (O-12); jangan mengarang angka bisnis. Threshold outlier dibuat configurable dan hanya menghasilkan finding/review, bukan auto-reject.

## 3. Header ekspor standar Google Sheets

Ekspor bulanan langsung memakai Google Sheets API dari backend, atas tindakan Admin. Header dan urutan tetap:

```text
no | nama tutor | nama murid | kelas | asal sekolah | mata pelajaran | tanggal les | durasi les
```

| Header | Data source | Aturan |
|---|---|---|
| `no` | urutan query report | Buat nomor 1..N untuk setiap ekspor; bukan ID internal. |
| `nama tutor` | `users.full_name` → `tutors` | Nama tutor dari Master Data. |
| `nama murid` | `students.full_name` | Nama siswa. |
| `kelas` | `students.grade` | Nilai Master Data. |
| `asal sekolah` | `students.school_name` | Nilai Master Data. |
| `mata pelajaran` | `subjects.name` melalui `subject_id` | Nama mapel. |
| `tanggal les` | `lesson_sessions.lesson_date` | Format konsisten `DD/MM/YYYY`. |
| `durasi les` | `lesson_sessions.duration_minutes` | Tampilan `N menit`, misalnya `90 menit`. |

Ekspor hanya berisi delapan kolom mentah di atas. Jangan masukkan `status`, materi/catatan, temuan anomaly, honor, ID internal, atau timestamp ke report standar.

Ekspor mencakup semua submission pada periode terpilih, termasuk `pending`, `approved`, `revision_requested`, dan `rejected`. Sesuai keputusan owner, format tetap delapan kolom mentah tanpa status review; karena itu UI harus memperjelas kepada Admin bahwa laporan berisi seluruh submission, bukan hanya sesi yang sudah disetujui.

## 4. Periode

- Periode API `YYYY-MM`, misalnya `2026-10`.
- Query menggunakan rentang `lesson_date >= first_day AND lesson_date < first_day_of_next_month`.
- Sesi tanggal 31 Oktober yang disubmit November tetap bagian dari Oktober.
- Gunakan `DATE` untuk `lesson_date`; jangan menerapkan konversi timezone yang menggeser hari.
- Timestamp `submitted_at`, `reviewed_at`, `updated_at` adalah timestamptz dan ditampilkan sesuai `Asia/Jakarta`.

## 5. Status sesi dan review manual

`lesson_sessions.status`:

- `pending`: status awal setelah Tutor submit; menunggu pemeriksaan Admin.
- `approved`: sesi disetujui Admin dan boleh masuk perhitungan honor serta Progress Anak.
- `revision_requested`: perlu diperbaiki Tutor; alasan Admin wajib.
- `rejected`: ditolak dengan alasan yang wajib.

Transisi baseline: `pending → approved`, `pending → revision_requested`, atau `pending → rejected`; setelah Tutor memperbaiki sesi `revision_requested`, record yang sama kembali ke `pending` untuk direview ulang. `approved` dan `rejected` terminal adalah working default MVP (O-15, belum dikonfirmasi owner); belum ada endpoint reopen pada baseline. Hanya Admin dapat memutuskan status review. Tutor hanya boleh mengedit sesi miliknya yang berstatus `revision_requested`. Schema baseline hanya menyimpan metadata review untuk payload sesi yang saat ini tersimpan, bukan riwayat keputusan penuh. Saat Tutor mengirim revisi, perbarui `submitted_at` ke waktu submit payload terbaru, set status ke `pending`, kosongkan `reviewed_by_user_id`, `reviewed_at`, dan `admin_note` (alasan revisi telah ditampilkan kepada Tutor sebelum revisi dikirim), reset `anomaly_analysis_status` ke `pending`, dan tandai finding lama sebagai `superseded` dengan `review_note="superseded_by_revision"`. Jalankan analisis ulang berdasarkan payload terbaru. Riwayat keputusan/revisi penuh membutuhkan tabel audit terpisah dan berada di luar baseline.

**Honor & tagihan hanya menghitung sesi approved** (Valid, atau Perlu revisi yang Disetujui). Tagihan orang tua = tarif les (kotor); honor tutor = tarif les per jenjang (SD 1-3 Rp50.000/jam, SD 4-6 Rp70.000/jam; ≤ 60 menit = 1 jam, tiap 30 menit penuh berikutnya +0,5×) dikurangi potongan Admin Rp10.000 per sesi, dikunci ke `rate_amount_snapshot`/`admin_fee_snapshot` saat sesi dihitung (D-25). Tarif resmi UMKM masih O-01.

### 5.1 Revisi sesi — field yang dapat diubah

Untuk sesi milik Tutor yang berstatus `revision_requested`, hanya field berikut yang boleh diperbarui: `student_id` dan `subject_id` (murid/mapel aktif), `lesson_date`, `duration_minutes`, `learning_material`, `learning_notes`, dan `next_focus`. Identitas Tutor, status sesi, tarif snapshot, metadata review, dan catatan Admin tidak dapat diubah melalui payload Tutor.

## 6. Kontrak anomali dan duplikasi

- Validasi input, role, murid/mapel aktif, format tanggal, dan durasi dilakukan deterministik oleh backend sebelum/bersamaan dengan analisis.
- Anomaly module mengklasifikasikan dugaan duplikasi dan pola tidak wajar; exact-match/fingerprint boleh dipakai untuk menghasilkan kandidat pembanding secara efisien, lalu modul AI dapat mengklasifikasikan/menjelaskan kandidat tersebut.
- Nilai `finding_type` baseline: `suspected_duplicate`, `duration_outlier`, `unusual_pattern`. `invalid_data` bukan finding model untuk submit baru karena field murid/mapel invalid harus ditolak oleh validasi deterministik sebelum sesi disimpan. Kategori untuk data historis invalid hanya boleh ditambahkan bila migrasi historis disetujui.
- Temuan disimpan pada `anomaly_flags`, ditampilkan di Data Absensi Admin untuk review. Temuan bukan bukti kecurangan dan tidak otomatis mengubah status sesi atau nominal honor.
- Dua sesi dengan atribut sama bisa saja sama-sama valid. Jangan auto-delete atau auto-reject.
- Kirim hanya data minimum/pseudonymous ke provider AI; jangan kirim nama lengkap, nomor telepon, email, ID akses orang tua, atau data sensitif.
- Jika AI gagal/tidak dikonfigurasi, submit dan review tetap berjalan. Tampilkan `not_evaluated`/indikator kegagalan secara jujur, bukan fake success.

### 6.1 Bentuk output normalisasi anomaly service

`examples/anomaly-response.json` adalah fixture DTO hasil normalisasi service, bukan raw JSON yang wajib dikeluarkan langsung oleh Gemini dan bukan row database. `analysis_status` ditentukan backend dan dipetakan ke `lesson_sessions.anomaly_analysis_status`. Setiap item `findings` boleh menyertakan `is_anomaly`, `finding_type`, `severity`, `reason`, `evidence_summary`, `related_lesson_session_id`, dan `suggested_action`. Service memvalidasi item dengan Zod; hanya item yang diklasifikasikan sebagai finding (`is_anomaly=true` dengan `finding_type` yang diizinkan) disimpan sebagai `anomaly_flags`. `suggested_action` bersifat rekomendasi UI, tidak otomatis mengeksekusi keputusan sesi. Metadata provider/model ditambahkan oleh adapter/backend, bukan dipercaya mentah dari model.

## 7. Data honor

- Tarif per jenjang dan potongan Admin di-hardcode di `backend/src/services/billing/tariff.ts` (D-25); `HONOR_RATE_PER_SESSION` dihapus. Kelas murid dibatasi `1 SD`–`6 SD`.
- Nominal berasal dari konfigurasi/snapshot, tidak ditulis sebagai konstanta di tiap komponen atau service.
- Hanya status approved yang masuk total honor.
- Sesi pending/revision/rejected ditampilkan sebagai jumlah terpisah, tidak masuk nominal.
- Kalkulasi uang menggunakan PostgreSQL `numeric` dan decimal-safe arithmetic.
- Simpan snapshot tarif yang dipakai untuk histori. Sesi approved tanpa snapshot tidak diberi nominal seolah benar; tampilkan warning.

## 8. Status ekspor

Ekspor adalah snapshot laporan bulanan, bukan sinkronisasi live. `sheet_export_runs.status`: `running`, `succeeded`, `failed`. Setiap write attempt yang benar-benar dimulai membuat satu log; retry membuat log baru. Response preflight `409 EMPTY_EXPORT_CONFIRMATION_REQUIRED` tidak menulis Sheets dan tidak membuat row log. `records_exported` menghitung baris data tanpa header. Re-export periode sama mengganti isi tab yang dikelola fitur, bukan append. Gagal ekspor tidak mengubah data Neon.
