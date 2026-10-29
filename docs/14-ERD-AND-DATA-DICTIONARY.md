# ERD dan Data Dictionary

Dokumen ini menjadi acuan skema Neon PostgreSQL + Drizzle untuk MVP. Nama implementasi boleh mengikuti konvensi repo, tetapi makna relasi, otorisasi, status, dan aturan bisnis harus tetap konsisten dengan PRD, API contract, dan tests.

## Keputusan domain yang sudah ditetapkan

- Setiap submit tutor membuat satu record `lesson_sessions` dengan status awal `pending`.
- Admin memeriksa sesi sebelum sesi dihitung ke estimasi honor.
- Tarif demo saat development adalah **Rp50.000 per sesi**. Ini data dummy yang dapat diganti melalui Master Data, bukan tarif resmi UMKM.
- Materi pembelajaran disimpan di database dan dipakai di Riwayat Mengajar serta Progress Anak. Materi tidak masuk ekspor standar delapan kolom.
- Modul anomali mengklasifikasikan kandidat anomali, termasuk dugaan duplikasi. Hasil AI tidak otomatis menolak sesi atau mengubah honor.
- Ekspor Google Sheets hanya dilakukan atas permintaan Admin, per bulan, memakai delapan kolom mentah yang diminta UMKM.
- Periode selalu ditentukan oleh `lesson_date`; tidak dibuat tabel khusus per bulan.

## 1. ERD

```mermaid
erDiagram
    USERS ||--o| TUTORS : "profil tutor"
    USERS ||--o{ PARENT_STUDENTS : "akun orang tua"
    STUDENTS ||--o{ PARENT_STUDENTS : "terhubung ke wali"

    TUTORS ||--o{ TUTOR_ASSIGNMENTS : "menerima penugasan"
    STUDENTS ||--o{ TUTOR_ASSIGNMENTS : "diajar melalui penugasan"
    SUBJECTS ||--o{ TUTOR_ASSIGNMENTS : "mata pelajaran"

    TUTOR_ASSIGNMENTS ||--o{ TUTOR_RATES : "tarif berlaku"
    TUTOR_ASSIGNMENTS ||--o{ LESSON_SESSIONS : "memiliki sesi"
    USERS o|--o{ LESSON_SESSIONS : "mereview"

    LESSON_SESSIONS ||--o{ ANOMALY_FLAGS : "memiliki temuan"
    LESSON_SESSIONS o|--o{ ANOMALY_FLAGS : "sesi pembanding"
    USERS o|--o{ ANOMALY_FLAGS : "meninjau temuan"
    USERS ||--o{ SHEET_EXPORT_RUNS : "menjalankan ekspor"

    USERS {
        uuid id PK
        string full_name
        string username UK
        string email UK
        string password_hash
        string parent_access_code_hash UK
        string role
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }
    TUTORS {
        uuid id PK
        uuid user_id FK
        string phone
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }
    STUDENTS {
        uuid id PK
        string full_name
        string grade
        string school_name
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }
    PARENT_STUDENTS {
        uuid parent_user_id PK, FK
        uuid student_id PK, FK
        string relationship
        timestamptz created_at
    }
    SUBJECTS {
        uuid id PK
        string name UK
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }
    TUTOR_ASSIGNMENTS {
        uuid id PK
        uuid tutor_id FK
        uuid student_id FK
        uuid subject_id FK
        date start_date
        date end_date
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }
    TUTOR_RATES {
        uuid id PK
        uuid assignment_id FK
        string rate_type
        numeric rate_amount
        boolean is_demo_assumption
        date effective_from
        date effective_to
        timestamptz created_at
        timestamptz updated_at
    }
    LESSON_SESSIONS {
        uuid id PK
        uuid client_submission_id UK
        uuid assignment_id FK
        date lesson_date
        int duration_minutes
        string learning_material
        text learning_notes
        text next_focus
        string status
        string anomaly_analysis_status
        string rate_type_snapshot
        numeric rate_amount_snapshot
        boolean rate_is_demo_snapshot
        uuid reviewed_by_user_id FK
        timestamptz submitted_at
        timestamptz reviewed_at
        timestamptz updated_at
        text admin_note
    }
    ANOMALY_FLAGS {
        uuid id PK
        uuid lesson_session_id FK
        uuid related_lesson_session_id FK
        string finding_type
        string severity
        text reason
        text evidence_summary
        string provider
        string model
        string review_status
        uuid reviewed_by_user_id FK
        timestamptz reviewed_at
        text review_note
        timestamptz created_at
    }
    SHEET_EXPORT_RUNS {
        uuid id PK
        uuid exported_by_user_id FK
        string report_type
        string period
        string spreadsheet_id
        string sheet_title
        int records_exported
        string status
        text safe_error_message
        timestamptz started_at
        timestamptz completed_at
    }
```

