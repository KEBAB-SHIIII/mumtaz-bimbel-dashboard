# Fixture expectations — synthetic data only

Semua fixture di folder `examples/` adalah data buatan untuk development/test. Jangan gunakan nama, kode akses, akun, atau tarif fixture untuk production. `attendance-sample.csv` bukan relational DB seed dan tidak boleh diimport ke tabel sesi pada baseline; dataset ini berisi baris sengaja invalid/duplikat serta entitas yang tidak lengkap. Gunakan `seed-data.json` untuk seed relational.

## Expected mapping (referensi fixture terisolasi, bukan runtime import)

Bagian ini mendeskripsikan arti fixture CSV untuk pengujian mapping/normalisasi terisolasi jika helper test diperlukan. **Jangan membangun endpoint atau fitur import CSV pada baseline.**

- CSV contoh memiliki delapan header sumber: `no`, `nama tutor`, `nama murid`, `kelas`, `asal sekolah`, `mata pelajaran`, `tanggal les`, `durasi les`.
- `no` adalah nomor urut tampilan, bukan ID unik. Setiap sesi DB memiliki UUID internal.
- Tanggal `DD/MM/YYYY` dinormalisasi menjadi `YYYY-MM-DD` untuk `lesson_date`.
- Durasi seperti `90 menit` dinormalisasi menjadi integer `duration_minutes = 90`.
- `learning_material` disimpan dari form Tutor; materi dan catatan tidak berasal dari delapan kolom CSV.

## Expected period filtering

- Sesi dengan `lesson_date=2026-10-31` yang disubmit pada November tetap termasuk periode `2026-10`.
- Sesi dengan `lesson_date=2026-11-01` tidak termasuk periode `2026-10`.
- Gunakan rentang `lesson_date >= first_day AND lesson_date < first_day_of_next_month`.

## Expected status and anomaly behavior

- Submit baru mendapat `lesson_sessions.status = pending` dan `anomaly_analysis_status = pending`.
- Anomaly module mengklasifikasikan kandidat duplikasi/pola, menyimpan finding ke `anomaly_flags`, dan menautkan sesi pembanding jika tersedia.
- Temuan tidak otomatis menolak sesi, menghapus record, atau mengubah honor. Admin meninjau finding dan status sesi secara terpisah.
- Hanya sesi `approved` yang masuk estimasi honor dan Progress Anak.
- Sesi `revision_requested` hanya dapat diedit oleh Tutor pemilik sesi; setelah revisi pada record yang sama, `submitted_at` diperbarui, status kembali `pending`, metadata review payload lama dikosongkan, finding lama menjadi `superseded`, dan anomaly screening dijalankan ulang.

## Expected monthly Google Sheets export

- Expected export berisi semua sesi pada periode terpilih, apa pun status review-nya; kolom output tetap delapan kolom mentah.
- Header report persis delapan kolom asli. Jangan menambahkan status, materi, anomaly, honor, atau ID internal.
- `no` dibuat ulang 1..N sesuai urutan stabil. Tanggal/durasi diformat konsisten.
- Tab bernama `Absensi YYYY-MM`; ekspor ulang memperbarui isi tab bulan yang sama, bukan append.
- Ekspor kosong harus menolak replace tab yang berisi dengan `409 EMPTY_EXPORT_CONFIRMATION_REQUIRED` sampai Admin mengonfirmasi secara eksplisit. Respons preflight ini tidak membuat `sheet_export_runs`; hanya write attempt yang benar-benar dimulai yang dicatat.
- Perubahan manual di Google Sheets tidak mengubah Neon; Admin perlu ekspor ulang untuk melihat kondisi terbaru.

## Expected payroll

- Tarif development adalah **Rp50.000 per sesi**, melalui `tutor_rates` dengan `rate_type=per_session`, `rate_amount=50000`, dan `is_demo_assumption=true`.
- Nominal ini dummy, bukan tarif resmi UMKM. UI honor menampilkan label simulasi.
- Hanya sesi `approved` yang dihitung; pending/revisi/ditolak tidak masuk nominal.
- Honor adalah estimasi, bukan bukti pembayaran aktual.

## Expected authentication and access

- Admin dan Tutor login dengan username + password.
- Orang Tua login menggunakan satu ID Akses Orang Tua rahasia tanpa password. Fixture access code hanya untuk test lokal terisolasi.
- Parent hanya melihat siswa yang terhubung melalui `parent_students`; Tutor hanya melihat sesi miliknya; Admin hanya melakukan operasi sesuai role.
- Uji rate limit, cookie session, CSRF untuk mutasi, akses silang role, dan kebocoran credential pada response/log.
