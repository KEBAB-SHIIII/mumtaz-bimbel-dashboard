# Analisis Kasus Batas Durasi 181 Menit & Implementasi _Guardrail_ di FastAPI

Dokumen ini menjelaskan akar penyebab melesetnya 1 baris prediksi pada _Validation Set_ (kasus durasi 181 menit) saat pelatihan model _Machine Learning_ (`anomaly_model.pkl`), serta spesifikasi teknis **Tahap 4 (_Guardrail_ Deterministik)** di layanan FastAPI untuk menutup celah perbatasan (_boundary gap_) tersebut hingga akurasi aturan bisnis mencapai 100% di produksi.

---

## 1. Identifikasi Baris Data yang Meleset (1 dari 7.557 Baris)

Dari seluruh **7.557 baris** pada `features_dataset.csv`, model `anomaly_model.pkl` (_LightGBM_) menebak benar **7.556 baris (99,987%)** dan hanya meleset pada **1 baris** berikut di _Validation Set_:

| Atribut / Fitur                    | Nilai pada Baris yang Meleset                          |
| ---------------------------------- | ------------------------------------------------------ |
| `id`                               | `70b51366-e585-46cb-a630-3b5238ed735f`                 |
| `scenario`                         | `durasi_panjang` (`is_synthetic = 1`)                  |
| `duration_minutes` (#1)            | **`181` menit**                                        |
| `duration_over_limit` (#2)         | **`+1` menit** (`181 - 180 = 1`)                       |
| `start_minute` (#3)                | `495` (pukul `08:15` pagi)                             |
| `comparisons_count` (#6)           | `41` sesi                                              |
| `exact_dup_count` (#7)             | `0`                                                    |
| **Label Sebenarnya (`validity`)**  | **`needs_revision` (Biru)**                            |
| **Prediksi Mentah Model (`pred`)** | **`valid` (Hijau)** _(Meleset 1 menit di garis batas)_ |

---

## 2. Akar Penyebab Matematis: Mengapa Durasi `181` Menit Ditebak `valid`?

Ketika kita memeriksa distribusi nilai `duration_minutes` di sekitar batas 180 menit (rentang `178` s/d `185` menit) pada seluruh 7.557 baris dataset, ditemukan fakta berikut:

| `duration_minutes` | Label Sebenarnya     | Jumlah Baris di Seluruh Dataset (7.557 Baris) |
| ------------------ | -------------------- | --------------------------------------------- |
| `180` menit        | `valid`              | **27 baris** (25 `batas_valid` + 2 `real`)    |
| **`181` menit**    | **`needs_revision`** | **Hanya 1 baris** (`id: 70b51366-...`)        |
| `182` menit        | `needs_revision`     | **0 baris** (tidak ada sampel bernilai 182)   |
| `183` menit        | `needs_revision`     | **3 baris** (`durasi_panjang`)                |
| `184` menit        | `needs_revision`     | **3 baris** (`durasi_panjang`)                |

### Apa yang Terjadi Saat _Split_ Data (70% _Train_ / 15% _Val_ / 15% _Test_)?

1. Satu-satunya baris berdurasi **`181` menit** kebetulan masuk ke dalam **Validation Set (15%)**, sehingga di dalam **Training Set (70%)** tidak ada satu pun contoh durasi `181` atau `182` menit.
2. Di dalam **Training Set**, nilai tertinggi untuk kelas `valid` adalah **`180` menit**, sedangkan nilai terendah untuk kelas `needs_revision` (kategori durasi panjang) adalah **`183` menit**.
3. Algoritma pohon keputusan (_LightGBM_, _XGBoost_, dan _Random Forest_) meletakkan titik potong (_split threshold_) di tengah-tengah antara `180` dan `183`, yaitu di sekitar **`181,5` menit**.
4. Akibatnya, ketika model diuji pada baris _Validation Set_ yang bernilai **`181` menit**, karena `181 < 181,5`, pohon keputusan memasukkannya ke cabang kiri (`valid`). Untuk semua durasi `>= 183` menit, model sudah 100% menebak `needs_revision`.

Fenomena ini disebut _**Boundary Discretization Gap**_ (celah perbatasan akibat tidak adanya sampel `181` menit di dalam _Training Set_) — dan ini adalah bukti nyata mengapa arsitektur produksi kita sejak awal merancang **Tahap 4 (_Guardrail_ Deterministik)** di FastAPI.

---

## 3. Solusi di Produksi: Tahap 4 (_Guardrail_ Deterministik di FastAPI)

Di layanan FastAPI, prediksi dari `anomaly_model.pkl` (Tahap 3) dikombinasikan dengan **Guardrail Aturan Bisnis (Tahap 4)** yang memeriksa ke-19 fitur secara eksak.

### Kode Python _Guardrail_ di FastAPI:

```python
def apply_business_guardrail(raw_model_prediction: str, features: dict) -> str:
    """
    Tahap 4: Guardrail deterministik untuk memastikan 0% kebocoran
    pada kasus batas (seperti 181 menit, 29 menit, 06:59, atau 21:01).
    Urutan prioritas mutlak: rejected > needs_revision > valid.
    """
    # Pintu 1: Prioritas tertinggi -> Duplikat 100% persis wajib REJECTED
    if features["exact_dup_count"] >= 1:
        return "rejected"

    # Pintu 2: 8 kondisi aturan bisnis wajib NEEDS_REVISION
    if (
        features["duration_over_limit"] > 0                 # Durasi > 180 menit (termasuk 181 menit!)
        or features["duration_under_limit"] > 0             # Durasi < 30 menit (termasuk 29 menit!)
        or features["start_over_limit"] > 0                 # Mulai > 21:00 (termasuk 21:01!)
        or features["start_under_limit"] > 0                # Mulai < 07:00 (termasuk 06:59!)
        or features["fuzzy_dup_count"] >= 1                 # Duplikat samar beda jam mulai
        or features["tutor_overlap_diff_student_count"] >= 1# Jadwal tutor bentrok dg murid lain
        or features["student_overlap_diff_tutor_count"] >= 1# Jadwal murid bentrok dg tutor lain
        or features["self_overlap_count"] >= 1              # Jadwal tutor+murid sama bentrok
    ):
        return "needs_revision"

    # Pintu 3: Gunakan prediksi model ML jika tidak melanggar guardrail di atas
    return raw_model_prediction
```

### Bagaimana _Guardrail_ Menyelesaikan Kasus `181` Menit Ini?

1. Baris `181` menit masuk ke FastAPI -> `features["duration_over_limit"]` bernilai **`+1`** (`181 - 180 = 1`).
2. `anomaly_model.pkl` mengeluarkan prediksi mentah `"valid"`.
3. Fungsi `apply_business_guardrail` melihat `features["duration_over_limit"] > 0` (`1 > 0` bernilai `True`), lalu **langsung mengoreksi keputusan akhir menjadi `"needs_revision"`**.
4. Akurasi sistem gabungan (**Model ML + Guardrail**) terhadap seluruh 7.557 baris menjadi **7.557 / 7.557 (100,00% sempurna)**.

---

## 4. Nilai Tambah Temuan Ini untuk Sidang _Capstone_

Temuan 1 baris `181` menit di _Validation Set_ ini justru menjadi **poin presentasi yang sangat kuat** saat sidang _Capstone_:

1. **Membuktikan Kejujuran Eksperimen (Tidak _Data Leakage_):** Menunjukkan bahwa _Validation Set_ benar-benar terpisah dari _Training Set_ (model tidak curang mengintip data validasi).
2. **Menjelaskan Alasan Ilmiah Mengapa Skor Validasi `99,91%` (1.133/1.134 benar):** Kamu bisa menunjuk langsung ID barisnya (`70b51366-...`), menjelaskan konsep _split threshold_ pohon keputusan di antara `180` dan `183` menit, dan menjelaskan kenapa `#2 duration_over_limit` memiliki _feature importance_ `0` (karena pohon sudah membelah di `#1 duration_minutes`).
3. **Membenarkan Arsitektur _Hybrid_ (Model ML + _Guardrail_):** Membuktikan secara empiris mengapa di sistem finansial/penggajian nyata, model _Machine Learning_ harus didampingi _Guardrail_ deterministik di FastAPI agar kesalahan 1 menit di garis batas tidak pernah meloloskan data ke rekap gaji.