## 2. Prinsip relasi

- Dashboard bukan tabel. Ketiga role membaca data yang sama melalui endpoint dengan filter akses masing-masing.
- `lesson_sessions` adalah transaksi utama: satu baris per sesi les yang disubmit.
- `tutor_assignments` mengikat tutor, siswa, dan mapel; tutor hanya dapat submit dari assignment miliknya yang valid.
- `parent_students` membatasi siswa yang boleh dilihat akun orang tua.
- `users.username` dan `users.password_hash` digunakan untuk login Admin/Tutor. Orang tua hanya menggunakan `parent_access_code` yang menjadi kode rahasia akses; database menyimpan digest-nya, bukan kode mentah.
- Kode akses orang tua bukan `users.id`, ID siswa, NPM publik, nomor telepon, atau kode berurutan. Kode harus acak, sulit ditebak, hanya dibagikan privat, dapat dirotasi, dan dilindungi rate limit.
- `tutor_rates` menyimpan tarif demo Rp50.000 per sesi untuk data seed; `is_demo_assumption=true` membuat UI memberi label nominal simulasi. Submenu Tarif Honor diperlukan untuk konfigurasi development, sedangkan tarif resmi UMKM masih belum diketahui.
- `lesson_sessions.rate_amount_snapshot` ditetapkan saat sesi disetujui, menggunakan rate yang masa berlakunya mencakup `lesson_date`; snapshot menjaga histori honor tidak berubah saat tarif diganti.
- `anomaly_flags` menyimpan hasil klasifikasi/indikasi anomali, termasuk `suspected_duplicate`. Status proses agregat disimpan di `lesson_sessions.anomaly_analysis_status`; `anomaly_flags.review_status` memiliki nilai `pending_review`, `confirmed_anomaly`, `false_positive`, `resolved`, dan `superseded` (khusus ditetapkan sistem saat Tutor merevisi payload). Temuan tidak mengganti `lesson_sessions.status` dan harus ditinjau Admin.
- `sheet_export_runs` mencatat tindakan ekspor Admin. Tidak ada status sinkronisasi per sesi karena Sheets bukan tujuan submit live.
- `no` pada tampilan dan ekspor adalah nomor urut sementara, bukan ID stabil. ID internal selalu UUID.

## 3. Data dictionary

### 3.1 `users` — akun dan autentikasi

| Kolom | Tipe/constraint | Tujuan dan layar |
|---|---|---|
| `id` | UUID PK | Identitas internal semua role. |
| `full_name` | VARCHAR NOT NULL | Nama untuk profil, Master Data, dan laporan. |
| `username` | VARCHAR UNIQUE NULL | Username login Admin/Tutor; wajib untuk role `admin` dan `tutor`, tidak dipakai orang tua. |
| `email` | VARCHAR UNIQUE NULL | Kontak opsional, bukan metode login utama. |
| `password_hash` | VARCHAR NULL | Hash password Admin/Tutor; tidak pernah dikirim ke client. |
| `parent_access_code_hash` | CHAR(64) UNIQUE NULL | Digest berkunci dari kode akses acak orang tua; hanya untuk role `parent`, tidak pernah mengembalikan kode mentah sesudah pembuatan. |
| `role` | CHECK: `admin`, `tutor`, `parent` | Pembatasan akses dashboard/API. |
| `is_active` | BOOLEAN DEFAULT true | Mengontrol apakah akun dapat login; nonaktifkan akses tanpa menghapus histori. |
| `created_at`, `updated_at` | TIMESTAMPTZ | Timestamp administrasi. |

