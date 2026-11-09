# Spesifikasi Dataset & Model AI Anomaly Absen Tutor

Dokumen ini menjadi pegangan **Data Scientist (DS)**, **AI Engineer**, dan **Fullstack** untuk mengganti prototype Gemini dengan **model AI internal (FastAPI)**.

Sumber data mentah: [10. Absen Bimbel Oktober 2026.xlsx](./10.%20Absen%20Bimbel%20Oktober%202026.xlsx)
Referensi kontrak awal: [AI-ANOMALY-API-CONTRACT.md](./AI-ANOMALY-API-CONTRACT.md)

---

## 1. Arsitektur & Alur Kerja (Keputusan Final)

```
Tutor submit form absen
   ↓
Backend menyimpan sesi baru → menjadi "target"
   ↓
Backend mengambil riwayat sesi ±30 hari dari lesson_date
(milik tutor yang sama ATAU murid yang sama, maks 100 sesi) → menjadi "comparisons"
   ↓
Backend memanggil FastAPI: POST /v1/anomaly/analyze
Body: { target, comparisons, config }   (TANPA candidates — setiap sesi selalu dikirim ke AI)
   ↓
FastAPI:
   1. Feature builder mengubah target + comparisons menjadi fitur angka
   2. Model klasifikasi memprediksi validity (valid / needs_revision / rejected)
   3. Guardrail memastikan aturan pasti tidak dilanggar
   4. Template builder menyusun findings, severity, dan alasan Bahasa Indonesia
   ↓
FastAPI mengembalikan JSON { validity, validity_reason, findings } ke Backend
   ↓
Backend menyimpan hasil → Dashboard menampilkan status Hijau / Biru / Merah
```

### Perubahan dari kontrak Gemini lama

| Komponen                | Prototype lama (Gemini)              | Desain baru (Model AI Internal)                                 |
| ----------------------- | ------------------------------------ | --------------------------------------------------------------- |
| `candidates` di request | Ada (dibuat `if-else` backend)       | **Dihapus.** Deteksi sepenuhnya dilakukan di FastAPI            |
| Pemanggilan AI          | Hanya jika `candidates` tidak kosong | **Selalu dipanggil** untuk setiap sesi                          |
| Jendela `comparisons`   | ±7 hari, maks 30 sesi                | **±30 hari**, maks **100 sesi** (selaras periode rekap bulanan) |
| Penentu keputusan       | Gemini + normalisasi adapter         | **Model klasifikasi tabular + guardrail aturan** di FastAPI     |

---

## 2. Aturan Bisnis Validitas Data (Label Target)

| Label (`validity`) | Warna UI | Kondisi                                                                                              | Efek di Aplikasi                                                   |
| ------------------ | -------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `valid`            | Hijau    | Tidak ada anomali                                                                                    | Langsung `approved` dan **masuk rekap gaji & tagihan**             |
| `needs_revision`   | Biru     | `duration_minutes > 180` **ATAU** `start_time > "21:00"` (tepat 180 atau tepat 21:00 **tidak** kena) | Ditahan dari rekap. Tutor bisa edit, Admin bisa approve hasil edit |
| `rejected`         | Merah    | Data duplikat (`>= 2` catatan sesi yang sama)                                                        | Ditahan dari rekap. Tutor tidak bisa edit, Admin punya opsi hapus  |

- Jika suatu sesi memiliki **duplikat sekaligus** masalah durasi/jam mulai, `validity` akhir wajib **`rejected`**, namun semua temuan tetap ditulis di `findings`.
- Admin memiliki akses penuh (create, edit, delete, ubah validitas) untuk mengoreksi salah label dari AI.

---

## 3. Kontrak JSON (Backend ↔ FastAPI)

### 3.1 Request (`POST /v1/anomaly/analyze`) — Input untuk AI

```json
{
  "target": {
    "id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    "tutor_id": "11111111-1111-4111-8111-111111111111",
    "student_id": "22222222-2222-4222-8222-222222222222",
    "subject_ids": [
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444"
    ],
    "lesson_date": "2026-09-02",
    "start_time": "14:00",
    "duration_minutes": 60,
    "submitted_at": "2026-09-02T08:20:00Z"
  },
  "comparisons": [
    {
      "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "tutor_id": "11111111-1111-4111-8111-111111111111",
      "student_id": "22222222-2222-4222-8222-222222222222",
      "subject_ids": [
        "33333333-3333-4333-8333-333333333333",
        "44444444-4444-4444-8444-444444444444"
      ],
      "lesson_date": "2026-09-02",
      "start_time": "14:00",
      "duration_minutes": 60,
      "submitted_at": "2026-09-02T08:05:00Z"
    }
  ],
  "config": {
    "durationOutlierMinutes": 180,
    "lateStartAfter": "21:00"
  }
}
```

