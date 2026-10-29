import type { AnomalyFindingCandidate } from '@mumtaz/contracts';

/**
 * Port detektor anomali (docs/05 §6). Input sengaja pseudonymous:
 * tidak ada nama, kontak, maupun kode akses — hanya ID internal & atribut sesi.
 * Detektor TIDAK PERNAH mengubah status sesi atau honor.
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

export interface AnomalyDetectionInput {
  target: AnomalySessionSnapshot;
  /** Kandidat pembanding yang sudah disaring candidate generator (Phase 05). */
  comparisons: readonly AnomalySessionSnapshot[];
  config: {
    /** `ANOMALY_DURATION_OUTLIER_MINUTES` — heuristik demo, bukan aturan UMKM. */
    durationOutlierMinutes: number;
  };
}

export interface AnomalyDetector {
  /** Disimpan ke `anomaly_flags.provider`; fake harus berlabel jelas. */
  readonly provider: string;
  readonly model: string | null;
  /**
   * Mengembalikan kandidat finding yang sudah dinormalisasi. Melempar error bila
   * provider gagal; service memetakan ke `anomaly_analysis_status='failed'`.
   */
  detect(input: AnomalyDetectionInput): Promise<AnomalyFindingCandidate[]>;
}