Constraint role harus memaksa credential sesuai jenis akun: Admin/Tutor wajib punya username dan password hash; Parent wajib punya digest kode akses. `users.is_active` mengontrol kemampuan login, sedangkan `tutors.is_active`/`students.is_active` mengontrol kelayakan operasional untuk assignment baru. Simpan kode akses menggunakan HMAC-SHA-256 dengan secret server-side khusus (`PARENT_ACCESS_CODE_PEPPER`) dan generate kode berentropi tinggi. Jangan gunakan hash biasa untuk menyimpan password; password Admin/Tutor memakai password hashing yang sesuai seperti Argon2id atau bcrypt dengan konfigurasi yang aman.

**Tab:** Login, profil, Master Data → Tutor dan Orang Tua/Wali, role guard.

### 3.2 `tutors` — profil tutor

| Kolom | Tipe/constraint | Tujuan dan layar |
|---|---|---|
| `id` | UUID PK | ID profil tutor yang dirujuk assignment. |
| `user_id` | UUID FK → `users.id`, UNIQUE NOT NULL | Akun login tutor. |
| `phone` | VARCHAR nullable | Kontak operasional jika diperlukan. |
| `is_active` | BOOLEAN DEFAULT true | Status operasional tutor: hanya tutor aktif bisa menerima assignment baru/submit sesi baru. Jika profil tutor dinonaktifkan tetapi akun `users.is_active` tetap aktif, akses histori sendiri dapat dipertahankan sampai akun login dinonaktifkan. |
| `created_at`, `updated_at` | TIMESTAMPTZ | Metadata perubahan. |

**Tab:** Master Data → Tutor; Dashboard Admin; Data Absensi/Rekap/Honor melalui relasi; Profil Tutor.

### 3.3 `students` — master siswa

| Kolom | Tipe/constraint | Tujuan dan layar |
|---|---|---|
| `id` | UUID PK | ID internal siswa. |
| `full_name` | VARCHAR NOT NULL | Nama di form, absensi, rekap, dan progres. |
| `grade` | VARCHAR NOT NULL | Kelas siswa. |
| `school_name` | VARCHAR NOT NULL | Asal sekolah. |
| `is_active` | BOOLEAN DEFAULT true | Mengontrol assignment/session baru. Histori yang sudah disimpan tetap dipertahankan; relasi orang tua aktif tetap dapat melihat sesi approved historis. |
| `created_at`, `updated_at` | TIMESTAMPTZ | Metadata. |

**Tab:** Master Data → Siswa; Form Tutor auto-fill kelas/sekolah; Data Absensi, Rekap, Progress Anak.

### 3.4 `parent_students` — hubungan orang tua dan anak

| Kolom | Tipe/constraint | Tujuan dan layar |
|---|---|---|
| `parent_user_id` | UUID FK → `users.id`, bagian PK gabungan | Akun parent yang terhubung. Harus role `parent`. |
| `student_id` | UUID FK → `students.id`, bagian PK gabungan | Anak yang boleh diakses akun tersebut. |
| `relationship` | VARCHAR nullable | Hubungan, misalnya ibu/ayah/wali. |
| `created_at` | TIMESTAMPTZ | Waktu relasi dibuat. |

PK gabungan (`parent_user_id`, `student_id`) mencegah relasi ganda. Satu akun parent dapat terhubung ke beberapa siswa; semua API tetap memeriksa relasi ini.

**Tab:** Master Data → Orang Tua/Wali; Dashboard Orang Tua.

### 3.5 `subjects` — mata pelajaran

| Kolom | Tipe/constraint | Tujuan dan layar |
|---|---|---|
| `id` | UUID PK | ID mapel. |
| `name` | VARCHAR UNIQUE NOT NULL | Nama mapel. |
| `is_active` | BOOLEAN DEFAULT true | Mengontrol pemakaian untuk assignment baru. |
| `created_at`, `updated_at` | TIMESTAMPTZ | Metadata. |

