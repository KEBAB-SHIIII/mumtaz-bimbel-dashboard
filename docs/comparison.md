# Mekanisme *Comparisons* pada Model AI Validasi Absen Tutor

Dokumen ini merangkum pembahasan mengenai konsep, fungsi, skema data, dan cara kerja *comparisons* dalam sistem deteksi anomali absen tutor.

---

## 1. Latar Belakang Masalah

### 1.1 Masalah Dasar: Aturan Validitas Absen
Aplikasi membutuhkan penilaian otomatis untuk setiap absen tutor yang masuk dengan 3 label validitas (*validity*):
1. **`valid` (Hijau):** Tidak ada masalah, langsung masuk ke rekap gaji dan tagihan.
2. **`needs_revision` (Biru):** Durasi les более dari 180 menit (`duration_minutes > 180`) atau pertemuan dimulai di atas jam 21.00 malam (`start_time > "21:00"`). Data ditahan dari rekap, tutor dapat mengedit, dan admin dapat menyetujui (*approve*) hasil edit.
3. **`rejected` (Merah):** Data duplikat ($\ge 2$ catatan yang sama). Data ditahan dari rekap, tutor tidak dapat mengedit, dan admin memiliki opsi hapus (*delete*).

Selain itu, admin memiliki akses penuh (*create*, *edit*, *delete*) terhadap seluruh data untuk mengoreksi kemungkinan salah label (*mislabelling*) dari AI.

### 1.2 Masalah pada *Prototype* Awal (Gemini)
Pada *prototype* awal yang dibuat *fullstack*, penilaian menggunakan *Generative AI* (Gemini). Sebelum memanggil Gemini, *backend* menjalankan aturan *if-else* (*rule engine*) untuk membentuk daftar kecurigaan awal yang disebut `candidates`. Jika `candidates` kosong, sesi langsung dianggap `valid` dan AI tidak dipanggil.

Ketika *prototype* ini akan diganti dengan model *machine learning* (ML) buatan sendiri di layanan FastAPI, muncul masalah: jika `candidates` tetap dipakai, maka pekerjaan deteksi utamanya sebenarnya sudah dilakukan oleh *if-else* di *backend*, bukan oleh model AI.

### 1.3 Masalah Inti: `target` Saja Tidak Cukup untuk Mendeteksi Duplikat
Sesi absen baru yang dikirim tutor disebut `target`.
- Untuk mengecek durasi $> 180$ menit dan jam mulai $> 21.00$, model cukup melihat data `target` itu sendiri.
- Namun, untuk mengecek apakah suatu sesi adalah **duplikat (`rejected`)**, model tidak bisa hanya melihat 1 baris `target` sendirian. Model membutuhkan daftar sesi-sesi sebelumnya untuk dibandingkan.

Daftar sesi riwayat yang disertakan bersama `target` sebagai bahan pembanding inilah yang disebut **`comparisons`**.

---

## 2. Cara Kerja AI Mengolah `target` dan `comparisons`

Model yang digunakan adalah **klasifikasi tabular 3 kelas** (*Supervised Learning*, seperti *LightGBM*, *XGBoost*, atau *Random Forest*). Model ini tidak membaca teks JSON mentah atau kode *Universally Unique Identifier* (UUID, kode identitas unik 36 karakter), melainkan membaca **baris fitur angka**.

### 2.1 Lima Tahap Proses di Layanan FastAPI

```
[1. JSON Masuk]       target + comparisons + config dari Backend
        ↓
[2. Feature Builder]  Mengubah target + comparisons menjadi 1 baris fitur angka
        ↓
[3. Model ML (.pkl)]  Menghitung probabilitas dan memprediksi kelas validity
        ↓
[4. Guardrail]        Pengaman deterministik agar aturan mutlak tidak meleset
        ↓
[5. JSON Keluar]      Merakit validity, validity_reason, dan findings ke Backend
```

