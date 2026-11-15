# Rencana Implementasi *Modelling* AI (Tahap 1 & Tahap 2 di Google Colab)

Dokumen ini adalah panduan langkah demi langkah (*step-by-step*) untuk menjalankan **Tahap 1 (Ekstraksi 19 Fitur)** dan **Tahap 2 (*Training* & Evaluasi Model ML)** secara manual di **Google Colab**.

- **Input Awal:** `sessions_with_synthetic.csv` (7.557 baris, 10 kolom mentah).
- **Output Akhir:** File model `anomaly_model.pkl` + `feature_metadata.json` yang siap dipasang ke layanan FastAPI.

---

## Gambaran Alur Kerja di Google Colab

```
[File Input]
sessions_with_synthetic.csv (7.557 baris mentah)
       │
       ▼
[TAHAP 1: Ekstraksi Fitur & Pelabelan]
1. Upload & baca CSV mentah
2. Cari comparisons (+-30 hari, maks 500 sesi, submitted_at lebih awal)
3. Hitung 19 fitur angka (FEATURE_NAMES) + tentukan label validity
4. Simpan ke features_dataset.csv
       │
       ▼
[TAHAP 2: Training, Evaluasi & Export Model]
1. Bagi data (Train 70% / Validation 15% / Test 15%)
2. Latih 3 kandidat model (LightGBM, XGBoost, Random Forest)
3. Evaluasi (Classification Report, Confusion Matrix, Kasus Batas, Feature Importance)
4. Pilih model terbaik & export ke anomaly_model.pkl + feature_metadata.json
```

---

## TAHAP 1: Pembuatan *Dataset* Fitur (`features_dataset.csv`)

Tujuan Tahap 1 adalah mengubah tabel sesi mentah (`sessions_with_synthetic.csv`) menjadi tabel matriks **19 kolom fitur angka** ditambah kolom target **`validity`**.

### Poin 1.1 — Persiapan & *Upload* Data di Google Colab
1. Buat *notebook* baru di Google Colab (misal: `Capstone_Anomaly_Modelling.ipynb`).
2. *Upload* file `sessions_with_synthetic.csv` ke penyimpanan sesi Colab.
3. Pastikan jumlah baris terbaca **7.557 baris** dan tidak ada nilai kosong (*null*) pada kolom wajib (`id`, `tutor_id`, `student_id`, `subject_ids`, `lesson_date`, `start_time`, `duration_minutes`, `submitted_at`).

