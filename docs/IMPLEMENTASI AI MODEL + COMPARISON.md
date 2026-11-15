# Implementasi Model AI & Mekanisme _Comparisons_ pada Validasi Absen Tutor

Dokumen ini merangkum aturan validitas absen (revisi terbaru 19 fitur), arsitektur pemrosesan di FastAPI, skema _comparisons_ (+-30 hari, batas 500 sesi), contoh transformasi data dari JSON mentah hingga _response_ akhir, serta hasil verifikasi _dataset_ `sessions_with_synthetic.csv`.

---

## 1. Latar Belakang Masalah & Aturan Bisnis Validitas (_Rules_)

### 1.1 Aturan Bisnis Validitas Absen (Revisi Terbaru + Aturan Bentrok Jadwal)

Setiap absen tutor yang masuk dinilai dan diberi 1 dari 3 label validitas (_validity_) berikut:

| Label               | Warna UI | Kondisi Penentu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Efek di Aplikasi                                                                                   |
| ------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 🔴 `rejected`       | Merah    | **Duplikat 100% (Persis):** `tutor_id`, `student_id`, `subject_ids`, `lesson_date`, **`start_time`**, dan `duration_minutes` (6 atribut) sama persis dengan sesi yang di-_submit_ lebih dulu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Ditahan dari rekap gaji. Tutor **tidak bisa** mengedit, Admin memiliki opsi _delete_ (hapus)       |
| 🔵 `needs_revision` | Biru     | Terkena salah satu dari **8 kondisi** berikut:<br>1. Durasi terlalu panjang (`> 180` menit)<br>2. Durasi terlalu pendek (`< 30` menit) 🆕<br>3. Mulai terlalu malam (`> "21:00"`)<br>4. Mulai terlalu pagi (`< "07:00"`) 🆕<br>5. **Duplikat samar:** 5 atribut sama (`tutor_id`, `student_id`, `subject_ids`, `lesson_date`, `duration_minutes`), tetapi **`start_time` berbeda** 🆕<br>6. **_Overlap_ jadwal tutor:** tutor yang sama memiliki sesi yang jamnya bertabrakan dengan **murid lain** di tanggal yang sama 🆕<br>7. **_Overlap_ jadwal murid:** murid yang sama memiliki sesi yang jamnya bertabrakan dengan **tutor lain** di tanggal yang sama 🆕<br>8. **_Overlap_ murid + tutor sendiri:** tutor dan murid yang sama memiliki 2 entri yang jamnya bertabrakan di tanggal yang sama tetapi bukan duplikat persis (misal jam mulai sama tapi durasi beda, atau mapel beda) 🆕 | Ditahan dari rekap gaji. Tutor **bisa mengedit**, dan Admin bisa menyetujui (_approve_) hasil edit |
| 🟢 `valid`          | Hijau    | Tidak ada temuan anomali. Durasi tepat `30` atau `180` menit dan jam mulai tepat `07:00` atau `21:00` tetap dianggap `valid`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Langsung `approved` dan **masuk ke rekap gaji** tutor serta tagihan                                |

#### Aturan Tambahan

- **Urutan Prioritas:** `rejected` > `needs_revision` > `valid`. Jika suatu sesi terkena `rejected` sekaligus `needs_revision` (misalnya duplikat persis dengan durasi 200 menit), status akhir `validity` wajib **`rejected`**, namun semua temuan tetap ditulis di dalam kolom `findings`.
- **Jumlah Mata Pelajaran (`subject_ids`):** Boleh berisi **1–5** mata pelajaran (terurut) dan tidak ada yang dibuang.
- **Akses Admin:** Admin memiliki akses penuh (_create, edit, delete_) ke seluruh data untuk mengoreksi kemungkinan salah label (_mislabelling_) dari AI.

---

### 1.2 Masalah pada _Prototype_ Awal (Gemini)