1. **Menerima Input JSON:** FastAPI menerima objek `target` (1 sesi baru), `comparisons` (daftar sesi riwayat), dan `config` (ambang batas `180` menit dan `"21:00"`).
2. ***Feature Extraction* (Ekstraksi Fitur):** Kode Python di FastAPI membandingkan `target` terhadap seluruh sesi di dalam `comparisons` dan merangkumnya menjadi deret angka (jumlah duplikat persis, selisih durasi, jumlah sesi 30 hari terakhir, dan sebagainya).
3. **Prediksi Model (*Decision Trees*):** Deret angka dimasukkan ke model (`model.predict`). Saat pelatihan (*training*) dari tabel *Comma-Separated Values* (CSV), algoritma pohon keputusan telah mempelajari pola angka mana yang menghasilkan `valid`, `needs_revision`, atau `rejected`.
4. ***Guardrail* (Pengaman Aturan):** Setelah model mengeluarkan prediksi, kode FastAPI menerapkan pengecekan pengaman agar 3 aturan utama kelompok tidak pernah meleset:
   - Jika ditemukan duplikat persis (`exact_dup_count >= 1`) $\rightarrow$ paksa `validity = "rejected"`.
   - Jika tidak `rejected` dan (`duration_minutes > 180` atau `start_time > "21:00"`) $\rightarrow$ paksa `validity = "needs_revision"`.
5. **Merakit *Response* JSON:** FastAPI menyusun kalimat alasan (`validity_reason`, `reason`, `evidence_summary`) menggunakan *template* Bahasa Indonesia yang diisi angka dari *input*, lalu mengirimkan JSON kembali ke *backend*.

### 2.2 Tiga Pintu Pemeriksaan Klasifikasi

Secara logika, penilaian satu sesi `target` melewati 3 pintu berurutan:
1. **Pintu 1 — Cek `rejected` (Merah):** Bandingkan `target` dengan setiap item di `comparisons`. Jika ada sesi pembanding yang kembar persis, putuskan `rejected`. Jika tidak ada, lanjut ke Pintu 2.
2. **Pintu 2 — Cek `needs_revision` (Biru):** Cek angka pada `target`. Jika `duration_minutes > 180` atau `start_time > "21:00"`, putuskan `needs_revision`. Jika tidak, lanjut ke Pintu 3.
3. **Pintu 3 — `valid` (Hijau):** Jika lolos Pintu 1 dan Pintu 2, sesi diputuskan `valid`.

---

## 3. Skema *Comparisons*

### 3.1 Kriteria Pengambilan Sesi ke dalam `comparisons`
Sebuah sesi lain dimasukkan ke dalam *array* `comparisons` milik suatu `target` jika memenuhi 3 syarat:
1. **Orang yang sama:** Memiliki `tutor_id` yang sama **atau** `student_id` yang sama dengan `target`.
2. **Rentang waktu $\pm 30$ hari:** Selisih `lesson_date` maksimal 30 hari dari `target.lesson_date`.
3. **Dikirim lebih awal:** Nilai `submitted_at` (waktu tutor menekan tombol *submit*) lebih kecil/lebih dulu daripada `target.submitted_at`. Batas jumlah sesi yang diambil maksimal **100 sesi**.

**Fungsi `submitted_at`:** Waktu *submit* bukan penentu anomali, melainkan penentu sesi mana yang masuk lebih dulu ke *database*. Dengan syarat `submitted_at < target.submitted_at`, sesi pertama (asli) memiliki `comparisons` yang belum memuat sesi kedua sehingga tetap berstatus `valid` (Hijau/dibayar), sedangkan sesi kedua (yang masuk belakangan) melihat sesi pertama di dalam `comparisons`-nya sehingga berstatus `rejected` (Merah/ditolak).

### 3.2 Isi *Field* di Dalam JSON `comparisons`
Setiap item di dalam *array* `comparisons` memiliki 8 *field* yang sama persis dengan `target`:

| No | Nama *Field* | Contoh Nilai | Fungsi dalam Perbandingan |
|---|---|---|---|
| 1 | `id` | `"aaaaaaaa-aaaa-..."` | ID unik sesi pembanding. Jika terbukti kembar dengan `target`, ID ini diisikan ke `related_lesson_session_id` pada `findings` |
| 2 | `tutor_id` | `"11111111-1111-..."` | Dicek apakah sama dengan `target.tutor_id` |
| 3 | `student_id` | `"22222222-2222-..."` | Dicek apakah sama dengan `target.student_id` |
| 4 | `subject_ids` | `["33333333-..."]` | Daftar UUID mata pelajaran (1–3 item, terurut); dicek apakah sama atau beririsan dengan `target.subject_ids` |
| 5 | `lesson_date` | `"2026-09-02"` | Tanggal les (`YYYY-MM-DD`); dicek apakah sama dengan `target.lesson_date` atau dalam $\pm 30$ hari |
| 6 | `start_time` | `"14:00"` | Jam mulai (`HH:MM` atau `null`); dicek apakah jam mengajar bertabrakan |
| 7 | `duration_minutes` | `60` | Durasi menit; dicek apakah sama dengan `target.duration_minutes` dan dihitung rata-ratanya |
| 8 | `submitted_at` | `"2026-09-02T08:05:00Z"` | Memastikan sesi pembanding dikirim lebih awal dari `target` |

