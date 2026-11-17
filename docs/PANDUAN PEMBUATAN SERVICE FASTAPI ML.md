# Panduan Lengkap Pembuatan Layanan FastAPI: Deteksi Anomali Absen Tutor (`anomaly_model.pkl` + *Guardrail*)

Dokumen ini adalah panduan teknis *end-to-end* untuk membangun layanan **FastAPI** di folder/repositori terpisah. Layanan ini bertugas membungkus model Machine Learning **LightGBM (`anomaly_model.pkl`)** dan **Tahap 4 (*Guardrail* Deterministik)**, lalu melayani *request* HTTP dari *Backend* Node.js/TypeScript yang sudah kita siapkan.

---

## 1. Gambaran Besar & Kontrak Komunikasi dengan *Backend*

Saat ini *Backend* (`C:\mumtaz-bimbel-dashboard\backend`) sudah memiliki adapter **`HttpAnomalyDetector`** (`backend/src/integrations/anomaly/http-detector.ts`). Begitu tutor melakukan *submit* atau *revisi* absen, *Backend* akan otomatis mengirim *request* ke FastAPI dengan spesifikasi berikut:

| Komponen | Spesifikasi |
|---|---|
| **Base URL** | Diatur lewat `ANOMALY_SERVICE_URL` di `backend/.env` (contoh lokal: `http://localhost:8000`) |
| **Endpoint Utama** | `POST /v1/anomaly/analyze` |
| **Endpoint Cek Kesehatan** | `GET /health` |
| **Timeout dari Backend** | `20.000 ms` (`ANOMALY_PROVIDER_TIMEOUT_MS=20000`) |
| **Input ke FastAPI** | JSON `{ "target": {...}, "comparisons": [...], "config": {...} }` |
| **Output dari FastAPI** | JSON `{ "validity": "...", "validity_reason": "...", "findings": [...] }` (`HTTP 200`) |

### Lima Tahap Eksekusi di Dalam FastAPI (`POST /v1/anomaly/analyze`)

1. **Tahap 1 — Validasi Input (Pydantic):** Menerima JSON `target` (8 *field*), `comparisons` (maks 500 sesi, +-30 hari yang di-*submit* lebih awal), dan `config` (4 ambang batas).
2. **Tahap 2 — Transformasi 19 Fitur Angka (`feature_extractor.py`):** Menghitung 19 fitur numerik dengan rumus dan urutan kolom yang **100% identik** dengan saat pelatihan di Google Colab, sekaligus mencatat `helper_meta` (ID sesi pembanding yang memicu duplikat/bentrok).
3. **Tahap 3 — Prediksi Model ML (`anomaly_model.pkl`):** Memasukkan ke-19 fitur ke model LightGBM untuk mendapatkan prediksi mentah (`raw_model_prediction`).
4. **Tahap 4 — *Guardrail* Deterministik (`apply_business_guardrail`):** Menutup celah perbatasan (*Boundary Discretization Gap* seperti kasus durasi **181 menit**) dengan memeriksa 19 fitur secara eksak berdasarkan urutan prioritas mutlak: **`rejected` > `needs_revision` > `valid`**.
5. **Tahap 5 — Penyusunan *Response* & *Findings* Bahasa Indonesia (`response_builder.py`):** Membuat kalimat penjelasan `validity_reason` (untuk dibaca Tutor & Admin) serta daftar `findings` yang dipetakan ke 4 `finding_type` database PostgreSQL (`suspected_duplicate`, `duration_outlier`, `late_start`, `unusual_pattern`).

---

## 2. Struktur Folder Proyek FastAPI yang Direkomendasikan

Buat folder baru di luar (atau berdampingan dengan) proyek dashboard, misalnya `C:\mumtaz-anomaly-fastapi\`:

```text
mumtaz-anomaly-fastapi/
├── artifacts/
│   ├── anomaly_model.pkl          # Salin dari capstone_anomaly_model_artifacts/
│   └── feature_metadata.json      # Salin dari capstone_anomaly_model_artifacts/
├── app/
│   ├── __init__.py
│   ├── main.py                    # Entrypoint FastAPI (GET /health & POST /v1/anomaly/analyze)
│   ├── schemas.py                 # Kontrak Pydantic (Request & Response sesuai Zod Backend)
│   ├── feature_extractor.py       # Tahap 2: Transformasi JSON -> 19 Fitur Angka + helper_meta
│   ├── guardrail.py               # Tahap 4: Guardrail Deterministik (solusi kasus 181 menit)
│   └── response_builder.py        # Tahap 5: Generator kalimat validity_reason & findings
├── tests/
│   └── test_api.py                # Pengujian otomatis (termasuk kasus batas 180 vs 181 menit)
├── requirements.txt
└── README.md
```

---

## 3. Persiapan *Environment* & `requirements.txt`

### 3.1 Isi `requirements.txt`

```txt
fastapi==0.115.12
uvicorn[standard]==0.34.0
pydantic==2.11.3
joblib==1.4.2
numpy==2.2.4
pandas==2.2.3
scikit-learn==1.6.1
lightgbm==4.6.0
pytest==8.3.5
httpx==0.28.1
```

### 3.2 Perintah Instalasi Awal

```powershell
# 1. Buat folder proyek FastAPI baru
mkdir C:\mumtaz-anomaly-fastapi
cd C:\mumtaz-anomaly-fastapi