Pada _prototype_ awal yang dibuat _fullstack_, penilaian menggunakan _Generative AI_ (Gemini). Sebelum memanggil Gemini, _backend_ menjalankan aturan _if-else_ (_rule engine_) untuk membentuk daftar kecurigaan awal yang disebut `candidates`. Jika `candidates` kosong, sesi langsung dianggap `valid` dan AI tidak dipanggil.

Ketika _prototype_ ini diganti dengan model _machine learning_ (ML) buatan sendiri di layanan FastAPI, penggunaan `candidates` dari _backend_ dihapus agar seluruh deteksi dan pengambilan keputusan dilakukan sepenuhnya di dalam layanan AI (FastAPI).

### 1.3 Masalah Inti: `target` Saja Tidak Cukup untuk Mendeteksi Duplikat & _Overlap_

Sesi absen baru yang dikirim tutor disebut `target`.

- Untuk mengecek durasi (`< 30` atau `> 180` menit) dan jam mulai (`< 07:00` atau `> 21:00`), model cukup memeriksa data `target` itu sendiri.
- Namun, untuk mengecek **duplikat persis (`rejected`)**, **duplikat samar**, dan **3 jenis _overlap_ jadwal (`needs_revision`)**, model membutuhkan daftar sesi-sesi sebelumnya untuk dibandingkan.

Daftar sesi riwayat yang diambil oleh _backend_ dan dikirim bersama `target` sebagai bahan pembanding inilah yang disebut **`comparisons`**.

---

## 2. Cara Kerja AI Mengolah `target` dan `comparisons`

Model yang digunakan adalah **klasifikasi tabular 3 kelas** (_Supervised Learning_, seperti _LightGBM_, _XGBoost_, atau _Random Forest_). Model matematika (`model.pkl`) hanya menerima **deret angka (vektor 19 fitur)** dan tidak membaca teks JSON mentah atau kode _Universally Unique Identifier_ (UUID, kode identitas unik 36 karakter).

Oleh karena itu, di dalam layanan FastAPI terdapat **2 komponen yang bekerja berurutan**:

1. **Kode Python (`features.py` — Fungsi Transformasi):** Mengubah JSON mentah (`target` + `comparisons` + `config`) menjadi baris 19 fitur angka.
2. **_File_ Model AI (`model.pkl`):** Menerima 19 fitur angka tersebut dan memprediksi kelas `valid`, `needs_revision`, atau `rejected`.

_Backend_ tidak melakukan transformasi angka ini; _backend_ hanya mengirimkan JSON mentah `{ target, comparisons, config }` ke FastAPI.

### 2.1 Lima Tahap Proses di Layanan FastAPI

```
[1. JSON Masuk]       target + comparisons (+-30 hari, maks 500 sesi) + config dari Backend
        ↓
[2. Transformasi]     Kode Python (features.py) di FastAPI mengubah JSON menjadi 19 fitur angka
        ↓
[3. Model ML (.pkl)]  Menghitung probabilitas dan memprediksi kelas validity
        ↓
[4. Guardrail]        Pengaman deterministik agar aturan bisnis mutlak tidak meleset
        ↓
[5. JSON Keluar]      Merakit validity, validity_reason, dan findings ke Backend
```

### 2.2 Tiga Pintu Pemeriksaan Klasifikasi

Penilaian satu sesi `target` melewati 3 pintu berurutan:

1. **Pintu 1 — Cek `rejected` (Merah):** Bandingkan `target` dengan setiap item di `comparisons`. Jika ada sesi pembanding yang 6 atributnya sama persis (`exact_dup_count >= 1`), putuskan `rejected`. Jika tidak ada, lanjut ke Pintu 2.
2. **Pintu 2 — Cek `needs_revision` (Biru):** Cek apakah salah satu dari 6 fitur batas/bentrok menyala (`duration_over_limit > 0`, `duration_under_limit > 0`, `start_over_limit > 0`, `start_under_limit > 0`, `fuzzy_dup_count >= 1`, `tutor_overlap_diff_student_count >= 1`, `student_overlap_diff_tutor_count >= 1`, atau `self_overlap_count >= 1`). Jika ya, putuskan `needs_revision`. Jika tidak, lanjut ke Pintu 3.
3. **Pintu 3 — `valid` (Hijau):** Jika lolos Pintu 1 dan Pintu 2, sesi diputuskan `valid`.