### 3.3 Transformasi `comparisons` Menjadi Kolom Angka di CSV
Saat *Data Scientist* (DS) menyiapkan *dataset* pelatihan dalam bentuk CSV horizontal, *array* `comparisons` (misalnya berisi 15 atau 50 sesi) tidak ditulis sebagai teks JSON panjang di dalam sel CSV, melainkan diringkas menjadi kolom-kolom angka:

| No | Nama Kolom di CSV | Cara Menghitung dari `comparisons` | Fungsi bagi Model AI |
|---|---|---|---|
| 1 | `comparisons_count` | Total jumlah sesi di dalam `comparisons` | Mengetahui jumlah riwayat yang tersedia |
| 2 | `exact_dup_count` | Jumlah sesi di `comparisons` yang 5 atributnya (`tutor_id`, `student_id`, `subject_ids`, `lesson_date`, `duration_minutes`) sama persis dengan `target` | Sinyal utama penentu kelas `rejected` (jika $\ge 1$) |
| 3 | `same_tutor_student_date_count` | Jumlah sesi di `comparisons` dengan tutor, murid, dan tanggal yang sama dengan `target` (meski mapel/durasi berbeda) | Mendeteksi duplikat samar (misal input ganda beda durasi) |
| 4 | `same_student_date_diff_tutor_count` | Jumlah sesi di `comparisons` dengan murid dan tanggal sama, mapel beririsan, tetapi tutor berbeda | Mendeteksi satu murid diinput dua tutor di hari yang sama |
| 5 | `time_overlap_count` | Jumlah sesi di `comparisons` pada tanggal sama yang rentang jamnya bertabrakan untuk tutor atau murid yang sama | Mendeteksi jadwal bertabrakan |
| 6 | `tutor_sessions_30d` | Jumlah sesi di `comparisons` milik `tutor_id` yang sama dalam 30 hari | Konteks keaktifan bulanan tutor |
| 7 | `student_sessions_30d` | Jumlah sesi di `comparisons` milik `student_id` yang sama dalam 30 hari | Mendeteksi frekuensi les murid dalam sebulan |
| 8 | `duration_diff_from_tutor_mean_30d` | Selisih `target.duration_minutes` terhadap rata-rata durasi mengajar tutor tersebut di `comparisons` | Mendeteksi durasi yang menyimpang dari kebiasaan tutor |

Selain 8 kolom dari `comparisons` di atas, CSV memuat kolom dari `target` sendiri (`duration_minutes`, `start_minute`, `duration_over_limit`, `start_over_limit`, `subject_count`) serta kolom label target `validity` (`valid`, `needs_revision`, `rejected`).

### 3.4 Contoh Baris CSV Horizontal untuk Setiap Kondisi

| session_id | duration_minutes | start_minute | duration_over_limit | start_over_limit | subject_count | comparisons_count | exact_dup_count | same_tutor_student_date_count | tutor_sessions_30d | student_sessions_30d | related_session_id | validity | scenario |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `sesi-001` | 60 | 840 | -120 | -420 | 1 | 1 | 0 | 0 | 18 | 4 | `null` | `valid` | normal |
| `sesi-002` | 210 | 780 | 30 | -480 | 1 | 0 | 0 | 0 | 12 | 6 | `null` | `needs_revision` | durasi_panjang |
| `sesi-003` | 60 | 1290 | -120 | 30 | 1 | 0 | 0 | 0 | 25 | 8 | `null` | `needs_revision` | mulai_malam |
| `sesi-004B` | 60 | 900 | -120 | -360 | 1 | 15 | 1 | 1 | 20 | 5 | `sesi-004A` | `rejected` | duplikat |
| `sesi-005B` | 200 | 780 | 20 | -480 | 1 | 10 | 1 | 1 | 15 | 3 | `sesi-005A` | `rejected` | kombinasi |

### 3.5 Perbedaan Penyusunan `comparisons` Saat *Training* vs Saat *Live*

| Tahap | Siapa yang Menyusun `comparisons`? | Sumber Data |
|---|---|---|
| **Saat *Training*** | Skrip Python milik DS | Dicari dari baris-baris lain di tabel Excel/JSON bersih yang sudah dirapikan DS |
| **Saat Aplikasi *Live*** | *Backend* aplikasi | Diambil (*query*) dari *database* PostgreSQL sebelum memanggil FastAPI |

---

## 4. *Use Case* dan Situasi Nyata yang Dibahas