### 3.2 Response (`HTTP 200`) — Output dari AI

**Contoh 1: Ditolak / Duplikat (`rejected`)**

```json
{
  "validity": "rejected",
  "validity_reason": "Sesi dinilai duplikat dari sesi yang sudah tercatat dengan tutor, murid, mata pelajaran, tanggal, dan durasi yang sama.",
  "findings": [
    {
      "lesson_session_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "related_lesson_session_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "is_anomaly": true,
      "finding_type": "suspected_duplicate",
      "severity": "medium",
      "reason": "Sesi memiliki tutor, murid, mata pelajaran, tanggal, dan durasi yang sama dengan sesi yang dikirim lebih awal.",
      "evidence_summary": "Tanggal 2026-09-02 dan durasi 60 menit sama dengan sesi pembanding yang dikirim lebih awal.",
      "suggested_action": "review"
    }
  ]
}
```

**Contoh 2: Perlu Revisi (`needs_revision`)**

```json
{
  "validity": "needs_revision",
  "validity_reason": "Durasi sesi melebihi ambang 180 menit dan perlu dikonfirmasi tutor.",
  "findings": [
    {
      "lesson_session_id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      "related_lesson_session_id": null,
      "is_anomaly": true,
      "finding_type": "duration_outlier",
      "severity": "medium",
      "reason": "Durasi sesi melebihi ambang yang ditetapkan.",
      "evidence_summary": "Durasi tercatat 210 menit, sedangkan ambang adalah 180 menit.",
      "suggested_action": "review"
    }
  ]
}
```

**Contoh 3: Valid (`valid`)**

```json
{
  "validity": "valid",
  "validity_reason": "Tidak ditemukan kejanggalan pada data sesi.",
  "findings": []
}
```

---

## 4. Penjelasan Setiap Field (Fungsi & Asal Data)

> **Catatan UUID:** UUID adalah kode unik 36 karakter (contoh `11111111-1111-4111-8111-111111111111`) pengganti nama asli agar data anak tidak bocor. Orang atau mapel yang sama **wajib selalu mendapat UUID yang sama** di seluruh baris.

### 4.1 Field Input (`target`, `comparisons`, `config`)

| Nama Field                      | Tipe / Format                                         | Fungsi                                                                                                                                       | Asal Data di Dataset DS                                                 |
| ------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `target.id`                     | UUID                                                  | ID unik sesi yang sedang diperiksa                                                                                                           | Dibuat DS (`uuid4` / `uuid5`)                                           |
| `target.tutor_id`               | UUID                                                  | Identitas tutor                                                                                                                              | Kolom Excel _Nama Tutor_ → dibersihkan → dipetakan ke UUID              |
| `target.student_id`             | UUID                                                  | Identitas murid                                                                                                                              | Kolom Excel _Nama Murid_ → dibersihkan → dipetakan ke UUID              |
| `target.subject_ids`            | Array UUID (1–3 item, **terurut**)                    | Daftar mata pelajaran pada sesi tersebut                                                                                                     | Kolom Excel _Mata Pelajaran_ → dinormalisasi ke mapel baku → UUID       |
| `target.lesson_date`            | `YYYY-MM-DD`                                          | Tanggal les (zona `Asia/Jakarta`)                                                                                                            | Kolom Excel _Tanggal Les_ → diseragamkan                                |
| `target.start_time`             | `HH:MM` atau `null`                                   | Jam mulai les (dipakai cek `> 21:00`)                                                                                                        | Bagian awal kolom Excel _Durasi Les_ (mis. `14.00 - 15.00` → `14:00`)   |
| `target.duration_minutes`       | Integer                                               | Lama les dalam menit (dipakai cek `> 180`)                                                                                                   | Selisih jam selesai dikurangi jam mulai dari kolom _Durasi Les_         |
| `target.submitted_at`           | ISO 8601 UTC                                          | Waktu tutor submit absen (menentukan sesi mana yang lebih dulu ada)                                                                          | **Tidak ada di Excel.** Dibuat sintetis oleh DS setelah jam les selesai |
| `comparisons`                   | Array objek (struktur sama dengan `target`, maks 100) | Riwayat sesi dalam **±30 hari** dari `target.lesson_date` milik tutor yang sama **atau** murid yang sama, yang `submitted_at`-nya lebih awal | Disusun skrip DS dari tabel bersih                                      |
| `config.durationOutlierMinutes` | Integer (`180`)                                       | Ambang durasi (camelCase sesuai kontrak)                                                                                                     | Konstanta `180`                                                         |
| `config.lateStartAfter`         | String (`"21:00"`)                                    | Ambang jam mulai malam (camelCase sesuai kontrak)                                                                                            | Konstanta `"21:00"`                                                     |