---

## 3. Skema _Comparisons_ & Transformasi ke 19 Fitur Angka

### 3.1 Kriteria Pengambilan Sesi ke dalam `comparisons`

Sebuah sesi riwayat dimasukkan ke dalam _array_ `comparisons` milik suatu `target` jika memenuhi 3 syarat:

1. **Orang yang sama:** Memiliki `tutor_id` yang sama **atau** `student_id` yang sama dengan `target`.
2. **Rentang waktu +-30 hari:** Selisih `lesson_date` maksimal 30 hari dari `target.lesson_date`.
3. **Dikirim lebih awal:** Nilai `submitted_at` (waktu tutor menekan tombol _submit_) lebih kecil/lebih dulu daripada `target.submitted_at`. Batas maksimal sesi yang diambil di _backend_ adalah **500 sesi** (`MAX_COMPARISONS = 500`).

**Fungsi `submitted_at`:** Waktu _submit_ bukan penentu anomali, melainkan penentu sesi mana yang masuk lebih dulu ke _database_:

- **Absen ke-1 (masuk duluan):** Dianggap data asli -> statusnya **`valid`** (atau sesuai kondisi dirinya sendiri) karena saat sesi itu masuk, kembarannya belum ada di `comparisons`.
- **Absen ke-2 (masuk belakangan):** Dianggap data duplikat -> statusnya **`rejected` (Merah / ditolak)** karena di dalam `comparisons`-nya sudah tercatat Absen ke-1.

### 3.2 Isi _Field_ di Dalam JSON `comparisons` dan `config`

Setiap item di dalam _array_ `comparisons` memiliki 8 _field_ yang sama persis dengan `target`:

| No  | Nama _Field_       | Contoh Nilai             | Fungsi dalam Perbandingan                                                                                                                  |
| --- | ------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `id`               | `"aaaaaaaa-aaaa-..."`    | ID unik sesi pembanding. Jika terbukti kembar atau bentrok dengan `target`, ID ini diisikan ke `related_lesson_session_id` pada `findings` |
| 2   | `tutor_id`         | `"11111111-1111-..."`    | Dicek apakah sama dengan `target.tutor_id`                                                                                                 |
| 3   | `student_id`       | `"22222222-2222-..."`    | Dicek apakah sama dengan `target.student_id`                                                                                               |
| 4   | `subject_ids`      | `["33333333-..."]`       | Daftar UUID mata pelajaran (1–5 item, terurut); dicek apakah sama atau beririsan dengan `target.subject_ids`                               |
| 5   | `lesson_date`      | `"2026-09-02"`           | Tanggal les (`YYYY-MM-DD`); dicek apakah sama dengan `target.lesson_date` atau dalam +-30 hari                                             |
| 6   | `start_time`       | `"14:00"`                | Jam mulai (`HH:MM` atau `null`); dicek apakah sama atau rentang jamnya (`start_time` s/d `start_time + duration_minutes`) bertabrakan      |
| 7   | `duration_minutes` | `60`                     | Durasi menit; dicek apakah sama dengan `target.duration_minutes` dan dihitung rata-ratanya                                                 |
| 8   | `submitted_at`     | `"2026-09-02T08:05:00Z"` | Memastikan sesi pembanding dikirim lebih awal dari `target`                                                                                |

Objek **`config`** berisi **4 ambang batas** (2 kunci lama + 2 kunci baru):

```json
"config": {
  "durationOutlierMinutes": 180,
  "durationMinMinutes": 30,
  "lateStartAfter": "21:00",
  "earlyStartBefore": "07:00"
}
```

_(Di FastAPI, `durationMinMinutes = 30` dan `earlyStartBefore = "07:00"` diberi nilai default agar tetap aman jika backend hanya mengirim 2 kunci lama)._

---

