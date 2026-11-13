# Implementasi Model AI & Mekanisme *Comparisons* pada Validasi Absen Tutor

Dokumen ini merangkum aturan validitas absen, arsitektur pemrosesan di FastAPI, skema *comparisons*, contoh transformasi data dari JSON mentah hingga *response* akhir, serta keputusan arsitektur hasil diskusi.

---

## 1. Latar Belakang Masalah & Aturan Validitas (*Rules*)

### 1.1 Tiga Aturan Utama Validitas Absen (Hasil Rapat Kelompok)

Setiap absen tutor yang masuk dinilai dan diberi 1 dari 3 label validitas (*validity*) berikut:

#### 1. HIJAU — `valid` (Disetujui)
- **Aturan:** Tidak ada masalah sama sekali (bukan duplikat, durasi `<= 180` menit, dan jam mulai `<= "21:00"` malam).
- **Efek di aplikasi:** Langsung lolos dan **masuk ke rekap gaji** tutor serta tagihan.

#### 2. BIRU — `needs_revision` (Perlu Revisi)
Terkena salah satu dari 2 kondisi ini:
1. **Durasi lebih dari 180 menit** (`duration_minutes > 180`, artinya lebih dari 3 jam).
2. **Pertemuan dimulai di atas jam 21.00 malam** (`start_time > "21:00"`, misalnya mulai pukul `21:01`, `21:30`, `22:00`).

*(Catatan: Jika tepat 180 menit atau tepat pukul 21:00, sesi masih dianggap Hijau/`valid`).*
- **Efek di aplikasi:** Ditahan dari rekap gaji -> **Tutor masih bisa mengedit**, lalu Admin bisa menyetujui (*approve*) hasil editnya.

#### 3. MERAH — `rejected` (Ditolak)
- **Aturan:** **Data duplikat (`>= 2` catatan yang sama)** — yaitu `tutor_id`, `student_id`, `subject_ids` (mata pelajaran), `lesson_date` (tanggal les), dan `duration_minutes` (durasi) **sama persis** dengan sesi yang sudah diinput sebelumnya.
- **Efek di aplikasi:** Ditahan dari rekap gaji -> **Tutor TIDAK bisa mengedit**, dan Admin memiliki tombol *delete* (hapus).

#### Aturan Tambahan
- **Prioritas Status:** Jika suatu sesi terkena Merah dan Biru sekaligus (misalnya data duplikat DAN durasinya 200 menit), status akhirnya wajib **MERAH (`rejected`)** karena `rejected` memiliki prioritas tertinggi, namun semua temuan tetap ditulis di dalam `findings`.
- **Akses Admin:** Admin memiliki akses penuh (*create, edit, delete*) ke seluruh data untuk mengoreksi kemungkinan salah label (*mislabelling*) dari AI.

---

### 1.2 Masalah pada *Prototype* Awal (Gemini)
Pada *prototype* awal yang dibuat *fullstack*, penilaian menggunakan *Generative AI* (Gemini). Sebelum memanggil Gemini, *backend* menjalankan aturan *if-else* (*rule engine*) untuk membentuk daftar kecurigaan awal yang disebut `candidates`. Jika `candidates` kosong, sesi langsung dianggap `valid` dan AI tidak dipanggil.

Ketika *prototype* ini diganti dengan model *machine learning* (ML) buatan sendiri di layanan FastAPI, penggunaan `candidates` dari *backend* menjadi tidak tepat karena pekerjaan deteksi utamanya sudah diambil alih oleh *if-else* di *backend*, bukan oleh model AI.

### 1.3 Masalah Inti: `target` Saja Tidak Cukup untuk Mendeteksi Duplikat
Sesi absen baru yang dikirim tutor disebut `target`.
- Untuk mengecek durasi `> 180` menit dan jam mulai `> 21:00`, model cukup memeriksa data `target` itu sendiri.
- Namun, untuk mengecek apakah suatu sesi adalah **duplikat (`rejected`)**, model tidak bisa hanya melihat 1 baris `target` sendirian. Model membutuhkan daftar sesi-sesi sebelumnya untuk dibandingkan.

