import type { AnomalyFindingCandidate, FindingSeverity, FindingType, SessionValidity } from '@mumtaz/contracts';

/**
 * Port detektor anomali (docs/05 §6). Input sengaja pseudonymous: hanya ID
 * internal & atribut terstruktur sesi — tidak ada nama, kontak, materi/catatan,
 * maupun kode akses. Detektor memberi label validitas (revisi PM, model ML FastAPI);
 * service yang menulis status sesi, dan Admin selalu dapat mengoreksinya.
 */
export interface AnomalySessionSnapshot {
  id: string;
  tutor_id: string;
  student_id: string;
  /** Mapel sesi, terurut (perbandingan himpunan). */
  subject_ids: string[];
  lesson_date: string;
  /** "HH:MM"; `null` untuk sesi lama tanpa jam. */
  start_time: string | null;
  /** Data isi hanya untuk pencocokan lokal (rule engine/test), tidak dikirim ke FastAPI/model. */
  end_time?: string | null;
  learning_material?: string;
  learning_notes?: string | null;
  next_focus?: string | null;
  duration_minutes: number;
  submitted_at: string;
}

/** Sinyal deterministik yang membuat sebuah kandidat diperiksa (dipakai Fake detector di test). */
export type CandidateSignal =
  | 'same_tutor_student_subject_date_duration'
  | 'same_student_subject_date'
  | 'duration_above_threshold'
  | 'start_after_threshold';

/** Kandidat terstruktur dari rule engine lokal (hanya untuk Fake detector di test). */
export interface AnomalyCandidate {
  finding_type: FindingType;
  signal: CandidateSignal;
  related_lesson_session_id: string | null;
  default_severity: FindingSeverity;
}

/**
 * Konfigurasi ambang batas validasi yang dikirim ke layanan AI (FastAPI).
 * Nilainya berasal dari variabel `.env` agar mudah disesuaikan tanpa mengubah kode.
 */
export interface AnomalyDetectionConfig {
  /** `ANOMALY_DURATION_OUTLIER_MINUTES` — durasi di atas nilai ini (> 180 menit) → `needs_revision`. */
  durationOutlierMinutes: number;
  /** `ANOMALY_DURATION_MIN_MINUTES` — durasi di bawah nilai ini (< 30 menit) → `needs_revision`. */
  durationMinMinutes: number;
  /** `ANOMALY_LATE_START_AFTER` — jam mulai setelah nilai ini (> "21:00" WIB) → `needs_revision`. */
  lateStartAfter: string;
  /** `ANOMALY_EARLY_START_BEFORE` — jam mulai sebelum nilai ini (< "07:00" WIB) → `needs_revision`. */
  earlyStartBefore: string;
}

export interface AnomalyDetectionInput {
  /** Sesi absen terbaru yang sedang dianalisis. */
  target: AnomalySessionSnapshot;
  /**
   * Sesi pembanding +-30 hari (tutor_id sama ATAU student_id sama) yang di-submit
   * lebih awal dari `target` (maksimal 500 sesi). Dipakai FastAPI untuk menghitung
   * 12 fitur perbandingan (duplikat persis, duplikat samar, bentrok jadwal, & statistik 30 hari).
   */
  comparisons: readonly AnomalySessionSnapshot[];
  /**
   * Opsional: hanya dipakai oleh FakeAnomalyDetector di unit test.
   * `HttpAnomalyDetector` (FastAPI ML) tidak mengirim field ini karena model menghitung
   * 19 fitur langsung dari `target`, `comparisons`, dan `config`.
   */
  candidates?: readonly AnomalyCandidate[];
  config: AnomalyDetectionConfig;
}

export interface AnomalyDetector {
  /** Disimpan ke `anomaly_flags.provider` (mis. `'ml_fastapi'` atau fake). */
  readonly provider: string;
  /** Disimpan ke `anomaly_flags.model` (mis. `'anomaly-lgbm-v1'`). */
  readonly model: string | null;
  /**
   * Mengembalikan finding ternormalisasi + label validitas. Melempar bila provider gagal (timeout,
   * error jaringan/HTTP, output invalid); service memetakan ke `anomaly_analysis_status='failed'`
   * dan sesi tetap menunggu validasi (Admin dapat menetapkan manual).
   */
  detect(input: AnomalyDetectionInput, options: { signal: AbortSignal }): Promise<AnomalyDetection>;
}

export interface AnomalyDetection {
  findings: AnomalyFindingCandidate[];
  validity: SessionValidity;
  /** Penjelasan singkat untuk Admin & Tutor (Bahasa Indonesia, tanpa alias). */
  validity_reason: string;
}

/** Error provider dengan pesan aman (tanpa payload/credential). */
export class AnomalyProviderError extends Error {
  constructor(
    message: string,
    readonly reason: 'timeout' | 'request_failed' | 'invalid_output',
  ) {
    super(message);
    this.name = 'AnomalyProviderError';
  }
}