### 3.3 Daftar 19 Fitur Angka Hasil Transformasi (`FEATURE_NAMES`)

Total terdapat **19 fitur** = 13 fitur awal (no. 1–13) + 6 fitur baru (no. 14–19, ditandai 🆕).
Urutan nomor `1` sampai `19` (`FEATURE_NAMES` di `features.py`) adalah urutan tetap untuk input model; mengubah urutan berarti model harus dilatih ulang.

#### A. Fitur dari `target` & `config` (7 Fitur: No. 1–5, 14–15)

| No    | Nama Fitur             | Rumus                                       | Arti                                                       |
| ----- | ---------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| 1     | `duration_minutes`     | `target.duration_minutes`                   | Lama les dalam menit                                       |
| 2     | `duration_over_limit`  | `duration_minutes - 180`                    | Positif (`> 0`) = durasi `> 180` menit (`needs_revision`)  |
| 3     | `start_minute`         | `jam * 60 + menit` dari `target.start_time` | Jam mulai dalam menit sejak `00:00` (`14:00` = `840`)      |
| 4     | `start_over_limit`     | `start_minute - 1260` (`21:00` = `1260`)    | Positif (`> 0`) = mulai setelah `21:00` (`needs_revision`) |
| 5     | `subject_count`        | Jumlah item `target.subject_ids`            | Banyaknya mata pelajaran (1–5)                             |
| 14 🆕 | `duration_under_limit` | `30 - duration_minutes`                     | Positif (`> 0`) = durasi `< 30` menit (`needs_revision`)   |
| 15 🆕 | `start_under_limit`    | `420 - start_minute` (`07:00` = `420`)      | Positif (`> 0`) = mulai sebelum `07:00` (`needs_revision`) |

#### B. Fitur dari Perbandingan `target` dengan `comparisons` (12 Fitur: No. 6–13, 16–19)

| No    | Nama Fitur                           | Cara Menghitung dari `comparisons`                                                                                                    | Arti                                                           |
| ----- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 6     | `comparisons_count`                  | Jumlah sesi di `comparisons`                                                                                                          | Banyaknya riwayat +-30 hari                                    |
| 7     | `exact_dup_count`                    | Sesi dengan `tutor_id`, `student_id`, `subject_ids`, `lesson_date`, **`start_time`**, dan `duration_minutes` sama persis (6 atribut)  | **`>= 1` -> `rejected`** (duplikat persis 100%)                |
| 8     | `same_tutor_student_date_count`      | Sesi dengan tutor, murid, dan tanggal sama (mapel/durasi/jam boleh beda)                                                              | Konteks: input ganda di hari yang sama                         |
| 9     | `same_student_date_diff_tutor_count` | Sesi dengan murid dan tanggal sama, mapel beririsan, tutor beda                                                                       | Konteks: satu murid diinput dua tutor                          |
| 10    | `time_overlap_count`                 | Sesi di tanggal sama yang jamnya bertabrakan, tutor **atau** murid sama                                                               | Konteks: total jadwal bertabrakan (semua jenis)                |
| 11    | `tutor_sessions_30d`                 | Sesi milik tutor yang sama                                                                                                            | Keaktifan tutor sebulan                                        |
| 12    | `student_sessions_30d`               | Sesi milik murid yang sama                                                                                                            | Frekuensi les murid sebulan                                    |
| 13    | `duration_diff_from_tutor_mean_30d`  | `duration_minutes` - rata-rata durasi tutor tsb. (`0` bila tidak ada riwayat)                                                         | Seberapa menyimpang dari kebiasaan durasi tutor                |
| 16 🆕 | `fuzzy_dup_count`                    | Sesi dengan 5 atribut sama (`tutor_id`, `student_id`, `subject_ids`, `lesson_date`, `duration_minutes`), tetapi **`start_time` beda** | **`>= 1` -> `needs_revision`** (duplikat samar)                |
| 17 🆕 | `tutor_overlap_diff_student_count`   | Sesi di tanggal sama dengan **tutor yang sama**, **murid lain**, dan rentang jam bertabrakan                                          | **`>= 1` -> `needs_revision`** (jadwal tutor bentrok)          |
| 18 🆕 | `student_overlap_diff_tutor_count`   | Sesi di tanggal sama dengan **murid yang sama**, **tutor lain**, dan rentang jam bertabrakan                                          | **`>= 1` -> `needs_revision`** (jadwal murid bentrok)          |
| 19 🆕 | `self_overlap_count`                 | Sesi di tanggal sama dengan **tutor dan murid yang sama**, rentang jam bertabrakan, tetapi **bukan duplikat persis**                  | **`>= 1` -> `needs_revision`** (bentrok murid+tutor yang sama) |