### 4.1 Urutan Sesi Normal Berbeda Tanggal (Contoh Data DS)
DS membuat deret sesi dengan tutor dan murid yang sama pada tanggal berbeda:
- **Baris 1:** `lesson_date: "2026-01-06"`, `submitted_at: "12:12:13Z"` $\rightarrow$ belum ada sesi sebelumnya, maka `comparisons: []`. Hasil: **`valid`**.
- **Baris 2:** `lesson_date: "2026-01-08"`, `submitted_at: "12:19:44Z"` $\rightarrow$ Baris 1 masuk ke `comparisons` karena disubmit sebelum `12:19:44Z`. Karena tanggal les berbeda (`01-06` vs `01-08`) dan durasi 60 menit jam 15.00, maka `exact_dup_count = 0`. Hasil: **`valid`**.
- **Baris 3:** `lesson_date: "2026-01-09"`, `submitted_at: "12:24:40Z"` $\rightarrow$ Baris 1 dan Baris 2 masuk ke `comparisons`. Tanggal berbeda dan durasi normal. Hasil: **`valid`**.

### 4.2 Situasi di Dalam 100 Sesi `comparisons` Terdapat Sesi Lama yang Bermasalah
**Kasus:** Minggu lalu ada sesi berdurasi 240 menit (`needs_revision`) yang ikut masuk ke dalam daftar 100 sesi `comparisons`. Hari ini tutor menginput sesi baru (`target`) berdurasi 60 menit jam 15.00 dan tidak kembar dengan sesi mana pun.
**Hasil:** Sesi `target` hari ini tetap **`valid` (Hijau)**. AI hanya menilai 1 sesi `target`, bukan menilai ulang isi `comparisons`. Masalah pada sesi lama tidak menular ke sesi baru selama sesi baru tersebut tidak kembar dengannya.

### 4.3 Situasi `target` Mengalami Duplikat Sekaligus Durasi $> 180$ Menit
**Kasus:** Di dalam `comparisons` terdapat sesi tanggal 10 September berdurasi 200 menit. Tutor menginput lagi sesi baru (`target`) pada tanggal 10 September dengan tutor, murid, mapel, dan durasi 200 menit yang sama persis.
**Hasil:**
- Pada fitur angka, `exact_dup_count = 1` dan `duration_over_limit = +20` sama-sama aktif.
- Status akhir `validity` wajib **`rejected` (Merah)** karena prioritas `rejected` lebih tinggi daripada `needs_revision`.
- Pada *array* `findings` di JSON *response*, **kedua temuan tetap ditulis** (`suspected_duplicate` dengan `related_lesson_session_id` menunjuk sesi kembarannya, serta `duration_outlier` untuk durasi 200 menit).

### 4.4 Situasi Durasi $> 180$ Menit Sekaligus Mulai $> 21.00$
Kondisi ini **tidak mungkin terjadi** karena validasi *form* aplikasi menolak jam selesai yang melewati tengah malam (`23:59`) di hari yang sama. Skenario gabungan ini tidak dibuat di *dataset*.

### 4.5 Kondisi Data Mentah Excel Bimbel (Oktober 2026)
Dari hasil pengecekan terhadap 384 baris sesi (57 *sheet*, 19 tutor, 55 murid) pada *file* Excel bimbel:
- Durasi $> 180$ menit: **0 kasus** (durasi tertinggi 127 menit).
- Jam mulai $> 21.00$: **0 kasus** (paling malam pukul 19.00).
- Duplikat persis: **0 kasus**.
- Rata-rata murid hanya les 4–8 kali sebulan dan tutor mengajar 15–25 kali sebulan (paling sibuk 54 kali), sehingga isi `comparisons` rata-rata hanya belasan sesi, bukan selalu 100 sesi.

Karena data asli 100% normal (`valid`), DS wajib menyuntikkan baris anomali buatan (durasi 181–300 menit, mulai pukul 21.01–22.30, dan penggandaan baris untuk duplikat) sebelum menghitung `comparisons` dan memberi label otomatis.

---

## 5. Hasil *Brainstorming* dan Keputusan Arsitektur

### 5.1 Cara Menyediakan Riwayat untuk Deteksi Duplikat

