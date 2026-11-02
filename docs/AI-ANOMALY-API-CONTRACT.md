# Acuan integrasi AI anomaly — v1

Dokumen ini menjadi acuan backend dan tim AI untuk mengganti Gemini dengan service AI internal. Struktur input/output mengikuti interface detector yang sudah ada. Endpoint HTTP dan aturan integrasi di bawah adalah target implementasi; service AI internal belum tersedia di project.

## 1. Alur integrasi

```text
Tutor submit sesi
  → Backend memvalidasi dan menyimpan sesi
  → Backend membuat kandidat anomali + memilih sesi pembanding
      → Tidak ada kandidat: analisis completed, sesi valid (AI tidak dipanggil)
      → Ada kandidat: backend memanggil service AI
  → AI mengembalikan findings + validity
  → Backend memvalidasi response
  → Backend menyimpan finding positif dan menerapkan validitas sesi
  → Frontend menampilkan hasil; admin dapat mengoreksi
```

Baseline memakai rule backend untuk menyaring kandidat, lalu AI menilainya. AI dapat menambahkan `unusual_pattern` ketika dipanggil. Jika model harus memeriksa **semua sesi**, backend harus menghapus kondisi yang melewati AI saat kandidat kosong; ini perubahan alur terpisah.

## 2. Endpoint

```http
POST /v1/anomaly/analyze
Content-Type: application/json
```

Satu request menganalisis satu sesi. Response sukses memakai HTTP `200` dan JSON di bagian 4. Pemanggilan dilakukan backend, bukan frontend. AI tidak menulis langsung ke database aplikasi.

## 3. Request backend → AI

```json
{
  "target": {
    "id": "11111111-1111-4111-8111-111111111111",
    "tutor_id": "22222222-2222-4222-8222-222222222222",
    "student_id": "33333333-3333-4333-8333-333333333333",
    "subject_ids": ["44444444-4444-4444-8444-444444444444"],
    "lesson_date": "2026-11-02",
    "start_time": "20:00",
    "duration_minutes": 210,
    "submitted_at": "2026-11-02T16:30:00Z"
  },
  "comparisons": [],
  "candidates": [
    {
      "finding_type": "duration_outlier",
      "signal": "duration_above_threshold",
      "related_lesson_session_id": null,
      "default_severity": "low"
    }
  ],
  "config": {
    "durationOutlierMinutes": 180,
    "lateStartAfter": "21:00"
  }
}
```

| Field | Ketentuan |
|---|---|
| `target` | Sesi yang dianalisis; semua field contoh wajib tersedia |
| `comparisons` | Array sesi dengan struktur sama seperti `target`; boleh kosong |
| `candidates` | Dugaan dari rule backend, bukan temuan final |
| `config` | Ambang yang harus dipakai; jangan hardcode nilai contoh di model |
| ID sesi/tutor/siswa/mapel | UUID internal; pertahankan identitas referensinya |
| `subject_ids` | Array ID mapel terurut; satu sesi dapat memiliki beberapa mapel |
| `lesson_date` | Tanggal lokal `YYYY-MM-DD` |
| `start_time` | Jam lokal `HH:MM`, atau `null` untuk data lama tanpa jam |
| `duration_minutes` | Durasi dalam menit |
| `submitted_at` | Timestamp ISO 8601 dengan zona waktu; contoh memakai UTC |

Untuk integrasi v1, gunakan `Asia/Jakarta` sebagai zona waktu tanggal/jam lokal. Jangan menafsirkan `start_time` sebagai UTC. Input tidak membawa nama, kontak, kode akses, atau catatan bebas.

### Kandidat dari backend

| `finding_type` | `signal` | Kondisi baseline |
|---|---|---|
| `suspected_duplicate` | `same_tutor_student_subject_date_duration` | Tutor, siswa, himpunan mapel, tanggal, dan durasi sama dengan sesi lebih awal |
| `suspected_duplicate` | `same_student_subject_date` | Siswa dan tanggal sama, mapel beririsan, tutor berbeda |
| `duration_outlier` | `duration_above_threshold` | Durasi **lebih dari** `durationOutlierMinutes` |
| `late_start` | `start_after_threshold` | Jam mulai **setelah** `lateStartAfter` |

