import type { AnomalyFindingCandidate, FindingSeverity, FindingType, SessionValidity } from '@mumtaz/contracts';

/**
 * Port detektor anomali (docs/05 §6). Input sengaja pseudonymous: hanya ID
 * internal & atribut terstruktur sesi — tidak ada nama, kontak, materi/catatan,
 * maupun kode akses. Detektor memberi label validitas (revisi PM, baseline LLM);
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
  duration_minutes: number;
  submitted_at: string;
}

/** Sinyal deterministik yang membuat sebuah kandidat diperiksa. */
export type CandidateSignal =
  | 'same_tutor_student_subject_date_duration'
  | 'same_student_subject_date'
  | 'duration_above_threshold'
  | 'start_after_threshold';

/** Kandidat terstruktur dari rule engine; detektor mengklasifikasikannya. */
export interface AnomalyCandidate {
  finding_type: FindingType;
  signal: CandidateSignal;
  related_lesson_session_id: string | null;
  default_severity: FindingSeverity;
}

export interface AnomalyDetectionConfig {
  /** `ANOMALY_DURATION_OUTLIER_MINUTES` — durasi di atas ini Perlu revisi (revisi PM: > 180 menit). */
  durationOutlierMinutes: number;
  /** Les yang dimulai SETELAH jam ini Perlu revisi (revisi PM: di atas 21.00). */
  lateStartAfter: string;
}

export interface AnomalyDetectionInput {
  target: AnomalySessionSnapshot;
  /** Sesi pembanding yang dipilih candidate generator (bukan seluruh histori). */
  comparisons: readonly AnomalySessionSnapshot[];
  candidates: readonly AnomalyCandidate[];
  config: AnomalyDetectionConfig;
}

export interface AnomalyDetector {
  /** Disimpan ke `anomaly_flags.provider`; fake harus berlabel jelas. */
  readonly provider: string;
  readonly model: string | null;
  /**
   * Mengembalikan finding ternormalisasi + label validitas. Melempar bila provider gagal (timeout,
   * quota, output invalid); service memetakan ke `anomaly_analysis_status='failed'` dan sesi tetap
   * menunggu validasi (Admin dapat menetapkan manual).
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