**Tab:** Master Data → Mata Pelajaran; Form Tutor, Data Absensi, Rekap, dan Progress Anak.

### 3.6 `tutor_assignments` — penugasan tutor-siswa-mapel

| Kolom | Tipe/constraint | Tujuan dan layar |
|---|---|---|
| `id` | UUID PK | Referensi assignment dari form. |
| `tutor_id` | UUID FK → `tutors.id` NOT NULL | Tutor yang mengajar. |
| `student_id` | UUID FK → `students.id` NOT NULL | Siswa yang diajar. |
| `subject_id` | UUID FK → `subjects.id` NOT NULL | Mapel yang ditugaskan. |
| `start_date` | DATE NOT NULL | Awal assignment. |
| `end_date` | DATE NULL | Akhir assignment jika sudah ada. |
| `is_active` | BOOLEAN DEFAULT true | Mengontrol opsi submit baru. |
| `created_at`, `updated_at` | TIMESTAMPTZ | Metadata. |

Server memastikan assignment milik tutor login, masih valid untuk tanggal sesi, dan menghubungkan siswa/mapel yang benar.

**Tab:** Master Data → Penugasan; pilihan siswa/mapel di Form Tutor; seluruh layar berbasis sesi.

### 3.7 `tutor_rates` — tarif honor

| Kolom | Tipe/constraint | Tujuan dan layar |
|---|---|---|
| `id` | UUID PK | ID tarif. |
| `assignment_id` | UUID FK → `tutor_assignments.id` NOT NULL | Konteks assignment tarif. |
| `rate_type` | VARCHAR CHECK `per_session` untuk MVP saat ini | Rumus demo yang disepakati untuk development. Jangan mengasumsikan aturan tarif resmi UMKM. |
| `rate_amount` | NUMERIC NOT NULL | Nominal IDR, bukan floating point. |
| `is_demo_assumption` | BOOLEAN NOT NULL DEFAULT false | Jika true, UI harus menampilkan label tarif simulasi. |
| `effective_from` | DATE NOT NULL | Tanggal mulai berlaku. |
| `effective_to` | DATE NULL | Tanggal akhir; NULL berarti masih berlaku. |
| `created_at`, `updated_at` | TIMESTAMPTZ | Metadata. |

Untuk seed/demo, setiap assignment aktif menggunakan `rate_type='per_session'`, `rate_amount=50000`, dan `is_demo_assumption=true`. Nilai ini dikelola lewat data tarif/seed, bukan di-hard-code di rumus service. Jika UMKM kemudian menetapkan formula berbeda, update model, aturan dan tests sebelum mengubah kalkulasi.

**Tab:** Master Data → Tarif Honor; Honor Tutor dan Honor Saya.

### 3.8 `lesson_sessions` — catatan pertemuan/absensi