_(Catatan: Dua sesi `A` dan `B` pada tanggal yang sama disebut **jamnya bertabrakan / overlap** apabila `start_min_A < end_min_B` DAN `start_min_B < end_min_A`, di mana `end_min = start_min + duration_minutes`. Fitur no. 8–13 memberi konteks statistik tambahan bagi model)._

---

### 3.4 Arti Angka Minus (`-`), Nol (`0`), dan Positif (`+`) pada 4 Fitur Batas

Semua fitur batas (no. 2, 4, 14, 15) memakai kaidah yang seragam:

- **Hasil Minus (`-`) atau Nol (`0`)** -> **Aman (`valid`)**, masih di dalam batas atau tepat di garis batas.
- **Hasil Positif (`> 0`)** -> **Melanggar batas (`needs_revision`)**.

#### 1. Batas Durasi: `duration_over_limit` (`Durasi - 180`) & `duration_under_limit` (`30 - Durasi`)

| Durasi Les Tutor                | `duration_over_limit` (`Durasi - 180`) | `duration_under_limit` (`30 - Durasi`) | Artinya bagi AI                                               |
| ------------------------------- | -------------------------------------- | -------------------------------------- | ------------------------------------------------------------- |
| **20 menit** (Terlalu pendek)   | `-160`                                 | **`+10` (Positif)**                    | **PERLU REVISI!** Kurang 10 menit dari batas minimal 30 menit |
| **30 menit** (Pas batas bawah)  | `-150`                                 | **`0` (Nol)**                          | **Aman!** Pas di batas minimal 30 menit                       |
| **60 menit** (Normal)           | **`-120` (Minus)**                     | **`-30` (Minus)**                      | **Aman!** Kedua fitur bernilai minus                          |
| **180 menit** (Pas batas atas)  | **`0` (Nol)**                          | `-150`                                 | **Aman!** Pas di batas maksimal 180 menit                     |
| **210 menit** (Terlalu panjang) | **`+30` (Positif)**                    | `-180`                                 | **PERLU REVISI!** Kelebihan 30 menit di atas batas 180 menit  |

#### 2. Batas Jam Mulai: `start_over_limit` (`Jam - 1260`) & `start_under_limit` (`420 - Jam`)

_(Pukul `07:00` = `420` menit; pukul `21:00` = `1260` menit)_

| Jam Mulai Les                | `start_over_limit` (`Jam - 1260`) | `start_under_limit` (`420 - Jam`) | Artinya bagi AI                                             |
| ---------------------------- | --------------------------------- | --------------------------------- | ----------------------------------------------------------- |
| **06:30 pagi** (390 menit)   | `-870`                            | **`+30` (Positif)**               | **PERLU REVISI!** 30 menit terlalu pagi sebelum pukul 07:00 |
| **07:00 pagi** (420 menit)   | `-840`                            | **`0` (Nol)**                     | **Aman!** Pas pukul 07:00 pagi                              |
| **14:00 siang** (840 menit)  | **`-420` (Minus)**                | **`-420` (Minus)**                | **Aman!** Kedua fitur bernilai minus                        |
| **21:00 malam** (1260 menit) | **`0` (Nol)**                     | `-840`                            | **Aman!** Pas pukul 21:00 malam                             |
| **21:30 malam** (1290 menit) | **`+30` (Positif)**               | `-870`                            | **PERLU REVISI!** Lewat 30 menit di atas pukul 21:00 malam  |