`related_lesson_session_id` menunjuk sesi dalam `comparisons`, atau `null`. `default_severity` hanya nilai awal; AI menentukan severity hasilnya. Kemiripan sesi dengan tutor berbeda tidak otomatis berarti duplikat.

Backend saat ini mencari pool pembanding dalam ±7 hari untuk tutor atau siswa yang sama, membaca maksimal 200 sesi, lalu mengirim maksimal 30 pembanding. Input ini bukan seluruh histori.

## 4. Response AI → backend

```json
{
  "validity": "needs_revision",
  "validity_reason": "Durasi sesi melebihi ambang dan perlu dikonfirmasi tutor.",
  "findings": [
    {
      "lesson_session_id": "11111111-1111-4111-8111-111111111111",
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

Semua field contoh wajib tersedia; field nullable tetap dikirim sebagai `null`.

| Field | Ketentuan |
|---|---|
| `validity` | `valid`, `needs_revision`, atau `rejected` |
| `validity_reason` | Penjelasan hasil penilaian sesi secara keseluruhan |
| `findings` | Array hasil penilaian; satu sesi dapat memiliki banyak finding |
| `lesson_session_id` | Harus sama dengan `target.id` |
| `related_lesson_session_id` | ID dalam `comparisons`, atau `null`; bukan ID target |
| `is_anomaly` | `true` jika dianggap anomali, `false` jika kandidat dinilai normal |
| `finding_type` | `suspected_duplicate`, `duration_outlier`, `late_start`, `unusual_pattern` |
| `severity` | `low`, `medium`, atau `high`; prioritas review, bukan confidence |
| `reason` | Mengapa kondisi dianggap anomali atau normal; tidak boleh kosong |
| `evidence_summary` | Fakta pendukung dari input, atau `null` jika tidak tersedia |
| `suggested_action` | Isi `review` untuk kompatibilitas baseline; bukan perintah eksekusi otomatis |

Aturan response v1:

- Kembalikan satu hasil untuk setiap kandidat. Cocokkan melalui pasangan `finding_type` dan `related_lesson_session_id`; jangan hilangkan kandidat yang dinilai normal.
- Temuan tambahan memakai `unusual_pattern`, `is_anomaly: true`, maksimal 3 item, dan tidak mengulang kandidat yang sudah dinilai.
- Gunakan Bahasa Indonesia yang netral. `reason`, `evidence_summary`, dan `validity_reason` maksimal 600 karakter per field dan idealnya 1–2 kalimat.
- Bukti harus berasal dari input. Jangan mengarang histori, angka statistik, atau tuduhan kecurangan.
- `severity` tidak otomatis menentukan `validity`. Kriteria severity perlu dikalibrasi bersama tim produk; enum saja belum mendefinisikan tingkat keparahan tiap kasus.

### Penentuan validity

| Nilai | Makna baseline |
|---|---|
| `valid` | Tidak ada masalah yang memerlukan tindakan |
| `needs_revision` | Durasi melewati ambang, jam mulai melewati batas, atau kejanggalan yang perlu konfirmasi |
| `rejected` | Sesi dinilai duplikat dari sesi yang sudah tercatat |

Jika ada duplikat sekaligus masalah durasi/jam, gunakan `rejected` dan tetap sertakan temuan relevan. Hasil finding dan alasan validitas harus konsisten.

### Kandidat dinilai normal

Response tetap HTTP `200`, `validity: "valid"`, dan kandidat dikembalikan dengan `is_anomaly: false`. Backend tidak menyimpan item tersebut ke `anomaly_flags`.

Jika input tidak memiliki kandidat dan AI tidak menemukan masalah, response dapat berupa:

```json
{
  "validity": "valid",
  "validity_reason": "Tidak ditemukan kejanggalan pada data sesi.",
  "findings": []
}
```

Pada alur baseline, backend tidak memanggil AI untuk kasus tanpa kandidat.

## 5. Tanggung jawab backend

1. Adapter HTTP baru mengimplementasikan `AnomalyDetector` sebagai pengganti adapter Gemini.
2. Memvalidasi seluruh response saat runtime, termasuk enum, kelengkapan kandidat, dan referensi sesi. Validasi HTTP baru perlu mencakup `validity` dan `validity_reason`, bukan hanya findings.
3. Menyimpan hanya item `is_anomaly: true` ke `anomaly_flags`.
4. Membuat ID finding, timestamp, dan metadata provider/model dari konfigurasi integrasi tepercaya.
5. Mengelola `review_status` dan seluruh field review admin.
6. Menetapkan status proses analisis pada `lesson_sessions.anomaly_analysis_status`.
7. Menerapkan validitas hanya jika sesi masih `pending`; keputusan admin tidak ditimpa. Hasil untuk data yang telah direvisi saat analisis berjalan dibuang.

`validity: valid` dapat membuat sesi berstatus `approved` dan masuk perhitungan honor/tagihan. Output AI karena itu memengaruhi workflow, bukan hanya tampilan informasi.

AI tidak mengirim ID finding, `created_at`, `review_status`, data reviewer, atau `analysis_status`. `suggested_action` saat ini tidak disimpan ke tabel finding dan tidak dieksekusi otomatis.

## 6. Error dan operasional

Format error HTTP yang ditargetkan untuk service baru:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Field target.duration_minutes tidak valid."
  }
}
```