| Kolom | Tipe/constraint | Tujuan dan layar |
|---|---|---|
| `id` | UUID PK | ID stabil sesi, dipakai relasi dan audit internal. |
| `client_submission_id` | UUID UNIQUE NOT NULL | Idempotency key dari frontend, dipakai ulang pada retry submit yang sama agar network retry/double click tidak membuat sesi kedua. Berbeda dari deteksi anomaly untuk dua submit berbeda. |
| `assignment_id` | UUID FK → `tutor_assignments.id` NOT NULL | Menentukan tutor, siswa, dan mapel. |
| `lesson_date` | DATE NOT NULL | Tanggal sesi; dasar semua filter bulan. |
| `duration_minutes` | INTEGER NOT NULL | Durasi konsisten dalam menit. |
| `learning_material` | VARCHAR NOT NULL | Materi; muncul di detail Riwayat Mengajar dan Progress Anak. |
| `learning_notes` | TEXT NULL | Catatan pembelajaran dari tutor. |
| `next_focus` | TEXT NULL | Fokus belajar berikutnya. |
| `status` | CHECK `pending`, `approved`, `revision_requested`, `rejected`; default `pending` | Siklus review admin. |
| `anomaly_analysis_status` | CHECK `pending`, `completed`, `failed`, `not_evaluated`; default `pending` | Status agregat analisis untuk sesi. Ini sumber status proses yang otoritatif; tabel `anomaly_flags` hanya menyimpan finding yang dihasilkan. |
| `rate_type_snapshot` | VARCHAR NULL | Jenis tarif sesi saat ditetapkan untuk honor. Saat MVP: `per_session`. |
| `rate_amount_snapshot` | NUMERIC NULL | Tarif per sesi yang digunakan untuk estimasi honor. |
| `rate_is_demo_snapshot` | BOOLEAN NULL | Menandai bila nominal pada snapshot masih tarif demo. |
| `reviewed_by_user_id` | UUID FK → `users.id` NULL | Admin yang meninjau payload sesi saat ini; direset ke NULL saat Tutor mengirim revisi payload baru. Full audit history tidak disimpan pada baseline. |
| `submitted_at` | TIMESTAMPTZ NOT NULL | Waktu submit payload sesi yang saat ini tersimpan; diperbarui saat Tutor mengirim revisi. Baseline tidak menyimpan seluruh sejarah submit. |
| `reviewed_at` | TIMESTAMPTZ NULL | Waktu review terakhir atas payload saat ini; direset ke NULL ketika payload direvisi oleh Tutor. |
| `updated_at` | TIMESTAMPTZ NOT NULL | Waktu record terakhir diperbarui. |
| `admin_note` | TEXT NULL | Catatan internal untuk payload saat ini, termasuk alasan revisi/penolakan; tidak ditampilkan ke orang tua dan direset ketika Tutor mengirim revisi baru. |

Saat submit, `status='pending'`. Ketika sesi `revision_requested` direvisi, `submitted_at` diperbarui ke waktu submit revisi; `reviewed_by_user_id`, `reviewed_at`, dan `admin_note` direset karena metadata review hanya berlaku untuk payload terbaru. Riwayat payload/keputusan terdahulu tidak disimpan pada baseline. Hanya sesi `approved` yang dapat masuk ke estimasi honor. Tarif snapshot ditetapkan dari tarif assignment yang aktif pada `lesson_date` sesuai aturan implementasi; sesi tanpa tarif tidak boleh diberi nominal palsu. Nominal demo harus terlihat sebagai simulasi.

**Tab:** Form Absensi, Riwayat Mengajar, Data Absensi, Rekap, Honor Tutor, Honor Saya, Progress Anak (field publik yang disetujui).

### 3.9 `anomaly_flags` — hasil deteksi/klasifikasi anomali

| Kolom | Tipe/constraint | Tujuan dan layar |
|---|---|---|
| `id` | UUID PK | ID temuan. |
| `lesson_session_id` | UUID FK → `lesson_sessions.id` NOT NULL | Sesi yang dianalisis. |
| `related_lesson_session_id` | UUID FK → `lesson_sessions.id` NULL | Sesi pembanding bila temuan duplikasi/pola berulang. |
| `finding_type` | CHECK `suspected_duplicate`, `duration_outlier`, `unusual_pattern` | Jenis finding baseline. Input invalid ditangani validator deterministik; `invalid_data` bukan finding AI untuk submit baru. |
| `severity` | VARCHAR NOT NULL | Label prioritas review seperti `low`, `medium`, `high`; bukan kepastian kecurangan. |
| `reason` | TEXT NOT NULL | Alasan yang bisa dibaca Admin. |
| `evidence_summary` | TEXT NULL | Ringkasan data pendukung dengan PII minimum. |
| `provider`, `model` | VARCHAR NULL | Provider/model yang menghasilkan klasifikasi jika AI dipakai. |
| `review_status` | CHECK `pending_review`, `confirmed_anomaly`, `false_positive`, `resolved`, `superseded`; default `pending_review` | Status review manusia, dipisahkan dari status sesi. |
| `reviewed_by_user_id` | UUID FK → `users.id` NULL | Admin yang meninjau. |
| `reviewed_at` | TIMESTAMPTZ NULL | Waktu review. |
| `review_note` | TEXT NULL | Keputusan/keterangan Admin. |
| `created_at` | TIMESTAMPTZ NOT NULL | Waktu finding dibuat. |