Daftar sesi riwayat yang diambil oleh *backend* dan dikirim bersama `target` sebagai bahan pembanding inilah yang disebut **`comparisons`**.

---

## 2. Cara Kerja AI Mengolah `target` dan `comparisons`

Model yang digunakan adalah **klasifikasi tabular 3 kelas** (*Supervised Learning*, seperti *LightGBM*, *XGBoost*, atau *Random Forest*). Model matematika (`model.pkl`) secara teknis hanya bisa menerima **deret angka (tabel/matriks)** dan tidak bisa membaca teks JSON mentah atau kode *Universally Unique Identifier* (UUID, kode identitas unik 36 karakter).

Oleh karena itu, di dalam layanan FastAPI terdapat **2 komponen yang bekerja berurutan**:
1. **Kode Python (Fungsi *Feature Extraction* / Transformasi):** Mengubah JSON mentah (`target` + `comparisons`) menjadi baris fitur angka.
2. ***File* Model AI (`model.pkl`):** Menerima baris fitur angka tersebut dan memprediksi kelas `valid`, `needs_revision`, atau `rejected`.

*Backend* tidak melakukan transformasi angka ini; *backend* hanya mengirimkan JSON mentah `{ target, comparisons, config }` ke FastAPI.

### 2.1 Lima Tahap Proses di Layanan FastAPI

```
[1. JSON Masuk]       target + comparisons (30 hari) + config dari Backend
        ↓
[2. Transformasi]     Kode Python di FastAPI mengubah JSON menjadi 13 fitur angka
        ↓
[3. Model ML (.pkl)]  Menghitung probabilitas dan memprediksi kelas validity
        ↓
[4. Guardrail]        Pengaman deterministik agar aturan mutlak tidak meleset
        ↓
[5. JSON Keluar]      Merakit validity, validity_reason, dan findings ke Backend
```

### 2.2 Tiga Pintu Pemeriksaan Klasifikasi

Secara logika, penilaian satu sesi `target` melewati 3 pintu berurutan:
1. **Pintu 1 — Cek `rejected` (Merah):** Bandingkan `target` dengan setiap item di `comparisons`. Jika ada sesi pembanding yang kembar persis (`exact_dup_count >= 1`), putuskan `rejected`. Jika tidak ada, lanjut ke Pintu 2.
2. **Pintu 2 — Cek `needs_revision` (Biru):** Cek angka pada `target`. Jika `duration_minutes > 180` atau `start_time > "21:00"`, putuskan `needs_revision`. Jika tidak, lanjut ke Pintu 3.
3. **Pintu 3 — `valid` (Hijau):** Jika lolos Pintu 1 dan Pintu 2, sesi diputuskan `valid`.

---

## 3. Skema *Comparisons* & Transformasi ke Fitur Angka

### 3.1 Kriteria Pengambilan Sesi ke dalam `comparisons`
Sebuah sesi riwayat dimasukkan ke dalam *array* `comparisons` milik suatu `target` jika memenuhi 3 syarat:
1. **Orang yang sama:** Memiliki `tutor_id` yang sama **atau** `student_id` yang sama dengan `target`.
2. **Rentang waktu +-30 hari:** Selisih `lesson_date` maksimal 30 hari dari `target.lesson_date`.
3. **Dikirim lebih awal:** Nilai `submitted_at` (waktu tutor menekan tombol *submit*) lebih kecil/lebih dulu daripada `target.submitted_at`. Batas jumlah sesi yang diambil maksimal **100 sesi**.

