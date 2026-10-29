import type { Period } from '../period.js';
import type { SheetExportRow } from '../sheet-export.js';
import { SESSION_IDS, TUTOR_IDS } from './ids.js';

/**
 * Expected outcomes deterministik — oracle untuk service Phase 06–08.
 * Bukan output Gemini live.
 */

/** Filter periode berbasis `lesson_date` (bukan `submitted_at`). */
export const EXPECTED_SESSION_IDS_BY_PERIOD: Record<Period, string[]> = {
  '2026-09': [SESSION_IDS.s07],
  '2026-10': [
    SESSION_IDS.s01, SESSION_IDS.s02, SESSION_IDS.s03, SESSION_IDS.s04, SESSION_IDS.s05,
    SESSION_IDS.s08, SESSION_IDS.s09, SESSION_IDS.s10, SESSION_IDS.s11,
  ],
  '2026-11': [SESSION_IDS.s06],
  /** Periode kosong → skenario 409 EMPTY_EXPORT_CONFIRMATION_REQUIRED bila tab berisi. */
  '2026-12': [],
};

/**
 * Ekspor Oktober 2026: SEMUA status review (O-08), delapan kolom, urut
 * lesson_date → nama tutor → nama murid → mapel → id sesi; `no` 1..N.
 */
export const EXPECTED_EXPORT_ROWS_2026_10: SheetExportRow[] = [
  [1, 'Tutor Demo A', 'Murid Demo 1', '3 SD', 'Sekolah Demo A', 'Matematika', '01/10/2026', '90 menit'],
  [2, 'Tutor Demo A', 'Murid Demo 2', '5 SD', 'Sekolah Demo B', 'Bahasa Inggris', '03/10/2026', '60 menit'],
  [3, 'Tutor Demo B', 'Murid Demo 3', '2 SMP', 'Sekolah Demo C', 'IPA', '05/10/2026', '90 menit'],
  [4, 'Tutor Demo B', 'Murid Demo 3', '2 SMP', 'Sekolah Demo C', 'IPA', '06/10/2026', '75 menit'],
  [5, 'Tutor Demo A', 'Murid Demo 2', '5 SD', 'Sekolah Demo B', 'Bahasa Inggris', '10/10/2026', '60 menit'],
  [6, 'Tutor Demo A', 'Murid Demo 2', '5 SD', 'Sekolah Demo B', 'Bahasa Inggris', '10/10/2026', '60 menit'],
  [7, 'Tutor Demo B', 'Murid Demo 3', '2 SMP', 'Sekolah Demo C', 'IPA', '10/10/2026', '60 menit'],
  [8, 'Tutor Demo B', 'Murid Demo 3', '2 SMP', 'Sekolah Demo C', 'IPA', '12/10/2026', '240 menit'],
  [9, 'Tutor Demo A', 'Murid Demo 1', '3 SD', 'Sekolah Demo A', 'Matematika', '31/10/2026', '90 menit'],
];

/** Urutan sesi sumber untuk `EXPECTED_EXPORT_ROWS_2026_10` (s08 sebelum s09 via tie-breaker id). */
export const EXPECTED_EXPORT_SESSION_ORDER_2026_10 = [
  SESSION_IDS.s01, SESSION_IDS.s02, SESSION_IDS.s03, SESSION_IDS.s04,
  SESSION_IDS.s08, SESSION_IDS.s09, SESSION_IDS.s11, SESSION_IDS.s10, SESSION_IDS.s05,
];

/** Payroll Oktober 2026: hanya `approved` × tarif snapshot demo Rp50.000. */
export const EXPECTED_PAYROLL_2026_10 = {
  period: '2026-10',
  is_demo_assumption: true,
  total_estimated_amount: '200000',
  tutors: [
    {
      tutor_id: TUTOR_IDS.tutorA,
      tutor_name: 'Tutor Demo A',
      approved_sessions: 3,
      pending_sessions: 2,
      revision_requested_sessions: 0,
      rejected_sessions: 0,
      estimated_amount: '150000',
      approved_session_ids: [SESSION_IDS.s01, SESSION_IDS.s05, SESSION_IDS.s08],
    },
    {
      tutor_id: TUTOR_IDS.tutorB,
      tutor_name: 'Tutor Demo B',
      approved_sessions: 1,
      pending_sessions: 1,
      revision_requested_sessions: 1,
      rejected_sessions: 1,
      estimated_amount: '50000',
      approved_session_ids: [SESSION_IDS.s11],
    },
  ],
} as const;

/** Ambang heuristik demo `ANOMALY_DURATION_OUTLIER_MINUTES` (O-03/O-12 terbuka). */
export const FIXTURE_DURATION_OUTLIER_MINUTES = 180;

/**
 * Hasil fake detector deterministik untuk sesi Oktober bila setiap sesi
 * dibandingkan dengan sesi yang disubmit lebih awal. Selaras dengan
 * `examples/anomaly-response.json`.
 */
export const EXPECTED_FAKE_DETECTOR_FINDINGS_2026_10 = [
  {
    lesson_session_id: SESSION_IDS.s09,
    related_lesson_session_id: SESSION_IDS.s08,
    finding_type: 'suspected_duplicate',
    severity: 'medium',
  },
  {
    lesson_session_id: SESSION_IDS.s10,
    related_lesson_session_id: null,
    finding_type: 'duration_outlier',
    severity: 'low',
  },
] as const;

/** Data yang tidak boleh pernah muncul di response Orang Tua. */
export const PARENT_FORBIDDEN_FIELDS = [
  'admin_note',
  'anomaly_analysis_status',
  'findings',
  'rate_amount_snapshot',
  'rate_type_snapshot',
  'rate_is_demo_snapshot',
  'estimated_amount',
  'access_code',
  'parent_access_code_hash',
  'password_hash',
] as const;