| Opsi | Cara Kerja | Alasan Memilih / Menolak | Status |
|---|---|---|---|
| **Kirim `target` saja** | *Backend* hanya mengirim objek `target` ke FastAPI | **Ditolak.** Tanpa riwayat sesi lain, model tidak mungkin mendeteksi duplikat (`rejected`) | Ditolak |
| **Opsi A: Kirim `target` + `comparisons` + `config` (tanpa `candidates`)** | *Backend* mengambil riwayat dari *database* dan mengirimkannya bersama `target`; seluruh deteksi dan penilaian dilakukan di FastAPI | **Dipilih.** Model ML benar-benar bekerja menilai sendiri, FastAPI tidak perlu koneksi langsung ke *database* aplikasi, dan perubahan di *backend* sangat kecil | **Dipilih** |
| **Opsi B: FastAPI baca *database* langsung** | *Backend* hanya mengirim `target`, FastAPI melakukan *query* riwayat sendiri ke PostgreSQL | **Ditolak.** Membuat layanan AI terikat pada kredensial dan skema *database* aplikasi serta menyulitkan pengujian terpisah | Ditolak |
| **Opsi C: Tetap pakai `candidates` dari *backend*** | Duplikat dicek *if-else* *backend*, model hanya mengiyakan `candidates` | **Ditolak.** Nilai *machine learning* hilang karena deteksi utama dilakukan oleh *backend* | Ditolak |

### 5.2 Rentang Waktu `comparisons`: $\pm 7$ Hari vs $\pm 30$ Hari

| Kriteria Perbandingan | Jendela $\pm 7$ Hari (Maks 30 Sesi) | Jendela $\pm 30$ Hari (Maks 100 Sesi) |
|---|---|---|
| Asal-usul di *prototype* | Dipakai karena keterbatasan biaya token dan kecepatan Gemini | Tidak terkendala token karena dihitung dengan Python lokal di FastAPI |
| Duplikat di tanggal yang sama | Tertangkap 100% | Tertangkap 100% |
| Duplikat beda minggu / salah pilih tanggal di kalender | Tidak terlihat jika selisih $> 7$ hari | **Tertangkap** karena masih dalam satu bulan |
| Pola kebiasaan bulanan tutor & murid (rata-rata durasi, frekuensi bulanan) | Data terlalu sedikit (2–4 sesi seminggu) | **Akurat** (15–50 sesi sebulan) dan selaras dengan siklus rekap gaji bulanan |
| Beban data | Sangat ringan | Tetap ringan (tutor tersibuk hanya 54 sesi sebulan) |
| **Keputusan** | Tidak dipakai | **Dipilih ($\pm 30$ hari, `MAX_COMPARISONS = 100`)** |

### 5.3 Metode Pelabelan *Dataset* oleh DS

| Opsi | Cara Kerja | Alasan Memilih / Menolak | Status |
|---|---|---|---|
| **Tanpa label sama sekali (*Unsupervised*)** | Melatih model tanpa kolom `validity` | **Ditolak.** Model tidak bisa membedakan tindakan bisnis antara `needs_revision` (Biru/tutor bisa edit) dan `rejected` (Merah/admin hapus) | Ditolak |
| **Label manual satu per satu** | DS mengetik label baris demi baris secara manual | **Ditolak.** Memakan waktu dan rawan salah ketik | Ditolak |
| **Label otomatis dengan skrip Python (*Supervised*)** | DS menjalankan skrip aturan untuk mengisi `comparisons` dan memberi label `validity` (`valid` / `needs_revision` / `rejected`) di setiap baris | **Dipilih.** Selesai dalam hitungan detik, konsisten dengan aturan kelompok, dan langsung siap dipakai `model.fit(X, y)` | **Dipilih** |

---

## 6. Ringkasan Keputusan Akhir

1. **Kontrak *Input* ke FastAPI:** Menggunakan `{ target, comparisons, config }` tanpa `candidates`. *Backend* selalu memanggil AI untuk setiap sesi absen.
2. **Jendela `comparisons`:** Menggunakan rentang **$\pm 30$ hari** dari `lesson_date` dengan batas maksimal **100 sesi** untuk `tutor_id` atau `student_id` yang sama dan `submitted_at` lebih awal.
3. **Tugas DS:**
   - Membersihkan data Excel menjadi format `target` ber-UUID konsisten.
   - Menyuntikkan data anomali sintetis (durasi $> 180$ menit, mulai $> 21.00$, dan baris duplikat).
   - Menjalankan skrip otomatis untuk mencari `comparisons`, menghitung kolom-kolom fitur angka di CSV, dan mengisi label `validity`.
4. **Tugas AI Engineer:** Melatih model klasifikasi tabular dari CSV fitur angka tersebut, memasang *guardrail* aturan bisnis di FastAPI, dan mengembalikan JSON `{ validity, validity_reason, findings }` sesuai kontrak aplikasi.