**Fungsi `submitted_at`:** Waktu *submit* bukan penentu anomali, melainkan penentu sesi mana yang masuk lebih dulu ke *database*. Dengan syarat `submitted_at < target.submitted_at`:
- **Absen ke-1 (masuk duluan):** Dianggap data asli -> statusnya **`valid` (Hijau / tetap dibayar)** karena saat sesi itu masuk, kembarannya belum ada di `comparisons`.
- **Absen ke-2 (masuk belakangan):** Dianggap data duplikat -> statusnya **`rejected` (Merah / ditolak)** karena di dalam `comparisons`-nya sudah tercatat Absen ke-1.

### 3.2 Isi *Field* di Dalam JSON `comparisons`
Setiap item di dalam *array* `comparisons` memiliki 8 *field* yang sama persis dengan `target`:

| No | Nama *Field* | Contoh Nilai | Fungsi dalam Perbandingan |
|---|---|---|---|
| 1 | `id` | `"aaaaaaaa-aaaa-..."` | ID unik sesi pembanding. Jika terbukti kembar dengan `target`, ID ini diisikan ke `related_lesson_session_id` pada `findings` |
| 2 | `tutor_id` | `"11111111-1111-..."` | Dicek apakah sama dengan `target.tutor_id` |
| 3 | `student_id` | `"22222222-2222-..."` | Dicek apakah sama dengan `target.student_id` |
| 4 | `subject_ids` | `["33333333-..."]` | Daftar UUID mata pelajaran (1–3 item, terurut); dicek apakah sama atau beririsan dengan `target.subject_ids` |
| 5 | `lesson_date` | `"2026-09-02"` | Tanggal les (`YYYY-MM-DD`); dicek apakah sama dengan `target.lesson_date` atau dalam +-30 hari |
| 6 | `start_time` | `"14:00"` | Jam mulai (`HH:MM` atau `null`); dicek apakah jam mengajar bertabrakan |
| 7 | `duration_minutes` | `60` | Durasi menit; dicek apakah sama dengan `target.duration_minutes` dan dihitung rata-ratanya |
| 8 | `submitted_at` | `"2026-09-02T08:05:00Z"` | Memastikan sesi pembanding dikirim lebih awal dari `target` |

### 3.3 Daftar 13 Fitur Angka Hasil Transformasi (`target` + `comparisons`)

Ketika diubah menjadi fitur untuk model AI (maupun menjadi kolom di tabel CSV latihan oleh *Data Scientist* / DS), data `target` dan daftar `comparisons` diperas menjadi **13 kolom angka** berikut:

#### A. Fitur dari `target` & `config` (5 Kolom)

| No | Nama Fitur | Rumus Hitungan | Arti bagi Model AI |
|---|---|---|---|
| 1 | `duration_minutes` | `target.duration_minutes` | Lama les dalam menit |
| 2 | `duration_over_limit` | `duration_minutes - 180` | Selisih durasi terhadap batas 180 menit |
| 3 | `start_minute` | `Jam * 60 + Menit` dari `target.start_time` | Jam mulai dalam total menit sejak 00:00 (misal `14:00` = `14 * 60 = 840`) |
| 4 | `start_over_limit` | `start_minute - 1260` | Selisih jam mulai terhadap pukul `21:00` (`21 * 60 = 1260` menit) |
| 5 | `subject_count` | Jumlah item di `target.subject_ids` | Banyaknya mata pelajaran yang diajarkan (1–3) |

#### B. Fitur Hasil Membandingkan `target` terhadap `comparisons` (8 Kolom)