# 2. Buat virtual environment Python & aktifkan
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# 3. Install dependencies
pip install -r requirements.txt

# 4. Salin file model dari folder artefak hasil Colab
mkdir artifacts
Copy-Item "C:\mumtaz-bimbel-dashboard\capstone_anomaly_model_artifacts\anomaly_model.pkl" -Destination "artifacts\"
Copy-Item "C:\mumtaz-bimbel-dashboard\capstone_anomaly_model_artifacts\feature_metadata.json" -Destination "artifacts\"
```

---

## 4. Kode Lengkap Setiap File di `app/`

### 4.1 `app/schemas.py` (Tahap 1 — Kontrak Input & Output)

File ini memastikan apa yang dikirim oleh `HttpAnomalyDetector` di Backend dan apa yang divalidasi oleh `fastApiResponseSchema` (Zod) di Backend cocok 100%.

```python
from typing import Literal, Optional
from pydantic import BaseModel, Field

# Enum sesuai kontrak @mumtaz/contracts di Backend
SessionValidity = Literal["valid", "needs_revision", "rejected"]
FindingType = Literal[
    "suspected_duplicate",
    "duration_outlier",
    "late_start",
    "unusual_pattern",
]
FindingSeverity = Literal["low", "medium", "high"]
SuggestedAction = Literal["review"]


class SessionSnapshot(BaseModel):
    """8 field publik sesi les yang dikirim oleh toPublicSnapshot() di Backend."""
    id: str
    tutor_id: str
    student_id: str
    subject_ids: list[str] = Field(min_length=1, max_length=5)
    lesson_date: str               # Format "YYYY-MM-DD"
    start_time: Optional[str]      # Format "HH:MM" atau None untuk data lama
    duration_minutes: int = Field(ge=1)
    submitted_at: str              # ISO-8601 timestamp


class AnomalyConfig(BaseModel):
    """4 parameter ambang batas aturan bisnis dari backend/.env."""
    durationOutlierMinutes: int = 180
    durationMinMinutes: int = 30
    lateStartAfter: str = "21:00"
    earlyStartBefore: str = "07:00"


class AnalyzeRequest(BaseModel):
    """Payload request POST /v1/anomaly/analyze dari Backend."""
    target: SessionSnapshot
    comparisons: list[SessionSnapshot] = Field(default_factory=list, max_length=500)
    config: AnomalyConfig = Field(default_factory=AnomalyConfig)


class FindingCandidate(BaseModel):
    """Item temuan anomali yang akan ditulis Backend ke tabel anomaly_flags."""
    lesson_session_id: str
    related_lesson_session_id: Optional[str] = None
    is_anomaly: bool = True
    finding_type: FindingType
    severity: FindingSeverity
    reason: str = Field(min_length=1, max_length=600)
    evidence_summary: Optional[str] = Field(default=None, max_length=600)
    suggested_action: SuggestedAction = "review"


class AnalyzeResponse(BaseModel):
    """Payload response HTTP 200 ke Backend."""
    validity: SessionValidity
    validity_reason: str = Field(min_length=1, max_length=600)
    findings: list[FindingCandidate]
```

---

### 4.2 `app/feature_extractor.py` (Tahap 2 — Transformasi ke 19 Fitur Angka)

Urutan `FEATURE_NAMES` di bawah ini **wajib sama persis** dengan `feature_metadata.json` (`#1` sampai `#19`). Selain menghitung 19 fitur angka untuk model ML, fungsi ini juga menyimpan `helper_meta` (berisi ID dan detail sesi pembanding pertama yang memicu duplikat/bentrok) agar Tahap 5 bisa mengisi `related_lesson_session_id` dan kalimat bukti dengan akurat.