---

## 4. Contoh Lengkap Alur Data: Sebelum Transformasi -> Sesudah Transformasi -> _Response_ Akhir

### 4.1 SEBELUM Transformasi: JSON Mentah dari _Backend_ ke FastAPI

Contoh kasus **Duplikat Persis (`rejected`)**:

```json
{
  "target": {
    "id": "sesi-baru-002",
    "tutor_id": "tutor-diva",
    "student_id": "murid-abqary",
    "subject_ids": ["mapel-mtk"],
    "lesson_date": "2026-09-02",
    "start_time": "14:00",
    "duration_minutes": 60,
    "submitted_at": "2026-09-02T08:20:00Z"
  },
  "comparisons": [
    {
      "id": "sesi-lama-001",
      "tutor_id": "tutor-diva",
      "student_id": "murid-abqary",
      "subject_ids": ["mapel-mtk"],
      "lesson_date": "2026-09-02",
      "start_time": "14:00",
      "duration_minutes": 60,
      "submitted_at": "2026-09-02T08:05:00Z"
    },
    {
      "id": "sesi-minggu-lalu-000",
      "tutor_id": "tutor-diva",
      "student_id": "murid-abqary",
      "subject_ids": ["mapel-mtk"],
      "lesson_date": "2026-08-26",
      "start_time": "14:00",
      "duration_minutes": 60,
      "submitted_at": "2026-08-26T09:00:00Z"
    }
  ],
  "config": {
    "durationOutlierMinutes": 180,
    "durationMinMinutes": 30,
    "lateStartAfter": "21:00",
    "earlyStartBefore": "07:00"
  }
}
```

### 4.2 SETELAH Transformasi: Objek 19 Fitur Angka di Dalam FastAPI

Begitu JSON di atas masuk ke FastAPI, fungsi Python `features.py` menghitung 19 fitur angka sesuai urutan `FEATURE_NAMES`:

```json
{
  "features": {
    "duration_minutes": 60,
    "duration_over_limit": -120,
    "start_minute": 840,
    "start_over_limit": -420,
    "subject_count": 1,
    "comparisons_count": 2,
    "exact_dup_count": 1,
    "same_tutor_student_date_count": 1,
    "same_student_date_diff_tutor_count": 0,
    "time_overlap_count": 1,
    "tutor_sessions_30d": 2,
    "student_sessions_30d": 2,
    "duration_diff_from_tutor_mean_30d": 0.0,
    "duration_under_limit": -30,
    "start_under_limit": -420,
    "fuzzy_dup_count": 0,
    "tutor_overlap_diff_student_count": 0,
    "student_overlap_diff_tutor_count": 0,
    "self_overlap_count": 0
  },
  "helper_meta": {
    "target_id": "sesi-baru-002",
    "exact_dup_session_id": "sesi-lama-001",
    "fuzzy_dup_session_id": null,
    "tutor_overlap_session_id": null,
    "student_overlap_session_id": null,
    "self_overlap_session_id": null
  }
}
```

### 4.3 Masuk ke `model.pkl` -> Keluar JSON _Response_ Akhir ke _Backend_

1. Vektor 19 angka dimasukkan ke `model.pkl`:
   `model.predict([[60, -120, 840, -420, 1, 2, 1, 1, 0, 1, 2, 2, 0.0, -30, -420, 0, 0, 0, 0]])`
2. Model dan _guardrail_ melihat `exact_dup_count = 1`, sehingga memutuskan **`"rejected"`**.
3. FastAPI membungkus hasil tersebut menjadi JSON _response_ sesuai kontrak aplikasi:

```json
{
  "validity": "rejected",
  "validity_reason": "Sesi dinilai duplikat dari sesi yang sudah tercatat dengan tutor, murid, mata pelajaran, tanggal, jam mulai, dan durasi yang sama.",
  "findings": [
    {
      "lesson_session_id": "sesi-baru-002",
      "related_lesson_session_id": "sesi-lama-001",
      "is_anomaly": true,
      "finding_type": "suspected_duplicate",
      "severity": "medium",
      "reason": "Sesi memiliki tutor, murid, mata pelajaran, tanggal, jam mulai, dan durasi yang sama persis dengan sesi yang dikirim lebih awal.",
      "evidence_summary": "Tanggal 2026-09-02 pukul 14:00 (durasi 60 menit) sama dengan sesi pembanding.",
      "suggested_action": "review"
    }
  ]
}
```

### 4.4 Pemetaan Kondisi Anomali ke `finding_type` Database (Tanpa Ubah Database)

Tabel `anomaly_flags` di PostgreSQL memiliki _check constraint_ `finding_type IN ('suspected_duplicate', 'duration_outlier', 'late_start', 'unusual_pattern')`. Agar tidak perlu mengubah skema database, 9 kondisi anomali dipetakan sebagai berikut:

| Kondisi yang Menyala                                           | `finding_type` di JSON _Response_ | `related_lesson_session_id`               |
| -------------------------------------------------------------- | --------------------------------- | ----------------------------------------- |
| `exact_dup_count >= 1` (Duplikat persis)                       | `"suspected_duplicate"`           | ID sesi kembaran dari `comparisons`       |
| `fuzzy_dup_count >= 1` (Duplikat samar beda jam mulai)         | `"suspected_duplicate"`           | ID sesi kembaran samar dari `comparisons` |
| `duration_over_limit > 0` (Durasi `> 180` menit)               | `"duration_outlier"`              | `null`                                    |
| `duration_under_limit > 0` (Durasi `< 30` menit)               | `"duration_outlier"`              | `null`                                    |
| `start_over_limit > 0` (Mulai `> 21:00`)                       | `"late_start"`                    | `null`                                    |
| `start_under_limit > 0` (Mulai `< 07:00`)                      | `"late_start"`                    | `null`                                    |
| `tutor_overlap_diff_student_count >= 1` (Bentrok jadwal tutor) | `"unusual_pattern"`               | ID sesi yang bentrok dari `comparisons`   |
| `student_overlap_diff_tutor_count >= 1` (Bentrok jadwal murid) | `"unusual_pattern"`               | ID sesi yang bentrok dari `comparisons`   |
| `self_overlap_count >= 1` (Bentrok tutor+murid yang sama)      | `"unusual_pattern"`               | ID sesi yang bentrok dari `comparisons`   |

---

## 5. Hasil Verifikasi _Dataset_ `docs/dataset/sessions_with_synthetic.csv`

_File_ `sessions_with_synthetic.csv` yang telah disiapkan DS memuat **7.557 baris** (`4.760` baris data asli `real` + `2.797` baris anomali sintetis `is_synthetic = 1`).

### 5.1 Komposisi Label (Target 60% : 20% : 20%)

Saat dihitung dengan 19 fitur pada jendela +-30 hari:

- 🟢 **`valid`:** **4.534 baris (60.00%)**
- 🔵 **`needs_revision`:** **1.511 baris (19.99%)**
- 🔴 **`rejected`:** **1.512 baris (20.01%)**

### 5.2 Distribusi per Skenario (`scenario`)

