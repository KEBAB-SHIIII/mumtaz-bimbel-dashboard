# Konteks Utama _Project_ _Modelling_ AI Anomaly Absen Tutor (Panduan untuk _AI Agent_)

> **Pesan untuk _AI Agent_:**
> Dokumen ini ditulis khusus agar kamu (_AI Agent_) memahami konteks bisnis, masalah awal, alasan setiap keputusan teknis, bentuk data mentah, hingga target akhir _modelling_ secara utuh.
>
> Pengguna akan memberikan **3 dokumen** kepada kamu:
>
> 1. **`KONTEKS PROJECT AI ANOMALY.md` (Dokumen ini):** Konteks bisnis dari nol, masalah awal hingga ketemu solusi, struktur file CSV, dan aturan wajib yang tidak boleh dilanggar.
> 2. **`IMPLEMENTASI AI MODEL + COMPARISON.md`:** Spesifikasi detail aturan bisnis validitas, mekanisme `comparisons` (+-30 hari), dan definisi rumus 19 fitur angka (`FEATURE_NAMES`).
> 3. **`RENCANA MODELLING TAHAP 1 DAN 2.md`:** Urutan kerja langkah demi langkah (_step-by-step_) untuk membuat kode di Google Colab (Tahap 1 Ekstraksi Fitur & Tahap 2 _Training_ Model).

---

## 1. Apa Aplikasi Ini dan Apa Masalah Awalnya?

### 1.1 Tentang Aplikasi (_Mumtaz Bimbel Dashboard_)

Aplikasi ini adalah sistem web manajemen bimbingan belajar (bimbel) yang memiliki 3 peran pengguna: **Admin**, **Tutor (pengajar)**, dan **Orang Tua Murid**.
Alur utamanya:

1. Setiap selesai mengajar, **Tutor mengisi _form_ absen** di aplikasi (memilih murid, memilih 1–5 mata pelajaran, mengisi tanggal les, jam mulai, jam selesai, dan catatan materi).
2. Dari _form_ tersebut, sistem menghitung **gaji/honor bulanan tutor (_payroll_)** dan **tagihan bulanan orang tua murid (_billing_)**.

### 1.2 Masalah Nyata di Lapangan

Karena absen diinput sendiri oleh tutor dan langsung memengaruhi uang (gaji & tagihan), sering muncul masalah pada data yang masuk:

1. **Input Duplikat (Ganda):** Tutor tidak sengaja menekan tombol _submit_ dua kali atau menginput ulang sesi les yang sebenarnya sudah pernah dicatat. Jika lolos, tutor dibayar dua kali dan orang tua ditagih dua kali untuk sesi yang sama.
2. **Durasi Tidak Wajar:** Tutor salah memilih jam mulai/selesai sehingga durasi tercatat terlalu pendek (`< 30` menit) atau terlalu panjang (`> 180` menit / lebih dari 3 jam).
3. **Jam Mulai Tidak Wajar:** Sesi les tercatat dimulai terlalu pagi (`< 07:00` pagi) atau terlalu malam (`> 21:00` malam).
4. **Duplikat Samar:** Tutor menginput sesi dengan tutor, murid, mata pelajaran, tanggal, dan durasi yang sama persis, tetapi jam mulainya berbeda.
5. **Jadwal Bentrok (_Overlap_):** Pada tanggal yang sama, jam mengajar bertabrakan:
   - Tutor yang sama tercatat mengajar 2 murid berbeda di jam yang bertabrakan.
   - Murid yang sama tercatat diajar 2 tutor berbeda di jam yang bertabrakan.
   - Tutor dan murid yang sama tercatat 2 kali di jam yang bertabrakan (tetapi bukan duplikat 100% persis, misalnya durasi atau mapelnya beda).

Jika Admin harus mengecek ratusan hingga ribuan absen secara manual satu per satu, proses rekap bulanan menjadi sangat lambat dan rawan salah.

### 1.3 Solusi yang Diinginkan Kelompok: Klasifikasi Otomatis 3 Status (`validity`)

Tim memutuskan bahwa setiap absen yang masuk harus diperiksa oleh AI dan diberi **1 dari 3 label validitas (`validity`)**:

| Label `validity`     | Warna di UI | Kapan Label Ini Diberikan?                                                                                                                                                                                                    | Apa Dampaknya di Aplikasi?                                                                                      |
| -------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **`valid`**          | 🟢 Hijau    | Tidak ada masalah sama sekali (normal). Durasi tepat `30` atau `180` menit, dan jam mulai tepat `07:00` atau `21:00` tetap dianggap `valid`                                                                                   | Langsung disetujui (`approved`) dan **masuk ke hitungan rekap gaji & tagihan**                                  |
| **`needs_revision`** | 🔵 Biru     | Kena salah satu dari 8 masalah: durasi `< 30` mnt, durasi `> 180` mnt, mulai `< 07:00`, mulai `> 21:00`, duplikat samar (beda jam mulai), bentrok jadwal tutor, bentrok jadwal murid, atau bentrok jadwal tutor+murid sendiri | **Ditahan dari rekap gaji.** Tutor masih bisa mengedit datanya, lalu Admin bisa meng-_approve_ hasil editnya    |
| **`rejected`**       | 🔴 Merah    | **Duplikat 100% persis:** `tutor_id`, `student_id`, `subject_ids`, `lesson_date`, `start_time`, dan `duration_minutes` (6 atribut) sama persis dengan sesi yang sudah di-_submit_ lebih dulu                                  | **Ditahan dari rekap gaji.** Tutor tidak bisa mengedit, dan Admin punya opsi menghapus (_delete_) data tersebut |

**Urutan Prioritas Mutlak:** `rejected` > `needs_revision` > `valid`.
Artinya, jika sebuah sesi adalah duplikat persis (`rejected`) DAN durasinya juga 210 menit (`needs_revision`), maka label `validity` akhirnya **wajib `rejected`**.
Selain itu, Admin memiliki akses penuh (_create, edit, delete_, dan mengubah label) untuk berjaga-jaga jika model AI melakukan kesalahan prediksi (_mislabelling_).

---

## 2. Masalah pada _Prototype_ Lama (Gemini API) & Tujuan _Capstone_

Sebelumnya, _fullstack developer_ telah membuat _prototype_ aplikasi menggunakan _Generative AI_ (**Gemini API**). Namun, pendekatan Gemini tersebut harus diganti karena:

1. **Bukan Model Buatan Sendiri:** Di _prototype_ lama, _backend_ menggunakan _if-else_ (`candidates.ts`) untuk menyaring sesi. Kalau `candidates` kosong, AI tidak dipanggil sama sekali.
2. **Tujuan _Capstone Project_:** Tugas utama proyek _capstone_ ini adalah **membangun, melatih, dan mengevaluasi model _Machine Learning_ (ML) buatan sendiri** dari dataset absen bimbel, lalu menyimpannya menjadi file model (`anomaly_model.pkl`) yang nantinya dipasang pada _service_ FastAPI untuk menggantikan Gemini.

_Catatan penting: Saat ini fokus pekerjaan adalah menyelesaikan **Modelling (Tahap 1 & Tahap 2 di Google Colab)** terlebih dahulu hingga menghasilkan `features_dataset.csv` dan `anomaly_model.pkl`._

---

## 3. Kronologi Masalah Data hingga Ditemukannya Solusi 19 Fitur

Bagian ini menjelaskan **mengapa** arsitektur datanya berbentuk seperti sekarang:

### Masalah A: Data Mentah Excel Bimbel (`10. Absen Bimbel Oktober 2026.xlsx`) Semuanya Normal

- **Masalah:** Data asli dari bimbel hanya berisi ~384 baris sesi di berbagai _sheet_ murid, penulisannya tidak seragam, dan **100% merupakan sesi normal (`valid`)**. Tidak ada satu pun contoh durasi `> 180` menit, mulai `> 21:00`, ataupun duplikat di data asli. Model ML tidak akan bisa belajar membedakan 3 kelas jika hanya diberi contoh kelas `valid`.
- **Solusi:** _Data Scientist_ (DS) membersihkan data asli, mengubah seluruh nama tutor/murid/mapel menjadi **UUID** yang konsisten (demi privasi dan keseragaman), lalu menyuntikkan (_inject_) data anomali sintetis untuk ke-15 skenario uji hingga menghasilkan file **`sessions_with_synthetic.csv` berisi 7.557 baris** dengan rasio tepat **60% `valid`, 20% `needs_revision`, dan 20% `rejected`**.

### Masalah B: Satu Baris Sesi (`target`) Saja Tidak Bisa Mendeteksi Duplikat & Jadwal Bentrok

- **Masalah:** Jika model hanya melihat 1 baris sesi yang baru masuk (`target`), model memang bisa melihat `duration_minutes` (apakah `< 30` atau `> 180`) dan `start_time` (apakah `< 07:00` atau `> 21:00`). Akan tetapi, model **mustahil tahu** apakah sesi tersebut duplikat atau tabrakan jam dengan sesi lain jika tidak diberi data pembanding.
- **Solusi:** Untuk setiap sesi `target` yang dinilai, kita mengambil daftar sesi riwayat yang disebut **`comparisons`**, yaitu sesi-sesi lain milik **tutor yang sama ATAU murid yang sama** dalam rentang **+-30 hari** dari `lesson_date` (maksimal **500 sesi**) yang waktu kirimnya (`submitted_at`) lebih dulu daripada `target`.
- **Mengapa harus yang `submitted_at`-nya lebih dulu?** Supaya ketika ada 2 sesi kembar (Sesi 1 dikirim jam 08:00, Sesi 2 dikirim jam 08:05), Sesi 1 tetap dianggap **data asli (`valid` / Hijau)** karena belum ada sesi sebelumnya, sedangkan hanya Sesi 2 (yang masuk belakangan) yang dianggap **duplikat (`rejected` / Merah)**.