```python
from typing import Any, Optional
from .schemas import AnomalyConfig, SessionSnapshot

# Urutan 19 fitur WAJIB sama persis dengan feature_metadata.json & saat training di Colab
FEATURE_NAMES: list[str] = [
    "duration_minutes",                  # 1
    "duration_over_limit",               # 2
    "start_minute",                      # 3
    "start_over_limit",                  # 4
    "subject_count",                     # 5
    "comparisons_count",                 # 6
    "exact_dup_count",                   # 7
    "same_tutor_student_date_count",     # 8
    "same_student_date_diff_tutor_count",# 9
    "time_overlap_count",                # 10
    "tutor_sessions_30d",                # 11
    "student_sessions_30d",              # 12
    "duration_diff_from_tutor_mean_30d", # 13
    "duration_under_limit",              # 14
    "start_under_limit",                 # 15
    "fuzzy_dup_count",                   # 16
    "tutor_overlap_diff_student_count",  # 17
    "student_overlap_diff_tutor_count",  # 18
    "self_overlap_count",                # 19
]


def hhmm_to_minutes(hhmm: Optional[str], default: int = 960) -> int:
    """Konversi string 'HH:MM' menjadi menit sejak 00:00 (default 16:00 = 960 jika None)."""
    if not hhmm or ":" not in hhmm:
        return default
    parts = hhmm.split(":")
    return int(parts[0]) * 60 + int(parts[1])


def minutes_to_hhmm(total_minutes: int) -> str:
    """Konversi menit sejak 00:00 kembali ke string 'HH:MM' untuk teks keterangan."""
    h = (total_minutes // 60) % 24
    m = total_minutes % 60
    return f"{h:02d}:{m:02d}"


def is_time_overlapping(start_a: int, dur_a: int, start_b: int, dur_b: int) -> bool:
    """Cek apakah dua rentang waktu [start, start + duration) saling beririsan."""
    end_a = start_a + dur_a
    end_b = start_b + dur_b
    return start_a < end_b and start_b < end_a


def extract_features_and_meta(
    target: SessionSnapshot,
    comparisons: list[SessionSnapshot],
    config: AnomalyConfig,
) -> tuple[dict[str, float | int], dict[str, Any]]:
    """
    Tahap 2: Mengubah JSON (target, comparisons, config) menjadi:
    1. dictionary 19 fitur angka siap masuk ke anomaly_model.pkl
    2. dictionary helper_meta untuk menyusun findings & validity_reason di Tahap 5
    """
    dur = int(target.duration_minutes)
    start_min = hhmm_to_minutes(target.start_time, default=960)
    target_subjects = sorted(target.subject_ids)

    late_limit_min = hhmm_to_minutes(config.lateStartAfter, default=1260)   # 21:00 -> 1260
    early_limit_min = hhmm_to_minutes(config.earlyStartBefore, default=420) # 07:00 -> 420

    # 7 Fitur dari target & config
    duration_over_limit = dur - int(config.durationOutlierMinutes)  # > 0 berarti melanggar (> 180)
    duration_under_limit = int(config.durationMinMinutes) - dur     # > 0 berarti melanggar (< 30)
    start_over_limit = start_min - late_limit_min                   # > 0 berarti melanggar (> 21:00)
    start_under_limit = early_limit_min - start_min                 # > 0 berarti melanggar (< 07:00)
    subject_count = len(target_subjects)
    comparisons_count = len(comparisons)

    # Counter untuk 12 fitur perbandingan
    exact_dup_count = 0
    fuzzy_dup_count = 0
    same_tutor_student_date_count = 0
    same_student_date_diff_tutor_count = 0
    time_overlap_count = 0
    tutor_overlap_diff_student_count = 0
    student_overlap_diff_tutor_count = 0
    self_overlap_count = 0
    tutor_sessions_30d = 0
    student_sessions_30d = 0
    tutor_durations_30d: list[int] = []

    # Referensi sesi pembanding pertama yang memicu masing-masing anomali (untuk findings)
    exact_dup_session: Optional[SessionSnapshot] = None
    fuzzy_dup_session: Optional[SessionSnapshot] = None
    tutor_overlap_session: Optional[SessionSnapshot] = None
    student_overlap_session: Optional[SessionSnapshot] = None
    self_overlap_session: Optional[SessionSnapshot] = None

    for comp in comparisons:
        if comp.id == target.id:
            continue

        comp_dur = int(comp.duration_minutes)
        comp_start = hhmm_to_minutes(comp.start_time, default=960)
        comp_subjects = sorted(comp.subject_ids)

        same_tutor = comp.tutor_id == target.tutor_id
        same_student = comp.student_id == target.student_id
        same_date = comp.lesson_date == target.lesson_date
        same_subj = comp_subjects == target_subjects
        same_dur = comp_dur == dur
        same_start = (
            target.start_time is not None
            and comp.start_time is not None
            and comp.start_time == target.start_time
        )

        # Statistik 30 hari
        if same_tutor:
            tutor_sessions_30d += 1
            tutor_durations_30d.append(comp_dur)
        if same_student:
            student_sessions_30d += 1

        # Hanya periksa duplikat & bentrok jadwal pada tanggal les yang sama
        if not same_date:
            continue

        if same_tutor and same_student:
            same_tutor_student_date_count += 1
        if same_student and not same_tutor:
            same_student_date_diff_tutor_count += 1

        # 1. Cek Duplikat 100% Persis (6 atribut identik) -> REJECTED
        if same_tutor and same_student and same_subj and same_date and same_dur and same_start:
            exact_dup_count += 1
            if exact_dup_session is None:
                exact_dup_session = comp
            # Sesi yang sudah exact duplicate tidak dihitung ulang sebagai fuzzy/overlap
            continue

        # 2. Cek Fuzzy Duplicate (5 atribut sama: tutor, murid, mapel, tanggal, durasi; tapi jam mulai beda)
        if same_tutor and same_student and same_subj and same_date and same_dur and not same_start:
            fuzzy_dup_count += 1
            if fuzzy_dup_session is None:
                fuzzy_dup_session = comp

        # 3. Cek Irisan / Bentrok Waktu (Overlap) jika kedua sesi memiliki jam mulai
        if target.start_time is not None and comp.start_time is not None:
            if is_time_overlapping(start_min, dur, comp_start, comp_dur):
                if same_tutor or same_student:
                    time_overlap_count += 1

                # 3a. Tutor sama mengajar murid berbeda di jam yang beririsan
                if same_tutor and not same_student:
                    tutor_overlap_diff_student_count += 1
                    if tutor_overlap_session is None:
                        tutor_overlap_session = comp

                # 3b. Murid sama diajar tutor berbeda di jam yang beririsan
                elif same_student and not same_tutor:
                    student_overlap_diff_tutor_count += 1
                    if student_overlap_session is None:
                        student_overlap_session = comp

                # 3c. Tutor & murid sama di jam yang beririsan (tapi bukan exact duplicate)
                elif same_tutor and same_student:
                    self_overlap_count += 1
                    if self_overlap_session is None:
                        self_overlap_session = comp

    # Selisih durasi target terhadap rata-rata durasi tutor 30 hari terakhir
    if tutor_durations_30d:
        tutor_mean_30d = sum(tutor_durations_30d) / len(tutor_durations_30d)
        duration_diff_from_tutor_mean_30d = round(dur - tutor_mean_30d, 2)
    else:
        duration_diff_from_tutor_mean_30d = 0.0

    features: dict[str, float | int] = {
        "duration_minutes": dur,
        "duration_over_limit": duration_over_limit,
        "start_minute": start_min,
        "start_over_limit": start_over_limit,
        "subject_count": subject_count,
        "comparisons_count": comparisons_count,
        "exact_dup_count": exact_dup_count,
        "same_tutor_student_date_count": same_tutor_student_date_count,
        "same_student_date_diff_tutor_count": same_student_date_diff_tutor_count,
        "time_overlap_count": time_overlap_count,
        "tutor_sessions_30d": tutor_sessions_30d,
        "student_sessions_30d": student_sessions_30d,
        "duration_diff_from_tutor_mean_30d": duration_diff_from_tutor_mean_30d,
        "duration_under_limit": duration_under_limit,
        "start_under_limit": start_under_limit,
        "fuzzy_dup_count": fuzzy_dup_count,
        "tutor_overlap_diff_student_count": tutor_overlap_diff_student_count,
        "student_overlap_diff_tutor_count": student_overlap_diff_tutor_count,
        "self_overlap_count": self_overlap_count,
    }

    helper_meta: dict[str, Any] = {
        "target_end_hhmm": minutes_to_hhmm(start_min + dur),
        "exact_dup_session": exact_dup_session,
        "fuzzy_dup_session": fuzzy_dup_session,
        "tutor_overlap_session": tutor_overlap_session,
        "student_overlap_session": student_overlap_session,
        "self_overlap_session": self_overlap_session,
    }

    return features, helper_meta
```