| No | Nama Fitur | Cara Menghitung dari `comparisons` | Fungsi bagi Model AI |
|---|---|---|---|
| 6 | `comparisons_count` | Total jumlah sesi di dalam `comparisons` | Mengetahui jumlah riwayat 30 hari yang tersedia |
| 7 | `exact_dup_count` | Jumlah sesi di `comparisons` yang 5 atributnya (`tutor_id`, `student_id`, `subject_ids`, `lesson_date`, `duration_minutes`) sama persis dengan `target` | **Sinyal utama penentu kelas `rejected`** (jika `>= 1`, berarti duplikat) |
| 8 | `same_tutor_student_date_count` | Jumlah sesi di `comparisons` dengan tutor, murid, dan tanggal yang sama dengan `target` (meski mapel/durasi berbeda) | Mendeteksi duplikat samar (input ganda beda durasi) |
| 9 | `same_student_date_diff_tutor_count` | Jumlah sesi di `comparisons` dengan murid dan tanggal sama, mapel beririsan, tetapi tutor berbeda | Mendeteksi satu murid diinput dua tutor di hari yang sama |
| 10 | `time_overlap_count` | Jumlah sesi di `comparisons` pada tanggal sama yang rentang jamnya bertabrakan untuk tutor atau murid yang sama | Mendeteksi jadwal mengajar yang bertabrakan |
| 11 | `tutor_sessions_30d` | Jumlah sesi di `comparisons` milik `tutor_id` yang sama dalam 30 hari | Konteks keaktifan bulanan tutor |
| 12 | `student_sessions_30d` | Jumlah sesi di `comparisons` milik `student_id` yang sama dalam 30 hari | Mendeteksi frekuensi les murid dalam sebulan |
| 13 | `duration_diff_from_tutor_mean_30d` | Selisih `target.duration_minutes` terhadap rata-rata durasi mengajar tutor tersebut di `comparisons` | Mendeteksi durasi yang menyimpang dari kebiasaan tutor |

---

### 3.4 Arti Angka Minus (`-`), Nol (`0`), dan Positif (`+`) pada Fitur Batas

Agar model AI mudah membedakan sesi aman dan sesi yang melanggar batas, digunakan pengurangan terhadap ambang batas:
- **Hasil Minus (`-`) atau Nol (`0`)** -> **Aman (`valid`)**, masih di bawah atau tepat di batas maksimal.
- **Hasil Positif (`> 0`)** -> **Melanggar batas (`needs_revision`)**, melewati ambang yang diizinkan.

#### 1. Tabel `duration_over_limit` (Rumus: `Durasi Les - 180`)

| Durasi Les Tutor | Hitungannya (`Durasi - 180`) | Hasil Angka | Artinya bagi AI |
|---|---|---|---|
| **60 menit** | `60 - 180` | **`-120`** (Minus) | **Aman!** Masih kurang 120 menit dari batas 180 menit |
| **90 menit** | `90 - 180` | **`-90`** (Minus) | **Aman!** Masih kurang 90 menit dari batas 180 menit |
| **180 menit** | `180 - 180` | **`0`** (Nol) | **Aman!** Pas di batas maksimal 180 menit |
| **210 menit** | `210 - 180` | **`+30`** (Positif) | **PERLU REVISI!** Kelebihan 30 menit di atas batas 180 menit |

#### 2. Tabel `start_over_limit` (Rumus: `Jam Mulai (menit) - 1260`, di mana pukul `21:00` = `1260` menit)

| Jam Mulai Les | Hitungannya (`Jam - 1260`) | Hasil Angka | Artinya bagi AI |
|---|---|---|---|
| **14:00 siang** (840 menit) | `840 - 1260` | **`-420`** (Minus) | **Aman!** Masih 420 menit (7 jam) sebelum pukul 21:00 malam |
| **19:00 malam** (1140 menit) | `1140 - 1260` | **`-120`** (Minus) | **Aman!** Masih 2 jam sebelum pukul 21:00 malam |
| **21:00 malam** (1260 menit) | `1260 - 1260` | **`0`** (Nol) | **Aman!** Pas pukul 21:00 malam |
| **21:30 malam** (1290 menit) | `1290 - 1260` | **`+30`** (Positif) | **PERLU REVISI!** Lewat 30 menit di atas pukul 21:00 malam |

---

## 4. Contoh Lengkap Alur Data: Sebelum Transformasi -> Sesudah Transformasi -> *Response* Akhir