### Masalah C: Model ML Tidak Bisa Membaca UUID atau Daftar JSON `comparisons` Mentah

- **Masalah:** Algoritma ML matematis hanya menerima input berupa tabel angka dengan jumlah kolom tetap. Model tidak bisa membaca teks UUID (`"6daa16aa-..."`) atau _list_ berisi puluhan sesi `comparisons`.
- **Solusi:** Dibuat tahap **Transformasi Fitur (Tahap 1)** yang membandingkan `target` terhadap daftar `comparisons`-nya, lalu merangkum semuanya menjadi **19 kolom fitur angka (`FEATURE_NAMES`)**.
  - Untuk 4 fitur batas (`duration_over_limit`, `duration_under_limit`, `start_over_limit`, `start_under_limit`), disepakati kaidah seragam:
    - **Angka Minus (`-`) atau Nol (`0`) = AMAN (di dalam batas).**
    - **Angka Positif (`> 0`) = MELANGGAR BATAS (`needs_revision`).**
  - Untuk fitur hitungan duplikat/bentrok (`exact_dup_count`, `fuzzy_dup_count`, `tutor_overlap_diff_student_count`, `student_overlap_diff_tutor_count`, `self_overlap_count`), nilai **`0` = aman**, sedangkan nilai **`>= 1` = terdeteksi anomali**.

### Masalah D: Pemilihan Algoritma (_Machine Learning_ vs _Deep Learning_)

- **Masalah:** Apakah lebih baik memakai _Machine Learning_ (ML) klasik atau _Deep Learning_ (DL / _Neural Network_)?
- **Solusi:** Dipilih **ML Klasifikasi Tabular berbasis Pohon Keputusan (_Tree-based Ensemble_)**, bukan DL. Alasannya:
  1. Data berukuran 7.557 baris dengan 19 fitur tabular angka yang memiliki batas keputusan tajam (_sharp threshold_, misal `180` menit `valid` vs `181` menit `needs_revision`). Algoritma pohon keputusan membelah batas angka ini dengan presisi 100%, sedangkan _Neural Network_ cenderung kabur di daerah perbatasan.
  2. Mudah dijelaskan saat sidang _capstone_ lewat grafik _**Feature Importance**_ (bukan _black-box_).
  3. Sangat ringan (< 1 MB) dan cepat (< 1 ms) saat nanti dipasang di FastAPI.
  4. Di Google Colab (Tahap 2), kita melatih dan membandingkan **3 algoritma ML sekaligus**:
     - **LightGBM** (_Gradient Boosting Leaf-wise_ — kandidat utama),
     - **XGBoost** (_Gradient Boosting Depth-wise_ dengan regularisasi L1/L2 — pembanding 1),
     - **Random Forest** (_Bagging Parallel Trees_ — _baseline_ pembanding 2).

---

## 4. Spesifikasi Teknis File Input (`sessions_with_synthetic.csv`) untuk _AI Agent_

Saat menulis kode Python untuk **Tahap 1**, _AI Agent_ harus memahami struktur persis dari file `sessions_with_synthetic.csv`:

### 4.1 Contoh 5 Baris Pertama `sessions_with_synthetic.csv`

```csv
id,tutor_id,student_id,subject_ids,lesson_date,start_time,duration_minutes,submitted_at,is_synthetic,scenario
473dc277-7a6e-47b7-a706-cca10a52bbd5,6daa16aa-6e13-430f-8fab-fd153fa48628,862cdfac-370d-493e-a3d7-0104f4c56ebf,"[""8cee3629-d670-4cc6-91ca-b0949f8a93d7""]",2025-06-16,19:00,60,2025-06-16T13:23:48Z,0,real
2681a729-6e41-4976-8d6c-f41b409c6a02,147fa0de-0977-4169-abb6-979a3624001a,7071ce8f-4f70-4453-ba17-2ad091cc1d30,"[""8cee3629-d670-4cc6-91ca-b0949f8a93d7""]",2025-08-27,14:00,60,2025-08-29T12:24:31Z,0,real
31284822-d7bc-47b3-a9d7-2021d6c60457,1bd2f250-45ee-4a90-a4c3-72c876bc9360,edd1a52b-965a-409c-a4b3-58a653c9586e,"[""d9b33948-782f-4255-b93f-07a85f6d1cbf""]",2025-09-19,15:30,60,2025-09-19T10:52:52Z,0,real
fde58aab-e836-48ad-a306-ff667a577f07,b552e93b-e148-4379-8bac-39849a140486,223be389-d59e-4792-b41e-0157223bae51,"[""8cee3629-d670-4cc6-91ca-b0949f8a93d7""]",2025-08-14,16:00,60,2025-08-14T10:24:16Z,0,real
1eadfe54-e313-4952-99b8-55804f59b5b3,7cfcd3c0-190e-4a02-b1fc-5847fc8d0d9c,501b8451-dfb5-405a-8ea7-a074b4fb3ff5,"[""198788b4-211a-47d1-b0eb-f11dacdafecc""]",2025-09-14,15:00,60,2025-09-14T09:56:15Z,0,real
```