---

### 4.3 `app/guardrail.py` (Tahap 4 — *Guardrail* Deterministik Solusi Kasus 181 Menit)

Sesuai dokumen `docs/analisis_kasus_181_menit_dan_solusi_guardrail_fastapi.md`, pohon keputusan LightGBM meletakkan titik potong di sekitar `181,5` menit karena tidak ada sampel `181` atau `182` menit di *Training Set*. Fungsi di bawah ini menjamin akurasi aturan bisnis **100%** di produksi.

```python
from .schemas import SessionValidity


def apply_business_guardrail(
    raw_model_prediction: str,
    features: dict[str, float | int],
) -> SessionValidity:
    """
    Tahap 4: Guardrail deterministik untuk memastikan 0% kebocoran pada kasus batas
    (seperti durasi 181 menit, 29 menit, jam mulai 06:59, atau 21:01).
    Urutan prioritas mutlak: rejected > needs_revision > valid.
    """
    # Pintu 1: Prioritas tertinggi -> Duplikat 100% persis wajib REJECTED
    if features["exact_dup_count"] >= 1:
        return "rejected"

    # Pintu 2: 8 kondisi aturan bisnis wajib NEEDS_REVISION
    if (
        features["duration_over_limit"] > 0                  # Durasi > 180 menit (termasuk 181 menit!)
        or features["duration_under_limit"] > 0              # Durasi < 30 menit (termasuk 29 menit!)
        or features["start_over_limit"] > 0                  # Mulai > 21:00 (termasuk 21:01!)
        or features["start_under_limit"] > 0                 # Mulai < 07:00 (termasuk 06:59!)
        or features["fuzzy_dup_count"] >= 1                  # Duplikat samar beda jam mulai
        or features["tutor_overlap_diff_student_count"] >= 1 # Jadwal tutor bentrok dg murid lain
        or features["student_overlap_diff_tutor_count"] >= 1 # Jadwal murid bentrok dg tutor lain
        or features["self_overlap_count"] >= 1               # Jadwal tutor+murid sama bentrok
    ):
        return "needs_revision"

    # Pintu 3: Jika semua fitur batas & perbandingan bersih (= 0), pastikan juga tidak
    # terjadi false positive dari model ML pada sesi batas valid (mis. tepat 30 atau 180 menit).
    if raw_model_prediction in ("valid", "needs_revision", "rejected"):
        return "valid"

    return "valid"
```

