import type { AnomalyFindingCandidate, FindingSeverity, FindingType } from '@mumtaz/contracts';

/**
 * Port detektor anomali (docs/05 §6). Input sengaja pseudonymous: hanya ID
 * internal & atribut terstruktur sesi — tidak ada nama, kontak, materi/catatan,
 * maupun kode akses. Detektor TIDAK PERNAH mengubah status sesi atau honor.
 */
export interface AnomalySessionSnapshot {
  id: string;
  assignment_id: string;
  tutor_id: string;
  student_id: string;
  subject_id: string;
  lesson_date: string;
  duration_minutes: number;
  submitted_at: string;
}

/** Sinyal deterministik yang membuat sebuah kandidat diperiksa. */
export type CandidateSignal =
  | 'same_assignment_date_duration'
  | 'same_student_subject_date'
  | 'duration_above_threshold';

/** Kandidat terstruktur dari rule engine; detektor mengklasifikasikannya. */
export interface AnomalyCandidate {
  finding_type: FindingType;
  signal: CandidateSignal;
  related_lesson_session_id: string | null;
  default_severity: FindingSeverity;
}

export interface AnomalyDetectionConfig {
  /** `ANOMALY_DURATION_OUTLIER_MINUTES` — heuristik demo, bukan aturan UMKM (O-03/O-12). */
  durationOutlierMinutes: number;
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
   * Mengembalikan finding ternormalisasi. Melempar bila provider gagal (timeout,
   * quota, output invalid); service memetakan ke `anomaly_analysis_status='failed'`.
   */
  detect(input: AnomalyDetectionInput, options: { signal: AbortSignal }): Promise<AnomalyFindingCandidate[]>;
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