### Poin 1.2 — *Parsing* Tipe Data Awal
Sebelum menghitung fitur, ubah format kolom mentah agar siap dihitung secara matematis:
1. **`subject_ids`:** Ubah dari teks JSON `'["uuid-1", "uuid-2"]'` menjadi *list* Python (pastikan terurut dengan `sorted()`).
2. **`start_time`:** Ubah dari string `"HH:MM"` menjadi total menit sejak pukul `00:00`:
   - `start_minute = int(HH) * 60 + int(MM)` (contoh: `"14:00"` -> `840`).
   - Hitung juga jam selesai dalam menit: `end_minute = start_minute + duration_minutes` (dipakai untuk mengecek jadwal bentrok/*overlap*).
3. **`lesson_date`:** Ubah dari string `"YYYY-MM-DD"` menjadi objek tanggal (`datetime.date`) agar bisa dihitung selisih harinya.

### Poin 1.3 — Pencarian `comparisons` per Baris (Jendela +-30 Hari, Maks 500 Sesi)
Untuk setiap baris sesi `target` di dalam tabel, cari seluruh baris sesi lain (`other`) yang memenuhi **4 syarat**:
1. `other.id != target.id` (bukan dirinya sendiri).
2. `other.tutor_id == target.tutor_id` **ATAU** `other.student_id == target.student_id` (tutor atau muridnya sama).
3. `abs((other.lesson_date - target.lesson_date).days) <= 30` (dalam rentang +-30 hari).
4. `other.submitted_at < target.submitted_at` (di-*submit* lebih dulu; jika `submitted_at` sama persis, gunakan pembanding `other.id < target.id`).
5. Urutkan dari `submitted_at` paling awal dan batasi maksimal **500 sesi** (`[:500]`).

### Poin 1.4 — Perhitungan 19 Fitur Angka (`FEATURE_NAMES`)
Dari `target` dan daftar `comparisons` yang didapat pada Poin 1.3, hitung tepat **19 fitur angka** dengan urutan baku berikut:

```python
FEATURE_NAMES = [
    # No. 1 - 5 (Dari target & config)
    "duration_minutes",                  # 1. target.duration_minutes
    "duration_over_limit",               # 2. duration_minutes - 180
    "start_minute",                      # 3. HH * 60 + MM
    "start_over_limit",                  # 4. start_minute - 1260 (21:00)
    "subject_count",                     # 5. len(target.subject_ids)
    # No. 6 - 13 (Dari comparisons)
    "comparisons_count",                 # 6. len(comparisons)
    "exact_dup_count",                   # 7. 6 atribut sama persis (termasuk start_time)
    "same_tutor_student_date_count",     # 8. tutor, murid, lesson_date sama
    "same_student_date_diff_tutor_count",# 9. murid & lesson_date sama, mapel irisan, tutor beda
    "time_overlap_count",                # 10. tanggal sama, tutor/murid sama, jam bertabrakan
    "tutor_sessions_30d",                # 11. jumlah sesi milik tutor_id yang sama di comparisons
    "student_sessions_30d",              # 12. jumlah sesi milik student_id yang sama di comparisons
    "duration_diff_from_tutor_mean_30d", # 13. duration_minutes - rata2 durasi tutor (0 jika kosong)
    # No. 14 - 19 (6 Fitur Baru)
    "duration_under_limit",              # 14. 30 - duration_minutes
    "start_under_limit",                 # 15. 420 - start_minute (07:00)
    "fuzzy_dup_count",                   # 16. 5 atribut sama, start_time beda
    "tutor_overlap_diff_student_count",  # 17. tanggal sama, tutor sama, murid beda, jam tabrakan
    "student_overlap_diff_tutor_count",  # 18. tanggal sama, murid sama, tutor beda, jam tabrakan
    "self_overlap_count",                # 19. tanggal sama, tutor & murid sama, jam tabrakan, bukan exact dup
]
```

> **Rumus Cek Jam Bertabrakan (*Overlap*):**
> Dua sesi `A` dan `B` pada `lesson_date` yang sama bertabrakan jika:
> `A.start_minute < B.end_minute` **DAN** `B.start_minute < A.end_minute`.

### Poin 1.5 — Penentuan Label Target (`validity`) Otomatis
Tentukan kolom target `validity` untuk setiap baris berdasarkan hierarki prioritas aturan bisnis:
1. **Jika `exact_dup_count >= 1`** -> `validity = "rejected"`
2. **Selain itu, jika salah satu kondisi ini terpenuhi:**
   - `duration_over_limit > 0` (durasi `> 180`), atau
   - `duration_under_limit > 0` (durasi `< 30`), atau
   - `start_over_limit > 0` (mulai `> 21:00`), atau
   - `start_under_limit > 0` (mulai `< 07:00`), atau
   - `fuzzy_dup_count >= 1`, atau
   - `tutor_overlap_diff_student_count >= 1`, atau
   - `student_overlap_diff_tutor_count >= 1`, atau
   - `self_overlap_count >= 1`
   -> `validity = "needs_revision"`
3. **Selain itu** -> `validity = "valid"`

### Poin 1.6 — Validasi & Penyimpanan `features_dataset.csv`
Sebelum lanjut ke Tahap 2, cek hasil tabel fitur:
- Pastikan jumlah baris tetap **7.557 baris** dan tidak ada nilai `NaN`.
- Cek distribusi kolom `validity`: wajib berada di angka **`valid`: 4.534 (60.00%)**, **`needs_revision`: 1.511 (19.99%)**, dan **`rejected`: 1.512 (20.01%)**.
- Simpan hasilnya ke file **`features_dataset.csv`** (berisi kolom `id`, 19 kolom `FEATURE_NAMES`, `validity`, `is_synthetic`, dan `scenario`).

---

## TAHAP 2: *Training*, Evaluasi, & *Export* Model ML

Tujuan Tahap 2 adalah melatih model klasifikasi 3 kelas dari `features_dataset.csv`, membuktikan kualitasnya lewat evaluasi, dan menyimpan model terbaik menjadi file `.pkl`.

### Poin 2.1 — Pemisahan Data (*Train / Validation / Test Split*)
1. Pisahkan matriks fitur `X` (hanya mengambil **19 kolom `FEATURE_NAMES`**, tanpa kolom `id`, `is_synthetic`, atau `scenario`) dan target `y` (kolom `validity`).
2. Gunakan **Stratified Split** (`stratify=y`, `random_state=42`) dengan proporsi:
   - **Data *Train* (70% — ~5.289 baris):** Untuk melatih model (`model.fit`).
   - **Data *Validation* (15% — ~1.134 baris):** Untuk memilih parameter dan membandingkan kandidat model.
   - **Data *Test* (15% — ~1.134 baris):** Dikunci untuk pengujian akhir.
3. Pastikan proporsi kelas di setiap *split* tetap terjaga **60% `valid`, 20% `needs_revision`, 20% `rejected`**.

### Poin 2.2 — Pelatihan 3 Kandidat Model (*Model Training*)
Latih 3 algoritma pohon keputusan (*tree-based tabular models*) pada data *Train* agar punya tabel perbandingan di laporan *capstone*:
1. **Model 1 — *Random Forest Classifier* (`scikit-learn`):** Sebagai *baseline* model *ensemble* standar (`n_estimators=200`, `random_state=42`).
2. **Model 2 — *XGBoost Classifier* (`xgboost`):** Model *gradient boosting* populer (`n_estimators=200`, `max_depth=6`, `learning_rate=0.1`). *(Catatan: XGBoost butuh encoding label target menjadi angka `0, 1, 2` dengan `LabelEncoder`)*.
3. **Model 3 — *LightGBM Classifier* (`lightgbm`):** Model *gradient boosting* utama yang cepat dan ringan (`n_estimators=200`, `random_state=42`).

### Poin 2.3 — Evaluasi Model (Wajib Dicatat untuk Laporan *Capstone*)
Jalankan 4 pengujian berikut pada data *Validation* dan *Test*:

1. **Metrik per Kelas (*Classification Report*):**
   - Tampilkan **Precision, Recall, dan F1-Score** untuk masing-masing kelas (`valid`, `needs_revision`, `rejected`) serta **Macro F1-Score**.
   - Fokus utama: **Recall pada `rejected` dan `needs_revision`** harus mendekati **100%** (agar tidak ada sesi bermasalah yang lolos menjadi `valid` dan terbayar di rekap gaji).
2. ***Confusion Matrix* (3x3):**
   - Buat plot *heatmap* 3x3 untuk melihat apakah ada kebocoran prediksi antar kelas.
3. ** Evaluasi per Skenario (`scenario`):**
   - Kelompokkan hasil prediksi pada data *Test* berdasarkan ke-15 nilai kolom `scenario` (termasuk `batas_valid` tepat 30/180 menit dan 07:00/21:00, serta ke-4 `kombinasi_dup_*`) untuk membuktikan model tidak salah di garis batas.
4. ***Feature Importance* (Tingkat Kepentingan 19 Fitur):**
   - Buat grafik batang (*bar chart*) peringkat ke-19 fitur dari model terbaik untuk menunjukkan fitur mana yang paling berperan dalam pengambilan keputusan AI.

### Poin 2.4 — Penyimpanan (*Export*) Artefak Model untuk FastAPI
Setelah memilih model terbaik (misalnya LightGBM / Random Forest):
1. **Simpan file model (`anomaly_model.pkl`):**
   Gunakan `joblib.dump(best_model, "anomaly_model.pkl")`.
2. **Simpan metadata fitur (`feature_metadata.json`):**
   Simpan urutan `FEATURE_NAMES` (19 fitur), daftar kelas target (`["valid", "needs_revision", "rejected"]`), dan nilai *default* `config` (`180`, `30`, `"21:00"`, `"07:00"`) agar FastAPI bisa memvalidasi urutan fitur secara otomatis saat *startup*.
3. *Download* kedua file (`anomaly_model.pkl` dan `feature_metadata.json`) dari Google Colab ke komputer lokal untuk dimasukkan ke dalam folder service FastAPI.

---

## Checklist Selesai (Sebelum Lanjut Ngoding FastAPI)

- [ ] **Tahap 1:** `features_dataset.csv` terbentuk (7.557 baris, 19 kolom fitur + `validity`, distribusi 60% / 20% / 20%).
- [ ] **Tahap 2:** 3 model (Random Forest, XGBoost, LightGBM) sudah dilatih dan dibandingkan tabel metriknya.
- [ ] **Evaluasi:** *Confusion Matrix*, *Classification Report*, pengujian kasus batas (`batas_valid`), dan grafik *Feature Importance* sudah disimpan.
- [ ] **Artefak:** File `anomaly_model.pkl` dan `feature_metadata.json` sudah di-*download* dari Google Colab.