**Field yang DILARANG masuk ke input AI:** `No`, `Nama Tutor` (teks), `Nama Murid` (teks), `Kelas`, `Asal Sekolah`, `learning_material`, `learning_notes`, `next_focus`.

### 4.2 Field Output (`validity`, `validity_reason`, `findings`)

Output **bukan** berasal dari kolom Excel, melainkan **label jawaban** yang dibuat DS berdasarkan aturan bisnis.

| Nama Field                             | Nilai yang Diizinkan                                                       | Fungsi & Cara Mengisi                                                                                |
| -------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `validity`                             | `valid`, `needs_revision`, `rejected`                                      | Keputusan akhir sesi sesuai tabel di Bagian 2                                                        |
| `validity_reason`                      | String (maks 600 karakter)                                                 | Ringkasan alasan Bahasa Indonesia untuk ditampilkan ke Admin & Tutor                                 |
| `findings`                             | Array objek (`[]` jika `valid`)                                            | Daftar detail anomali yang ditemukan pada `target`                                                   |
| `findings[].lesson_session_id`         | UUID                                                                       | **Wajib selalu sama dengan `target.id`**                                                             |
| `findings[].related_lesson_session_id` | UUID atau `null`                                                           | ID sesi kembaran dari `comparisons` jika `suspected_duplicate`; `null` untuk temuan durasi/jam mulai |
| `findings[].is_anomaly`                | Boolean                                                                    | `true` untuk temuan aktif yang disimpan ke database                                                  |
| `findings[].finding_type`              | `suspected_duplicate`, `duration_outlier`, `late_start`, `unusual_pattern` | Jenis masalah yang ditemukan                                                                         |
| `findings[].severity`                  | `low`, `medium`, `high`                                                    | Prioritas pemeriksaan Admin                                                                          |
| `findings[].reason`                    | String (maks 600 karakter)                                                 | Kalimat penjelasan mengapa dianggap anomali                                                          |
| `findings[].evidence_summary`          | String (maks 600 karakter) atau `null`                                     | Fakta angka dari input (tanggal, durasi, jam mulai)                                                  |
| `findings[].suggested_action`          | `"review"`                                                                 | Selalu diisi `"review"`                                                                              |

---

## 5. Tugas Data Scientist (Pembersihan & Pembuatan Dataset)

### 5.1 Kondisi Awal Data Excel (`10. Absen Bimbel Oktober 2026.xlsx`)

- 57 sheet (1 sheet per murid), **384 baris sesi**, 19 tutor, 55 murid.
- **0 kasus** durasi > 180 menit (maksimal 127 menit).
- **0 kasus** mulai setelah 21:00 (paling malam 19:00).
- **0 kasus** duplikat persis.

### 5.2 Langkah Pembersihan Data Nyata

1. **Tanggal (`Tanggal Les`):** 166 baris bertipe datetime Excel dengan hari dan bulan tertukar (contoh `2026-02-09` untuk 2 September 2026) dan 218 baris teks `m/d/yyyy`. Seragamkan semua ke `YYYY-MM-DD`.
2. **Jam & Durasi (`Durasi Les`):** Terdapat 5+ gaya penulisan (`14.00 - 15.00`, `14:15-15:45`, `11 00-12.00`, `15.00-16.00"`, `13.1`). Pecah menjadi `start_time` (`HH:MM`) dan `duration_minutes` (integer).
3. **Baris Rusak (3 baris):** 2 baris jam selesai lebih kecil dari jam mulai (`18.00 - 17.00`, `16.00 - 14.00`) dan 1 baris tidak lengkap (`13.1`). Buang dari data bersih atau perbaiki setelah konfirmasi.
4. **Mata Pelajaran (`Mata Pelajaran`):** Terdapat ~310 variasi teks bebas yang tercampur materi (contoh: `"mtk"`, `"math (teorema phytagoras)"`, `"ngaji, bing"`). Petakan ke daftar mata pelajaran baku (maks 3 mapel per sesi), urutkan UUID-nya.
5. **Nama Tutor & Murid:** Samakan ejaan ganda (`Aisyah`/`Asiyah`, `Eka Fitriana`/`Eka Eriyana`, `Dhaniel`/`Daniel`), lalu konversi ke UUID konsisten. Simpan tabel pemetaan nama ↔ UUID secara terpisah (jangan di-commit ke publik).
6. **Sheet Kosong & Ganda:** Abaikan `ABSEN KOSONG`, gabungkan sheet murid yang terpecah (`Faza` dan `Faza 2`, `hanum` dan `Hanum `, `akbar` dan `akbar 2`).