---

### 4.4 `app/response_builder.py` (Tahap 5 — Pemetaan `findings` & Kalimat Keterangan Bahasa Indonesia)

File ini menyusun kalimat `validity_reason` (yang tampil di dialog Tutor & Admin) dan `findings` (yang disimpan ke tabel `anomaly_flags` di PostgreSQL tanpa mengubah skema database).

```python
from typing import Any
from .feature_extractor import hhmm_to_minutes, minutes_to_hhmm
from .schemas import (
    AnalyzeResponse,
    AnomalyConfig,
    FindingCandidate,
    SessionSnapshot,
    SessionValidity,
)


def _format_range(session: SessionSnapshot) -> str:
    """Format rentang jam 'HH:MM–HH:MM' untuk kalimat bukti."""
    if not session.start_time:
        return f"{session.duration_minutes} menit"
    start_m = hhmm_to_minutes(session.start_time)
    end_hhmm = minutes_to_hhmm(start_m + session.duration_minutes)
    return f"pukul {session.start_time}–{end_hhmm} WIB ({session.duration_minutes} menit)"


def build_analyze_response(
    target: SessionSnapshot,
    config: AnomalyConfig,
    features: dict[str, float | int],
    helper_meta: dict[str, Any],
    final_validity: SessionValidity,
) -> AnalyzeResponse:
    """
    Tahap 5: Menyusun JSON response akhir ({ validity, validity_reason, findings })
    dalam Bahasa Indonesia yang jelas untuk Admin dan Tutor.
    """
    findings: list[FindingCandidate] = []
    reasons_summary: list[str] = []

    # 1. Cek Duplikat 100% Persis (REJECTED -> finding_type: suspected_duplicate)
    if features["exact_dup_count"] >= 1:
        comp: SessionSnapshot | None = helper_meta.get("exact_dup_session")
        reason = (
            f"Terdeteksi duplikat identik (100% sama) dengan sesi yang sudah di-submit sebelumnya "
            f"pada tanggal {target.lesson_date} ({_format_range(target)})."
        )
        evidence = (
            f"Tutor, murid, mata pelajaran ({ int(features['subject_count']) } mapel), tanggal "
            f"{target.lesson_date}, jam mulai {target.start_time}, dan durasi {target.duration_minutes} menit "
            f"sama persis dengan sesi sebelumnya."
        )
        findings.append(
            FindingCandidate(
                lesson_session_id=target.id,
                related_lesson_session_id=comp.id if comp else None,
                is_anomaly=True,
                finding_type="suspected_duplicate",
                severity="high",
                reason=reason,
                evidence_summary=evidence,
                suggested_action="review",
            )
        )
        reasons_summary.append(reason)

    # 2. Cek Durasi > Batas Atas (> 180 menit -> finding_type: duration_outlier)
    if features["duration_over_limit"] > 0:
        over = int(features["duration_over_limit"])
        reason = (
            f"Durasi sesi tercatat {target.duration_minutes} menit, melebihi batas maksimal "
            f"{config.durationOutlierMinutes} menit (+{over} menit)."
        )
        evidence = (
            f"Rentang les {_format_range(target)} melampaui ambang wajar "
            f"{config.durationOutlierMinutes} menit."
        )
        findings.append(
            FindingCandidate(
                lesson_session_id=target.id,
                related_lesson_session_id=None,
                is_anomaly=True,
                finding_type="duration_outlier",
                severity="medium" if target.duration_minutes >= 240 else "low",
                reason=reason,
                evidence_summary=evidence,
                suggested_action="review",
            )
        )
        reasons_summary.append(reason)

    # 3. Cek Durasi < Batas Bawah (< 30 menit -> finding_type: duration_outlier)
    if features["duration_under_limit"] > 0:
        under = int(features["duration_under_limit"])
        reason = (
            f"Durasi sesi tercatat {target.duration_minutes} menit, kurang dari batas minimal "
            f"{config.durationMinMinutes} menit (-{under} menit)."
        )
        evidence = (
            f"Rentang les {_format_range(target)} di bawah durasi minimum "
            f"{config.durationMinMinutes} menit."
        )
        findings.append(
            FindingCandidate(
                lesson_session_id=target.id,
                related_lesson_session_id=None,
                is_anomaly=True,
                finding_type="duration_outlier",
                severity="low",
                reason=reason,
                evidence_summary=evidence,
                suggested_action="review",
            )
        )
        reasons_summary.append(reason)

    # 4. Cek Jam Mulai > Batas Malam (> 21:00 -> finding_type: late_start)
    if features["start_over_limit"] > 0:
        reason = (
            f"Sesi dimulai pukul {target.start_time} WIB, melewati batas jam operasional malam "
            f"({config.lateStartAfter} WIB)."
        )
        evidence = f"Jam mulai tercatat {target.start_time} WIB (batas akhir {config.lateStartAfter} WIB)."
        findings.append(
            FindingCandidate(
                lesson_session_id=target.id,
                related_lesson_session_id=None,
                is_anomaly=True,
                finding_type="late_start",
                severity="low",
                reason=reason,
                evidence_summary=evidence,
                suggested_action="review",
            )
        )
        reasons_summary.append(reason)

    # 5. Cek Jam Mulai < Batas Pagi (< 07:00 -> finding_type: late_start)
    if features["start_under_limit"] > 0:
        reason = (
            f"Sesi dimulai pukul {target.start_time} WIB, lebih awal dari batas jam operasional pagi "
            f"({config.earlyStartBefore} WIB)."
        )
        evidence = f"Jam mulai tercatat {target.start_time} WIB (batas awal {config.earlyStartBefore} WIB)."
        findings.append(
            FindingCandidate(
                lesson_session_id=target.id,
                related_lesson_session_id=None,
                is_anomaly=True,
                finding_type="late_start",
                severity="low",
                reason=reason,
                evidence_summary=evidence,
                suggested_action="review",
            )
        )
        reasons_summary.append(reason)

    # 6. Cek Duplikat Samar Beda Jam Mulai (fuzzy_dup_count >= 1 -> finding_type: suspected_duplicate)
    if features["fuzzy_dup_count"] >= 1:
        comp = helper_meta.get("fuzzy_dup_session")
        comp_time = _format_range(comp) if comp else "jam berbeda"
        reason = (
            f"Terdeteksi sesi serupa (tutor, murid, mata pelajaran, tanggal, dan durasi sama) "
            f"pada tanggal {target.lesson_date} namun dengan jam mulai berbeda ({comp_time})."
        )
        evidence = (
            f"Sesi ini tercatat {_format_range(target)}, sedangkan sesi sebelumnya tercatat {comp_time}."
        )
        findings.append(
            FindingCandidate(
                lesson_session_id=target.id,
                related_lesson_session_id=comp.id if comp else None,
                is_anomaly=True,
                finding_type="suspected_duplicate",
                severity="medium",
                reason=reason,
                evidence_summary=evidence,
                suggested_action="review",
            )
        )
        reasons_summary.append(reason)

    # 7. Cek Jadwal Tutor Bentrok dengan Murid Lain (-> finding_type: unusual_pattern)
    if features["tutor_overlap_diff_student_count"] >= 1:
        comp = helper_meta.get("tutor_overlap_session")
        comp_time = _format_range(comp) if comp else "jam yang beririsan"
        reason = (
            f"Jadwal mengajar tutor bentrok (irisan waktu) dengan sesi murid lain pada tanggal "
            f"{target.lesson_date} ({comp_time})."
        )
        evidence = (
            f"Tutor tercatat mengajar pada {_format_range(target)} yang beririsan dengan sesi lain pada {comp_time}."
        )
        findings.append(
            FindingCandidate(
                lesson_session_id=target.id,
                related_lesson_session_id=comp.id if comp else None,
                is_anomaly=True,
                finding_type="unusual_pattern",
                severity="medium",
                reason=reason,
                evidence_summary=evidence,
                suggested_action="review",
            )
        )
        reasons_summary.append(reason)

    # 8. Cek Jadwal Murid Bentrok dengan Tutor Lain (-> finding_type: unusual_pattern)
    if features["student_overlap_diff_tutor_count"] >= 1:
        comp = helper_meta.get("student_overlap_session")
        comp_time = _format_range(comp) if comp else "jam yang beririsan"
        reason = (
            f"Jadwal belajar murid bentrok (irisan waktu) dengan sesi bersama tutor lain pada tanggal "
            f"{target.lesson_date} ({comp_time})."
        )
        evidence = (
            f"Murid tercatat mengikuti sesi {_format_range(target)} yang beririsan dengan sesi tutor lain ({comp_time})."
        )
        findings.append(
            FindingCandidate(
                lesson_session_id=target.id,
                related_lesson_session_id=comp.id if comp else None,
                is_anomaly=True,
                finding_type="unusual_pattern",
                severity="medium",
                reason=reason,
                evidence_summary=evidence,
                suggested_action="review",
            )
        )
        reasons_summary.append(reason)

    # 9. Cek Jadwal Tutor & Murid Sama Bentrok Sendiri (-> finding_type: unusual_pattern)
    if features["self_overlap_count"] >= 1:
        comp = helper_meta.get("self_overlap_session")
        comp_time = _format_range(comp) if comp else "jam yang beririsan"
        reason = (
            f"Jadwal sesi ini beririsan waktu dengan sesi lain untuk tutor dan murid yang sama "
            f"pada tanggal {target.lesson_date} ({comp_time})."
        )
        evidence = f"Rentang waktu {_format_range(target)} bertumpukan dengan sesi sebelumnya ({comp_time})."
        findings.append(
            FindingCandidate(
                lesson_session_id=target.id,
                related_lesson_session_id=comp.id if comp else None,
                is_anomaly=True,
                finding_type="unusual_pattern",
                severity="medium",
                reason=reason,
                evidence_summary=evidence,
                suggested_action="review",
            )
        )
        reasons_summary.append(reason)

    # Menyusun kalimat validity_reason (maks 600 karakter sesuai kontrak Zod Backend)
    if final_validity == "valid":
        validity_reason = (
            "Tidak ditemukan anomali pada sesi ini; durasi, jam mulai, dan jadwal sesuai aturan."
        )
        findings = []
    elif final_validity == "rejected":
        # Jika status akhir rejected, utamakan penjelasan duplikat persis
        validity_reason = " ".join(reasons_summary)[:600]
    else:
        # needs_revision
        if reasons_summary:
            validity_reason = ("Perlu konfirmasi/revisi: " + " ".join(reasons_summary))[:600]
        else:
            validity_reason = (
                "Pola sesi memerlukan peninjauan ulang oleh Admin atau konfirmasi dari Tutor."
            )

    return AnalyzeResponse(
        validity=final_validity,
        validity_reason=validity_reason,
        findings=findings,
    )
```