| Kondisi | HTTP service AI | Hasil di backend |
|---|---|---|
| Analisis berhasil, termasuk tanpa anomali | `200` | `completed` |
| Request tidak valid | `422` | `failed` |
| Service belum siap / tidak tersedia | `503` | `failed` |
| Error internal | `500` | `failed` |
| Timeout atau response invalid | Timeout / dapat berupa `200` dengan JSON invalid | `failed` |
| Provider belum dikonfigurasi | Tidak ada request | `not_evaluated` |

Jangan mengembalikan `valid` atau findings kosong untuk menyamarkan kegagalan analisis. Saat gagal, sesi tetap menunggu validasi dan dapat ditangani admin.

Sebelum integrasi live, kedua tim perlu menetapkan base URL, autentikasi service, batas timeout, kebijakan retry, serta nama/versi model. Nilai tersebut belum ditetapkan oleh dokumen ini. Endpoint analisis tidak boleh memiliki efek samping penulisan DB aplikasi sehingga request ulang aman.

## 7. Checklist handoff

- [ ] Request dan response sesuai contoh serta enum di dokumen ini.
- [ ] Kasus normal, duplikat, durasi panjang, mulai terlambat, dan beberapa temuan telah diuji.
- [ ] Batas tepat 180 menit dan tepat 21.00 tidak memicu rule “lebih dari/setelah”.
- [ ] Kandidat negatif, pembanding kosong, dan jam mulai `null` ditangani.
- [ ] Timeout, error, referensi ID asing, dan response tidak lengkap ditolak dengan benar.
- [ ] Adapter backend, autentikasi, timeout, versi model, dan kriteria severity disepakati.
- [ ] Diputuskan apakah tetap menggunakan penyaringan kandidat atau memanggil AI untuk semua sesi.

## Referensi kode

- [Interface input/output detector](../backend/src/integrations/anomaly/types.ts)
- [Schema finding untuk validasi](../packages/contracts/src/anomaly.ts)
- [Enum dan mapping status sesi](../packages/contracts/src/enums.ts)
- [Rule pembentukan kandidat](../backend/src/services/anomaly/candidates.ts)
- [Alur penyimpanan hasil analisis](../backend/src/services/anomaly/anomaly-service.ts)
- [Adapter Gemini yang akan diganti](../backend/src/integrations/anomaly/gemini-detector.ts)

Raw response Gemini memakai `classifications` dan `additional_findings`, lalu dinormalisasi adapter. Service AI baru mengikuti response `findings` dalam dokumen ini; tidak perlu meniru format khusus Gemini.