Berikut contoh nyata perjalanan 1 data sesi dari *backend* hingga kembali lagi ke *backend* (kasus **Duplikat**):

### 4.1 SEBELUM Transformasi: JSON Mentah dari *Backend* ke FastAPI
JSON yang dikirim *backend* saat tutor menekan tombol *submit* absen (`target` + `comparisons` 30 hari):

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
    "lateStartAfter": "21:00"
  }
}
```

### 4.2 SETELAH Transformasi: Objek Fitur Angka di Dalam FastAPI
Begitu JSON di atas masuk ke FastAPI, fungsi Python di FastAPI menggabungkan dan menghitung `target` + `comparisons` menjadi **objek fitur angka** berikut:

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
    "duration_diff_from_tutor_mean_30d": 0.0
  },
  "helper_meta": {
    "target_id": "sesi-baru-002",
    "duplicate_of_session_id": "sesi-lama-001"
  }
}
```

**Rincian asal angka di atas:**
- **Dari `target`:**
  - `duration_minutes`: **`60`** (dari `target.duration_minutes`)
  - `duration_over_limit`: **`-120`** (karena `60 - 180 = -120`)
  - `start_minute`: **`840`** (karena pukul `"14:00"` = `14 * 60 = 840`)
  - `start_over_limit`: **`-420`** (karena `840 - 1260 = -420`)
  - `subject_count`: **`1`** (karena `["mapel-mtk"]` berisi 1 mata pelajaran)
- **Dari hasil membandingkan `target` dengan `comparisons`:**
  - `comparisons_count`: **`2`** (ada 2 sesi di dalam `comparisons`)
  - `exact_dup_count`: **`1`** (karena `sesi-lama-001` memiliki tutor, murid, mapel, tanggal `2026-09-02`, dan durasi `60` yang **sama persis** dengan `target`)
  - `same_tutor_student_date_count`: **`1`** (1 sesi di tanggal yang sama)
  - `same_student_date_diff_tutor_count`: **`0`** (tidak ada tutor lain di tanggal itu)
  - `time_overlap_count`: **`1`** (jam 14:00–15:00 bertabrakan dengan `sesi-lama-001`)
  - `tutor_sessions_30d`: **`2`** (Tutor Diva memiliki 2 sesi di riwayat)
  - `student_sessions_30d`: **`2`** (Murid Abqary memiliki 2 sesi di riwayat)
  - `duration_diff_from_tutor_mean_30d`: **`0.0`** (rata-rata durasi Tutor Diva 60 menit, selisihnya `60 - 60 = 0`)

*(Catatan: 13 angka di dalam `"features"` di atas sama persis dengan 13 kolom di tabel CSV saat DS melatih model).*

### 4.3 Masuk ke `model.pkl` -> Keluar JSON *Response* Akhir ke *Backend*
1. 13 angka di dalam `"features"` dimasukkan ke `model.pkl`:
   `model.predict([[60, -120, 840, -420, 1, 2, 1, 1, 0, 1, 2, 2, 0.0]])`
2. Model melihat `exact_dup_count = 1`, lalu mengeluarkan hasil prediksi: **`"rejected"`**.
3. FastAPI membungkus hasil tersebut menjadi JSON *response* sesuai kontrak aplikasi untuk dikirim kembali ke *backend*:

```json
{
  "validity": "rejected",
  "validity_reason": "Sesi dinilai duplikat dari sesi yang sudah tercatat dengan tutor, murid, mata pelajaran, tanggal, dan durasi yang sama.",
  "findings": [
    {
      "lesson_session_id": "sesi-baru-002",
      "related_lesson_session_id": "sesi-lama-001",
      "is_anomaly": true,
      "finding_type": "suspected_duplicate",
      "severity": "medium",
      "reason": "Sesi memiliki tutor, murid, mata pelajaran, tanggal, dan durasi yang sama dengan sesi yang dikirim lebih awal.",
      "evidence_summary": "Tanggal 2026-09-02 dan durasi 60 menit sama dengan sesi pembanding.",
      "suggested_action": "review"
    }
  ]
}
```