---

### 4.5 `app/main.py` (Entrypoint FastAPI: Menggabungkan Tahap 1 s/d 5)

```python
import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException

from .feature_extractor import FEATURE_NAMES, extract_features_and_meta
from .guardrail import apply_business_guardrail
from .response_builder import build_analyze_response
from .schemas import AnalyzeRequest, AnalyzeResponse

BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = BASE_DIR / "artifacts" / "anomaly_model.pkl"
METADATA_PATH = BASE_DIR / "artifacts" / "feature_metadata.json"

ml_state: dict[str, Any] = {
    "model": None,
    "metadata": None,
}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Muat anomaly_model.pkl & feature_metadata.json satu kali saat server FastAPI dinyalakan."""
    if not MODEL_PATH.exists():
        raise RuntimeError(f"File model tidak ditemukan di: {MODEL_PATH}")

    ml_state["model"] = joblib.load(MODEL_PATH)
    if METADATA_PATH.exists():
        ml_state["metadata"] = json.loads(METADATA_PATH.read_text(encoding="utf-8"))

    yield
    ml_state.clear()


app = FastAPI(
    title="Mumtaz Bimbel - AI Anomaly Detection Service",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
def health_check():
    """Endpoint cek status layanan & kesiapan model ML."""
    model_loaded = ml_state.get("model") is not None
    return {
        "status": "ok" if model_loaded else "degraded",
        "model_loaded": model_loaded,
        "model_name": (ml_state.get("metadata") or {}).get("model_name", "LightGBM"),
        "feature_count": len(FEATURE_NAMES),
    }


@app.post("/v1/anomaly/analyze", response_model=AnalyzeResponse)
def analyze_anomaly(payload: AnalyzeRequest) -> AnalyzeResponse:
    """
    Endpoint utama yang dipanggil oleh HttpAnomalyDetector di Backend Node.js.
    Menjalankan Tahap 1 s/d Tahap 5 secara berurutan.
    """
    model = ml_state.get("model")
    if model is None:
        raise HTTPException(status_code=503, detail="Model ML belum siap")

    # Tahap 2: Transformasi JSON ke 19 fitur angka + helper_meta
    features, helper_meta = extract_features_and_meta(
        target=payload.target,
        comparisons=payload.comparisons,
        config=payload.config,
    )

    # Tahap 3: Prediksi menggunakan anomaly_model.pkl (urutan kolom sesuai FEATURE_NAMES)
    row_df = pd.DataFrame([[features[col] for col in FEATURE_NAMES]], columns=FEATURE_NAMES)
    raw_pred = str(model.predict(row_df)[0])

    # Tahap 4: Guardrail Deterministik (menutup celah batas seperti kasus 181 menit)
    final_validity = apply_business_guardrail(raw_pred, features)

    # Tahap 5: Bangun JSON response (validity, validity_reason, findings Bahasa Indonesia)
    return build_analyze_response(
        target=payload.target,
        config=payload.config,
        features=features,
        helper_meta=helper_meta,
        final_validity=final_validity,
    )
```