### 5.3 Pembuatan Data Anomali Sintetis (Wajib)

Karena data asli 100% normal, DS harus membangkitkan sampel anomali dari data bersih agar model bisa belajar ketiga kelas:

| Skenario                       | Cara Membuat                                                                                                                                  | Label `validity` | `finding_type`                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------ |
| Normal (data asli + variasi)   | Sesi asli dengan durasi ≤ 180, mulai ≤ 21:00, tidak duplikat                                                                                  | `valid`          | `[]`                                       |
| Kasus batas normal             | Durasi **tepat 180 menit**, atau mulai **tepat `21:00`**                                                                                      | `valid`          | `[]`                                       |
| Mirip tapi sah (hard negative) | Tutor & murid sama di hari yang sama tetapi mapel/jam berbeda; atau 2 sesi di minggu berbeda dalam ±30 hari                                   | `valid`          | `[]`                                       |
| Durasi berlebih                | Ubah `duration_minutes` ke rentang **181–300 menit** (sertakan 181)                                                                           | `needs_revision` | `duration_outlier`                         |
| Mulai malam                    | Ubah `start_time` ke **`21:01`–`22:30`** dengan durasi yang tidak melewati `23:59`                                                            | `needs_revision` | `late_start`                               |
| Duplikat persis                | Gandakan sesi di `comparisons` (tutor, murid, `subject_ids`, `lesson_date`, `duration_minutes` sama) dengan `submitted_at` target lebih akhir | `rejected`       | `suspected_duplicate`                      |
| Duplikat + durasi > 180        | Gandakan sesi yang durasinya > 180 menit                                                                                                      | `rejected`       | `suspected_duplicate` + `duration_outlier` |

> **Catatan:** Jangan membuat kombinasi `start_time > 21:00` sekaligus `duration_minutes > 180` karena melewati tengah malam (`23:59`) dan ditolak validasi form aplikasi.

Target komposisi dataset yang disarankan: **~60–70% `valid`, ~15–20% `needs_revision`, ~15–20% `rejected`**.

### 5.4 Format File Deliverable DS

File `train.jsonl`, `val.jsonl`, dan `test.jsonl` (pembagian split **per murid atau per kelompok waktu**, bukan acak per baris agar pasangan duplikat tidak bocor antar split). Setiap baris berformat:

```json
{
  "input": {
    "target": { "...": "..." },
    "comparisons": [],
    "config": { "durationOutlierMinutes": 180, "lateStartAfter": "21:00" }
  },
  "output": { "validity": "valid", "validity_reason": "...", "findings": [] },
  "meta": { "scenario": "real_normal", "split": "train" }
}
```

---

## 6. Cara Kerja Model & Best Practice (Untuk AI Engineer)

### 6.1 Jenis Model

Gunakan **klasifikasi tabular 3 kelas** (`LightGBM` / `XGBoost` / `RandomForest`), **bukan** memasukkan JSON mentah atau UUID ke dalam model.

### 6.2 Feature Engineering (Dari `target` + `comparisons` ±30 Hari)

Kode _feature builder_ mengubah JSON input menjadi satu baris fitur angka. **Fungsi yang sama persis harus dipakai saat training dan saat inferensi di FastAPI.**