| Nama `scenario`          | Jumlah Baris | Hasil Label                                        | Keterangan                                                                |
| ------------------------ | ------------ | -------------------------------------------------- | ------------------------------------------------------------------------- |
| `real`                   | 4.760        | `4.434 valid`, `287 needs_revision`, `39 rejected` | Data riil bimbel                                                          |
| `batas_valid`            | 100          | `100 valid`                                        | Kasus batas tepat `30` mnt, `180` mnt, `07:00`, dan `21:00`               |
| `duplikat`               | 1.273        | `1.273 rejected`                                   | Duplikat persis 6 atribut                                                 |
| `durasi_panjang`         | 128          | `128 needs_revision`                               | Durasi `181–299` menit                                                    |
| `durasi_pendek`          | 128          | `128 needs_revision`                               | Durasi `10–29` menit                                                      |
| `mulai_malam`            | 128          | `128 needs_revision`                               | Mulai `21:01–22:30`                                                       |
| `mulai_pagi`             | 128          | `128 needs_revision`                               | Mulai `01:00–06:59`                                                       |
| `duplikat_samar`         | 128          | `128 needs_revision`                               | 5 atribut sama, `start_time` beda                                         |
| `tumpang_tindih`         | 128          | `128 needs_revision`                               | _Overlap_ jadwal tutor dg murid lain                                      |
| `tumpang_tindih_murid`   | 128          | `128 needs_revision`                               | _Overlap_ jadwal murid dg tutor lain                                      |
| `tumpang_tindih_sendiri` | 128          | `128 needs_revision`                               | _Overlap_ tutor+murid yang sama (bukan duplikat persis)                   |
| `kombinasi_dup_panjang`  | 100          | `50 needs_revision`, `50 rejected`                 | 50 pasang: sesi ke-1 `needs_revision`, sesi ke-2 (duplikatnya) `rejected` |
| `kombinasi_dup_pendek`   | 100          | `50 needs_revision`, `50 rejected`                 | 50 pasang: sesi ke-1 `needs_revision`, sesi ke-2 `rejected`               |
| `kombinasi_dup_malam`    | 100          | `50 needs_revision`, `50 rejected`                 | 50 pasang: sesi ke-1 `needs_revision`, sesi ke-2 `rejected`               |
| `kombinasi_dup_pagi`     | 100          | `50 needs_revision`, `50 rejected`                 | 50 pasang: sesi ke-1 `needs_revision`, sesi ke-2 `rejected`               |

### 5.3 Statistik `comparisons` (+-30 Hari) di Dalam CSV

- **Rata-rata (`Mean`):** 37,6 sesi pembanding per baris (`Median`: 34 sesi).
- **Rentang:** minimal `0` sesi, maksimal `198` sesi.
- Dengan memasang batas `MAX_COMPARISONS = 500` di _backend_, seluruh riwayat +-30 hari (baik pada dataset saat ini maupun saat jumlah murid bertambah) selalu terambil utuh tanpa ada yang terpotong.

---

## 6. Alur _Training_ Model & Keputusan Arsitektur Akhir

### 6.1 Dua Tahap Pembuatan Model dari `sessions_with_synthetic.csv`

1. **Tahap 1 — Ekstraksi CSV Fitur (`features.py`):** Membaca `sessions_with_synthetic.csv` (10 kolom mentah), mencari `comparisons` +-30 hari untuk setiap baris, dan menghitung **19 kolom fitur angka** + kolom target `validity` menjadi tabel fitur siap latih.
2. **Tahap 2 — _Training_ Model (`train.py`):** Melatih model klasifikasi tabular (`model.fit(X, y)`) menggunakan 19 kolom fitur angka tersebut dan menyimpannya ke `model.pkl` untuk dipasang di FastAPI.

### 6.2 Ringkasan Keputusan Teknis

1. **Database PostgreSQL:** **Tidak ada perubahan tabel/kolom** (sudah mendukung `validity`, `1–5` mata pelajaran di `lesson_session_subjects`, keempat nilai `finding_type`, dan _index_ pencarian tanggal).
2. **Kontrak _Input_ ke FastAPI:** `{ target, comparisons, config }` tanpa `candidates`. _Backend_ selalu memanggil FastAPI untuk setiap sesi absen.
3. **Jendela & Batas `comparisons`:** Rentang **+-30 hari** dari `lesson_date` dengan batas maksimal **500 sesi** (`COMPARISON_WINDOW_DAYS = 30`, `MAX_COMPARISONS = 500`, `.limit(500)`).
4. **Jumlah Fitur Model:** **19 fitur angka** (`FEATURE_NAMES` no. 1–19) ditambah _guardrail_ deterministik di FastAPI agar akurasi terhadap seluruh aturan bisnis terjamin.