### 4.2 Cara _Parsing_ Kolom Mentah di Python

1. `id`, `tutor_id`, `student_id`: string UUID.
2. `subject_ids`: string berisi JSON _array_ UUID -> wajib di-_parse_ dengan `sorted(json.loads(row["subject_ids"]))`.
3. `lesson_date`: string `"YYYY-MM-DD"` -> ubah ke `datetime.strptime(row["lesson_date"], "%Y-%m-%d").date()`.
4. `start_time`: string `"HH:MM"` -> ubah ke `start_minute = int(st[:2]) * 60 + int(st[3:5])`.
5. `duration_minutes`: ubah ke `int(row["duration_minutes"])`. Hitung juga `end_minute = start_minute + duration_minutes`.
6. `submitted_at`: string ISO 8601 UTC (`"YYYY-MM-DDTHH:MM:SSZ"`).
7. `is_synthetic` & `scenario`: kolom metadata informasi asal baris (terdapat 15 jenis `scenario`: `real`, `batas_valid`, `duplikat`, `durasi_panjang`, `durasi_pendek`, `mulai_malam`, `mulai_pagi`, `duplikat_samar`, `tumpang_tindih`, `tumpang_tindih_murid`, `tumpang_tindih_sendiri`, `kombinasi_dup_panjang`, `kombinasi_dup_pendek`, `kombinasi_dup_malam`, `kombinasi_dup_pagi`). **Kedua kolom ini JANGAN dimasukkan ke dalam fitur `X` saat melatih model.**

### 4.3 Kunci Verifikasi Wajib Hasil Tahap 1 (Jangan Meleset!)

Ketika kode Tahap 1 selesai dijalankan pada 7.557 baris `sessions_with_synthetic.csv`, jumlah label `validity` yang dihasilkan **harus sama persis dengan angka verifikasi ini**:

- **`valid`:** `4.534` baris (`60.00%`)
- **`needs_revision`:** `1.511` baris (`19.99%`)
- **`rejected`:** `1.512` baris (`20.01%`)

Agar angkanya tepat seperti di atas, pastikan kode pencarian `comparisons` menerapkan syarat:

- `(other.tutor_id == target.tutor_id or other.student_id == target.student_id)`
- `abs((other.lesson_date - target.lesson_date).days) <= 30`
- `(other.submitted_at < target.submitted_at or (other.submitted_at == target.submitted_at and other.id < target.id))`

---

## 5. Ringkasan Tugas untuk _AI Agent_

Saat pengguna meminta bantuanmu berdasarkan ke-3 dokumen ini:

1. **Baca rumus 19 fitur (`FEATURE_NAMES` no. 1–19)** di dokumen `IMPLEMENTASI AI MODEL + COMPARISON.md` section 3.3. Urutan ke-19 kolom tersebut adalah urutan baku dan tidak boleh diubah.
2. **Ikuti panduan di `RENCANA MODELLING TAHAP 1 DAN 2.md`** untuk membuat kode Google Colab yang bersih, terstruktur per sel (_cell_), mudah dijalankan manual oleh pengguna, dan dilengkapi penjelasan singkat di setiap langkahnya:
   - **Tahap 1:** Membaca `sessions_with_synthetic.csv` -> mengekstrak 19 fitur & label `validity` -> memverifikasi jumlah label (`4534` / `1511` / `1512`) -> menyimpan `features_dataset.csv`.
   - **Tahap 2:** Membaca `features_dataset.csv` -> membagi data dengan _Stratified Split_ 70% _Train_ / 15% _Val_ / 15% _Test_ (`stratify=y`) -> melatih _Random Forest_, _XGBoost_, dan _LightGBM_ -> menampilkan tabel perbandingan metrik (_Precision, Recall, F1-Score_), _Confusion Matrix_, akurasi per `scenario`, dan grafik _Feature Importance_ -> mengekspor model terbaik ke `anomaly_model.pkl` dan `feature_metadata.json`.