| Nama Fitur                           | Rumus / Arti                                                                                                                                                  | Tujuan                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `duration_minutes`                   | `target.duration_minutes`                                                                                                                                     | Deteksi durasi                                  |
| `duration_over_limit`                | `target.duration_minutes - config.durationOutlierMinutes`                                                                                                     | Jarak terhadap ambang 180 menit                 |
| `start_minute_of_day`                | `HH * 60 + MM` dari `target.start_time` (`-1` jika `null`)                                                                                                    | Deteksi jam mulai                               |
| `start_over_limit`                   | `start_minute_of_day - 1260` (`21:00` = 1260)                                                                                                                 | Jarak terhadap ambang 21:00                     |
| `subject_count`                      | `len(target.subject_ids)`                                                                                                                                     | Konteks jumlah mapel                            |
| `exact_dup_count`                    | Jumlah sesi di `comparisons` (yang `submitted_at` < target) dengan `tutor_id`, `student_id`, `subject_ids`, `lesson_date`, dan `duration_minutes` sama persis | Sinyal utama `rejected` (duplikat >= 2)         |
| `same_tutor_student_date_count`      | Jumlah sesi di `comparisons` dengan tutor, murid, dan tanggal sama (meski durasi/mapel beda)                                                                  | Deteksi duplikat samar                          |
| `same_student_date_diff_tutor_count` | Jumlah sesi di `comparisons` dengan murid & tanggal sama, mapel beririsan, tapi tutor berbeda                                                                 | Deteksi bentrok antar tutor                     |
| `time_overlap_count`                 | Jumlah sesi di `comparisons` pada tanggal sama yang rentang jamnya bertabrakan untuk tutor atau murid yang sama                                               | Deteksi jadwal tabrakan                         |
| `tutor_sessions_30d`                 | Total sesi tutor tersebut di `comparisons` (30 hari)                                                                                                          | Konteks keaktifan bulanan                       |
| `student_sessions_30d`               | Total sesi murid tersebut di `comparisons` (30 hari)                                                                                                          | Deteksi frekuensi les tidak wajar dalam 1 bulan |
| `duration_diff_from_tutor_mean_30d`  | Selisih durasi target terhadap rata-rata durasi tutor itu dalam 30 hari                                                                                       | Deteksi pola durasi tidak lazim per tutor       |
| `start_diff_from_tutor_mean_30d`     | Selisih jam mulai target terhadap kebiasaan jam mengajar tutor itu dalam 30 hari                                                                              | Deteksi jam mengajar tidak lazim per tutor      |

### 6.3 Kombinasi Model + Guardrail + Template

1. **Prediksi Model:** Model menerima vektor fitur di atas dan mengeluarkan prediksi kelas (`valid`, `needs_revision`, `rejected`) beserta probabilitasnya.
2. **Guardrail Aturan Pasti:** Setelah prediksi model, terapkan pengaman deterministik agar aturan mutlak kelompok tidak pernah meleset di kasus batas:
   - Jika `exact_dup_count >= 1` → paksa `validity = "rejected"`.
   - Jika tidak `rejected` dan (`duration_minutes > config.durationOutlierMinutes` atau `start_time > config.lateStartAfter`) → paksa `validity = "needs_revision"`.
3. **Penyusunan `findings` & Kalimat Alasan:** Gunakan template Bahasa Indonesia yang mengambil angka langsung dari input (`duration_minutes`, `start_time`, `lesson_date`, dan `id` sesi kembaran dari `comparisons`) sehingga format JSON 100% valid dan bebas halusinasi.

### 6.4 Evaluasi yang Wajib Dilaporkan

- **Precision, Recall, F1-score per kelas** (`valid`, `needs_revision`, `rejected`) + **Confusion Matrix**. Prioritaskan **Recall** pada `rejected` dan `needs_revision` agar sesi bermasalah tidak lolos ke rekap gaji.
- **Pengujian Kasus Batas:** durasi `179`, `180`, `181` menit; jam mulai `20:59`, `21:00`, `21:01`; duplikat persis; dan _hard negative_.
- **Perbandingan terhadap Baseline Rule:** Tunjukkan perbandingan model ML terhadap aturan `if-else` sederhana, serta _feature importance_ dari fitur 30 hari.

---

## 7. Penyesuaian Kecil di Backend (Untuk Fullstack)

Agar backend terhubung ke FastAPI dengan skema ±30 hari tanpa mengubah fitur aplikasi lain:

1. Di [candidates.ts](../backend/src/services/anomaly/candidates.ts): ubah `COMPARISON_WINDOW_DAYS = 30` dan `MAX_COMPARISONS = 100`.
2. Di [anomaly-service.ts](../backend/src/services/anomaly/anomaly-service.ts): hapus kondisi `if (candidates.length === 0) return finish('completed', { validity: 'valid', ... })` agar setiap sesi selalu dikirim ke detektor AI.
3. Buat adapter HTTP baru (mengimplementasikan `AnomalyDetector`) yang mengirim `{ target, comparisons, config }` (hanya 8 field publik pada `target` dan `comparisons`, tanpa `learning_material` / `learning_notes` / `next_focus`) ke `POST /v1/anomaly/analyze` milik FastAPI.