### 4.4Contoh Baris CSV Horizontal untuk 5 Kondisi (Untuk *Training* Model)

Saat pelatihan model dari CSV, 5 kondisi utama direpresentasikan secara horizontal seperti berikut:

| session_id | duration_minutes | start_minute | duration_over_limit | start_over_limit | subject_count | comparisons_count | exact_dup_count | same_tutor_student_date_count | tutor_sessions_30d | student_sessions_30d | related_session_id | validity | scenario |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `sesi-001` | 60 | 840 | -120 | -420 | 1 | 1 | 0 | 0 | 18 | 4 | `null` | **`valid`** | normal |
| `sesi-002` | 210 | 780 | 30 | -480 | 1 | 0 | 0 | 0 | 12 | 6 | `null` | **`needs_revision`** | durasi_panjang |
| `sesi-003` | 60 | 1290 | -120 | 30 | 1 | 0 | 0 | 0 | 25 | 8 | `null` | **`needs_revision`** | mulai_malam |
| `sesi-004B` | 60 | 900 | -120 | -360 | 1 | 15 | 1 | 1 | 20 | 5 | `sesi-004A` | **`rejected`** | duplikat |
| `sesi-005B` | 200 | 780 | 20 | -480 | 1 | 10 | 1 | 1 | 15 | 3 | `sesi-005A` | **`rejected`** | kombinasi |

### 4.5 Perbedaan Penyusunan `comparisons` Saat *Training* vs Saat *Live*

| Tahap | Siapa yang Menyusun `comparisons` & Menghitung Angka? | Sumber Data |
|---|---|---|
| **Saat *Training*** | Skrip Python milik DS | Dicari dari baris-baris lain di tabel Excel/JSON bersih buatan DS, lalu disimpan ke CSV |
| **Saat Aplikasi *Live*** | *Backend* mengambil JSON `comparisons` dari PostgreSQL; FastAPI menghitungnya menjadi angka | *Database* PostgreSQL aplikasi |

---

## 5. *Use Case* dan Situasi Nyata yang Dibahas

### 5.1 Urutan Sesi Normal Berbeda Tanggal (Contoh Data DS)
DS membuat deret sesi dengan tutor dan murid yang sama pada tanggal berbeda:
- **Baris 1 (`lesson_date: "2026-01-06"`, `submitted_at: "12:12:13Z"`):** Belum ada sesi yang disubmit sebelum pukul `12:12:13Z` -> `comparisons: []`. Hasil: **`valid`**.
- **Baris 2 (`lesson_date: "2026-01-08"`, `submitted_at: "12:19:44Z"`):** Baris 1 masuk ke `comparisons` karena disubmit lebih awal (`12:12:13Z < 12:19:44Z`). Karena tanggal les berbeda (`01-06` vs `01-08`) dan durasi 60 menit pukul 15:00, maka `exact_dup_count = 0`. Hasil: **`valid`**.
- **Baris 3 (`lesson_date: "2026-01-09"`, `submitted_at: "12:24:40Z"`):** Baris 1 dan Baris 2 masuk ke `comparisons`. Tanggal berbeda dan durasi normal. Hasil: **`valid`**.

### 5.2 Situasi di Dalam 100 Sesi `comparisons` Terdapat Sesi Lama yang Bermasalah
**Kasus:** Minggu lalu ada sesi berdurasi 240 menit (`needs_revision`) yang ikut masuk ke dalam daftar 100 sesi `comparisons`. Hari ini tutor menginput sesi baru (`target`) berdurasi 60 menit pukul 15:00 dan tidak kembar dengan sesi mana pun.
**Hasil:** Sesi `target` hari ini tetap **`valid` (Hijau)**. AI hanya menilai 1 sesi `target`, bukan menilai ulang isi `comparisons`. Masalah pada sesi lama tidak menular ke sesi baru selama sesi baru tersebut tidak kembar dengannya.