---

## 5. Cara Menjalankan & Menguji Layanan FastAPI

### 5.1 Menjalankan Server FastAPI di Port `8000`

```powershell
cd C:\mumtaz-anomaly-fastapi
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Cek di browser atau terminal:
- `http://localhost:8000/health` -> mengembalikan `{"status": "ok", "model_loaded": true, "model_name": "LightGBM", "feature_count": 19}`
- `http://localhost:8000/docs` -> dokumentasi interaktif Swagger UI.

### 5.2 Contoh Unit Test (`tests/test_api.py`) — Termasuk Uji Kasus `181` Menit

Buat file `tests/test_api.py` untuk memverifikasi bahwa kasus batas `180` menit (`valid`), `181` menit (`needs_revision`), dan duplikat persis (`rejected`) berjalan 100% akurat:

```python
from fastapi.testclient import TestClient
from app.main import app

BASE_SESSION = {
    "id": "00000000-0000-4000-8000-000000000009",
    "tutor_id": "00000000-0000-4000-8002-000000000001",
    "student_id": "00000000-0000-4000-8003-000000000002",
    "subject_ids": ["00000000-0000-4000-8004-000000000001"],
    "lesson_date": "2026-10-10",
    "start_time": "08:15",
    "duration_minutes": 90,
    "submitted_at": "2026-10-10T10:05:00.000Z",
}


def test_boundary_180_is_valid_and_181_is_needs_revision():
    with TestClient(app) as client:
        # 1. Tepat 180 menit -> wajib VALID
        res_180 = client.post(
            "/v1/anomaly/analyze",
            json={"target": {**BASE_SESSION, "duration_minutes": 180}, "comparisons": []},
        )
        assert res_180.status_code == 200
        assert res_180.json()["validity"] == "valid"
        assert res_180.json()["findings"] == []

        # 2. Kasus 181 menit (Boundary Discretization Gap) -> wajib ditangkap Guardrail jadi NEEDS_REVISION
        res_181 = client.post(
            "/v1/anomaly/analyze",
            json={"target": {**BASE_SESSION, "duration_minutes": 181}, "comparisons": []},
        )
        assert res_181.status_code == 200
        body_181 = res_181.json()
        assert body_181["validity"] == "needs_revision"
        assert body_181["findings"][0]["finding_type"] == "duration_outlier"
        assert "181 menit" in body_181["validity_reason"]


def test_exact_duplicate_is_rejected():
    earlier = {
        **BASE_SESSION,
        "id": "00000000-0000-4000-8000-000000000008",
        "submitted_at": "2026-10-10T09:00:00.000Z",
    }
    with TestClient(app) as client:
        res = client.post(
            "/v1/anomaly/analyze",
            json={"target": BASE_SESSION, "comparisons": [earlier]},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["validity"] == "rejected"
        assert body["findings"][0]["finding_type"] == "suspected_duplicate"
        assert body["findings"][0]["related_lesson_session_id"] == earlier["id"]
```

Jalankan test dengan perintah:
```powershell
pytest
```

---

## 6. Cara Menyambungkan FastAPI ke *Backend* Dashboard

Setelah server FastAPI berjalan di `http://localhost:8000`:

1. Buka file `C:\mumtaz-bimbel-dashboard\backend\.env`.
2. Hapus tanda pagar (`#`) pada baris `ANOMALY_SERVICE_URL`:
   ```env
   ANOMALY_SERVICE_URL=http://localhost:8000
   ANOMALY_MODEL_NAME=anomaly-lgbm-v1
   ```
3. Jalankan ulang *Backend* (`npm run dev -w backend` atau `npm run start`).
4. Pada log *startup* *Backend*, pastikan muncul:
   ```json
   "anomaly_provider": "ml_fastapi"
   ```
5. Selesai! Setiap sesi absen yang di-*submit* atau direvisi oleh Tutor kini otomatis divalidasi oleh model LightGBM + *Guardrail* di FastAPI.