Anomaly module mengklasifikasikan dugaan duplikasi/pola anomali. Validasi struktur tetap deterministik. AI tidak boleh otomatis menghapus record, menolak sesi, atau mengubah honor. Admin dapat menandai `confirmed_anomaly`, `false_positive`, atau `resolved`. Sistem menandai finding lama `superseded` secara otomatis ketika Tutor mengirim revisi payload; status ini bukan keputusan manual Admin.

**Tab:** Admin → Data Absensi (indikator, detail, dan review). Temuan internal tidak ditampilkan kepada Tutor/Orang Tua secara mentah.

### 3.10 `sheet_export_runs` — histori ekspor bulanan

| Kolom | Tipe/constraint | Tujuan dan layar |
|---|---|---|
| `id` | UUID PK | ID percobaan ekspor. |
| `exported_by_user_id` | UUID FK → `users.id` NOT NULL | Admin yang memulai ekspor. |
| `report_type` | VARCHAR NOT NULL | Saat MVP: `attendance`. |
| `period` | VARCHAR `YYYY-MM` | Bulan yang diekspor. |
| `spreadsheet_id` | VARCHAR NOT NULL | ID spreadsheet tujuan ketika ekspor dijalankan; bukan credential. Dibutuhkan agar histori menunjuk ke file yang benar jika konfigurasi berubah kemudian. |
| `sheet_title` | VARCHAR NOT NULL | Nama tab tujuan, contoh `Absensi 2026-10`. |
| `records_exported` | INTEGER NOT NULL DEFAULT 0 | Jumlah baris data yang ditulis, tidak termasuk header. |
| `status` | VARCHAR: `running`, `succeeded`, `failed` | Status percobaan. |
| `safe_error_message` | TEXT NULL | Pesan error aman tanpa credential/payload sensitif. |
| `started_at` | TIMESTAMPTZ NOT NULL | Waktu ekspor mulai. |
| `completed_at` | TIMESTAMPTZ NULL | Waktu ekspor selesai; `NULL` selama status `running`, terisi saat status menjadi `succeeded` atau `failed`. |

**Tab:** Admin → Rekap → status dan histori ekspor. Sheets tetap snapshot; perubahan setelah ekspor membutuhkan ekspor ulang.

## 4. Constraint dan indeks yang disarankan

- Unique index untuk `users.username` saat tidak NULL dan `users.parent_access_code_hash` saat tidak NULL; `email` unik jika diisi.
- Role credential check: `admin`/`tutor` membutuhkan `username` dan `password_hash`; `parent` membutuhkan `parent_access_code_hash`.
- FK dan constraint unique untuk relasi orang tua-anak, nama mapel, dan ID yang relevan.
- Index pada `lesson_sessions.lesson_date`, `lesson_sessions.status`, `tutor_assignments.tutor_id`, `tutor_assignments.student_id`, serta kombinasi yang mendukung query laporan bulanan.
- Index pada `anomaly_flags.lesson_session_id` dan status review; `sheet_export_runs.period` serta `started_at`.
- Gunakan soft deactivation untuk master data yang sudah digunakan. Hindari cascade delete sesi historis.
- Cegah overlap periode tarif untuk assignment yang sama.
- `client_submission_id` harus unique dan wajib pada submit awal. Frontend membuat UUID sekali untuk submission dan menggunakan ulang pada retry; backend mengembalikan record sesi yang sama untuk key/body yang sama dan `409` bila key sama dipakai untuk payload berbeda. UI tetap mencegah double-click.

## 5. Aturan waktu dan bulan

- `lesson_date` adalah `DATE` tanpa jam; jangan menggesernya karena konversi zona waktu.
- `submitted_at`, `reviewed_at`, dan `updated_at` adalah `TIMESTAMPTZ`.
- API menggunakan `period=YYYY-MM`, lalu query `lesson_date >= first_day AND lesson_date < first_day_next_month`.
- Sesi tanggal 31 Oktober yang baru dilaporkan pada November tetap termasuk Oktober.