### 5.3 Situasi `target` Mengalami Duplikat Sekaligus Durasi `> 180` Menit
**Kasus:** Di dalam `comparisons` terdapat sesi tanggal 10 September berdurasi 200 menit. Tutor menginput lagi sesi baru (`target`) pada tanggal 10 September dengan tutor, murid, mapel, dan durasi 200 menit yang sama persis.
**Hasil:**
- Pada fitur angka, `exact_dup_count = 1` dan `duration_over_limit = +20` sama-sama menyala.
- Status akhir `validity` wajib **`rejected` (Merah)** karena prioritas `rejected` lebih tinggi daripada `needs_revision`.
- Pada *array* `findings` di JSON *response*, **kedua temuan tetap ditulis** (`suspected_duplicate` dengan `related_lesson_session_id` menunjuk sesi kembarannya, serta `duration_outlier` untuk durasi 200 menit).

### 5.4 Situasi Durasi `> 180` Menit Sekaligus Mulai `> 21:00`
Kondisi ini **tidak mungkin terjadi** karena validasi *form* aplikasi menolak jam selesai yang melewati tengah malam (`23:59`) di hari yang sama. Skenario gabungan ini tidak dibuat di *dataset*.

### 5.5 Kondisi Data Mentah Excel Bimbel (Oktober 2026)
Dari hasil pengecekan terhadap 384 baris sesi (57 *sheet*, 19 tutor, 55 murid) pada *file* Excel bimbel:
- Durasi `> 180` menit: **0 kasus** (durasi tertinggi 127 menit).
- Jam mulai `> 21:00`: **0 kasus** (paling malam pukul 19:00).
- Duplikat persis: **0 kasus**.
- Rata-rata murid hanya les 4–8 kali sebulan dan tutor mengajar 15–25 kali sebulan (paling sibuk 54 kali), sehingga isi `comparisons` rata-rata hanya 3–15 sesi, bukan selalu 100 sesi (angka 100 hanya batas maksimal).

Karena data asli 100% normal (`valid`), DS wajib menyuntikkan baris anomali buatan (durasi 181–300 menit, mulai pukul 21:01–22:30, dan penggandaan baris untuk duplikat) sebelum menghitung `comparisons` dan memberi label otomatis.

---

## 6. Hasil *Brainstorming* dan Keputusan Arsitektur

### 6.1 Cara Menyediakan Riwayat untuk Deteksi Duplikat

| Opsi | Cara Kerja | Alasan Memilih / Menolak | Status |
|---|---|---|---|
| **Kirim `target` saja** | *Backend* hanya mengirim objek `target` ke FastAPI | **Ditolak.** Tanpa riwayat sesi lain, model tidak mungkin mendeteksi duplikat (`rejected`) | Ditolak |
| **Opsi A: Kirim `target` + `comparisons` + `config` (tanpa `candidates`)** | *Backend* mengambil riwayat dari *database* dan mengirimkannya bersama `target`; seluruh transformasi angka dan penilaian dilakukan di FastAPI | **Dipilih.** Model ML benar-benar bekerja menilai sendiri, FastAPI tidak perlu koneksi langsung ke *database* aplikasi, dan perubahan di *backend* sangat kecil | **Dipilih** |
| **Opsi B: FastAPI baca *database* langsung** | *Backend* hanya mengirim `target`, FastAPI melakukan *query* riwayat sendiri ke PostgreSQL | **Ditolak.** Membuat layanan AI terikat pada kredensial dan skema *database* aplikasi serta menyulitkan pengujian terpisah | Ditolak |
| **Opsi C: Tetap pakai `candidates` dari *backend*** | Duplikat dicek *if-else* *backend*, model hanya mengiyakan `candidates` | **Ditolak.** Nilai *machine learning* hilang karena deteksi utama dilakukan oleh *backend* | Ditolak |

### 6.2 Rentang Waktu `comparisons`: +-7 Hari vs +-30 Hari

| Kriteria Perbandingan | Jendela +-7 Hari (Maks 30 Sesi) | Jendela +-30 Hari (Maks 100 Sesi) |
|---|---|---|
| Asal-usul di *prototype* | Dipakai karena keterbatasan biaya token dan kecepatan Gemini | Tidak terkendala token karena dihitung dengan Python lokal di FastAPI |
| Duplikat di tanggal yang sama | Tertangkap 100% | Tertangkap 100% |
| Duplikat beda minggu / salah pilih tanggal di kalender | Tidak terlihat jika selisih `> 7` hari | **Tertangkap** karena masih dalam satu bulan |
| Pola kebiasaan bulanan tutor & murid (rata-rata durasi, frekuensi bulanan) | Data terlalu sedikit (2–4 sesi seminggu) | **Akurat** (15–50 sesi sebulan) dan selaras dengan siklus rekap gaji bulanan |
| Beban data | Sangat ringan | Tetap ringan (tutor tersibuk hanya 54 sesi sebulan) |
| **Keputusan** | Tidak dipakai | **Dipilih (+-30 hari, `MAX_COMPARISONS = 100`)** |

### 6.3 Metode Pelabelan *Dataset* oleh DS

| Opsi | Cara Kerja | Alasan Memilih / Menolak | Status |
|---|---|---|---|
| **Tanpa label sama sekali (*Unsupervised*)** | Melatih model tanpa kolom `validity` | **Ditolak.** Model tidak bisa membedakan tindakan bisnis antara `needs_revision` (Biru/tutor bisa edit) dan `rejected` (Merah/admin hapus) | Ditolak |
| **Label manual satu per satu** | DS mengetik label baris demi baris secara manual | **Ditolak.** Memakan waktu dan rawan salah ketik | Ditolak |
| **Label otomatis dengan skrip Python (*Supervised*)** | DS menjalankan skrip aturan untuk mengisi `comparisons` dan memberi label `validity` (`valid` / `needs_revision` / `rejected`) di setiap baris | **Dipilih.** Selesai dalam hitungan detik, konsisten dengan aturan kelompok, dan langsung siap dipakai `model.fit(X, y)` | **Dipilih** |

---

## 7. Ringkasan Keputusan Akhir

1. **Kontrak *Input* ke FastAPI:** Menggunakan `{ target, comparisons, config }` tanpa `candidates`. *Backend* selalu memanggil AI untuk setiap sesi absen.
2. **Jendela `comparisons`:** Menggunakan rentang **+-30 hari** dari `lesson_date` dengan batas maksimal **100 sesi** untuk `tutor_id` atau `student_id` yang sama dan `submitted_at` lebih awal.
3. **Lokasi Transformasi Angka:** Dilakukan oleh **kode Python di dalam FastAPI** (mengubah JSON `target` + `comparisons` menjadi 13 fitur angka sebelum masuk ke `model.pkl`), bukan oleh *backend*.
4. **Tugas DS:**
   - Membersihkan data Excel menjadi format `target` ber-UUID konsisten.
   - Menyuntikkan data anomali sintetis (durasi `> 180` menit, mulai `> 21:00`, dan baris duplikat).
   - Menjalankan skrip otomatis untuk mencari `comparisons`, menghitung 13 kolom fitur angka di CSV, dan mengisi label `validity`.
5. **Tugas AI Engineer:** Melatih model klasifikasi tabular (`model.pkl`) dari CSV fitur angka tersebut, memasang fungsi transformasi + `model.pkl` + *guardrail* aturan bisnis di FastAPI, serta mengembalikan JSON `{ validity, validity_reason, findings }` sesuai kontrak aplikasi.
