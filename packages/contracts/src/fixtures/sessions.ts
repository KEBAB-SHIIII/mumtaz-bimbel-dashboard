import type { AnomalyAnalysisStatus, AnomalyReviewStatus, FindingSeverity, FindingType, SessionStatus } from '../enums.js';
import { FINDING_IDS, SESSION_IDS, STUDENT_IDS, SUBJECT_IDS, TUTOR_IDS, USER_IDS } from './ids.js';

/** Bentuk baris `lesson_sessions` (docs/14 §3.8). */
export interface FixtureLessonSession {
  id: string;
  client_submission_id: string;
  tutor_id: string;
  student_id: string;
  subject_id: string;
  lesson_date: string;
  duration_minutes: number;
  learning_material: string;
  learning_notes: string | null;
  next_focus: string | null;
  status: SessionStatus;
  anomaly_analysis_status: AnomalyAnalysisStatus;
  rate_amount_snapshot: string | null;
  reviewed_by_user_id: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  updated_at: string;
  admin_note: string | null;
}

/** Kombinasi tutor/murid/mapel yang dipakai sesi fixture. */
const A1 = { tutor_id: TUTOR_IDS.tutorA, student_id: STUDENT_IDS.murid1, subject_id: SUBJECT_IDS.matematika };
const A2 = { tutor_id: TUTOR_IDS.tutorA, student_id: STUDENT_IDS.murid2, subject_id: SUBJECT_IDS.bahasaInggris };
const B3 = { tutor_id: TUTOR_IDS.tutorB, student_id: STUDENT_IDS.murid3, subject_id: SUBJECT_IDS.ipa };

/** Tarif tunggal per sesi (D-24) terkunci saat approve. */
const rateSnapshot = { rate_amount_snapshot: '50000' } as const;

const noSnapshot = { rate_amount_snapshot: null } as const;

const unreviewed = { reviewed_by_user_id: null, reviewed_at: null, admin_note: null } as const;

const submission = (n: number) => `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`;

/**
 * Sesi sintetis lintas status dan periode:
 * - Oktober 2026: s01–s05, s08–s11 (9 sesi, semua status)
 * - s05: lesson_date 31 Okt, disubmit November → tetap periode Oktober
 * - s06: 1 Nov (periode November), s07: 30 Sep (periode September)
 * - s08/s09: kandidat duplikasi; s10: durasi 240 menit (outlier demo)
 */
export const fixtureSessions: FixtureLessonSession[] = [
  {
    id: SESSION_IDS.s01, client_submission_id: submission(1), ...A1,
    lesson_date: '2026-10-01', duration_minutes: 90,
    learning_material: 'Penjumlahan dan pengurangan bilangan dua digit',
    learning_notes: 'Siswa lancar penjumlahan, pengurangan dengan meminjam masih perlu latihan.',
    next_focus: 'Latihan pengurangan dengan meminjam.',
    status: 'approved', anomaly_analysis_status: 'completed', ...rateSnapshot,
    reviewed_by_user_id: USER_IDS.admin, reviewed_at: '2026-10-02T02:00:00Z', admin_note: null,
    submitted_at: '2026-10-01T12:00:00Z', updated_at: '2026-10-02T02:00:00Z',
  },
  {
    id: SESSION_IDS.s02, client_submission_id: submission(2), ...A2,
    lesson_date: '2026-10-03', duration_minutes: 60,
    learning_material: 'Greetings and introductions',
    learning_notes: null, next_focus: null,
    status: 'pending', anomaly_analysis_status: 'not_evaluated', ...noSnapshot, ...unreviewed,
    submitted_at: '2026-10-03T11:00:00Z', updated_at: '2026-10-03T11:00:00Z',
  },
  {
    id: SESSION_IDS.s03, client_submission_id: submission(3), ...B3,
    lesson_date: '2026-10-05', duration_minutes: 90,
    learning_material: 'Sistem pencernaan manusia',
    learning_notes: 'Siswa aktif bertanya.', next_focus: 'Sistem pernapasan.',
    status: 'revision_requested', anomaly_analysis_status: 'completed', ...noSnapshot,
    reviewed_by_user_id: USER_IDS.admin, reviewed_at: '2026-10-06T03:00:00Z',
    admin_note: 'Durasi tidak sesuai jadwal; mohon periksa kembali.',
    submitted_at: '2026-10-05T10:00:00Z', updated_at: '2026-10-06T03:00:00Z',
  },
  {
    id: SESSION_IDS.s04, client_submission_id: submission(4), ...B3,
    lesson_date: '2026-10-06', duration_minutes: 75,
    learning_material: 'Rangka manusia',
    learning_notes: null, next_focus: null,
    status: 'rejected', anomaly_analysis_status: 'failed', ...noSnapshot,
    reviewed_by_user_id: USER_IDS.admin, reviewed_at: '2026-10-07T03:00:00Z',
    admin_note: 'Tidak ada jadwal les pada tanggal tersebut.',
    submitted_at: '2026-10-06T10:00:00Z', updated_at: '2026-10-07T03:00:00Z',
  },
  {
    id: SESSION_IDS.s05, client_submission_id: submission(5), ...A1,
    lesson_date: '2026-10-31', duration_minutes: 90,
    learning_material: 'Perkalian dasar 1–5',
    learning_notes: null, next_focus: 'Perkalian 6–10.',
    status: 'approved', anomaly_analysis_status: 'completed', ...rateSnapshot,
    reviewed_by_user_id: USER_IDS.admin, reviewed_at: '2026-11-03T02:00:00Z', admin_note: null,
    submitted_at: '2026-11-02T03:00:00Z', updated_at: '2026-11-03T02:00:00Z',
  },
  {
    id: SESSION_IDS.s06, client_submission_id: submission(6), ...A1,
    lesson_date: '2026-11-01', duration_minutes: 90,
    learning_material: 'Perkalian 6–10',
    learning_notes: null, next_focus: null,
    status: 'approved', anomaly_analysis_status: 'completed', ...rateSnapshot,
    reviewed_by_user_id: USER_IDS.admin, reviewed_at: '2026-11-03T02:05:00Z', admin_note: null,
    submitted_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-03T02:05:00Z',
  },
  {
    id: SESSION_IDS.s07, client_submission_id: submission(7), ...B3,
    lesson_date: '2026-09-30', duration_minutes: 60,
    learning_material: 'Ciri-ciri makhluk hidup',
    learning_notes: null, next_focus: null,
    status: 'approved', anomaly_analysis_status: 'completed', ...rateSnapshot,
    reviewed_by_user_id: USER_IDS.admin, reviewed_at: '2026-10-01T02:00:00Z', admin_note: null,
    submitted_at: '2026-09-30T10:00:00Z', updated_at: '2026-10-01T02:00:00Z',
  },
  {
    id: SESSION_IDS.s08, client_submission_id: submission(8), ...A2,
    lesson_date: '2026-10-10', duration_minutes: 60,
    learning_material: 'Numbers 1–100',
    learning_notes: null, next_focus: null,
    status: 'approved', anomaly_analysis_status: 'completed', ...rateSnapshot,
    reviewed_by_user_id: USER_IDS.admin, reviewed_at: '2026-10-11T02:00:00Z', admin_note: null,
    submitted_at: '2026-10-10T10:00:00Z', updated_at: '2026-10-11T02:00:00Z',
  },
  {
    id: SESSION_IDS.s09, client_submission_id: submission(9), ...A2,
    lesson_date: '2026-10-10', duration_minutes: 60,
    learning_material: 'Numbers 1–100',
    learning_notes: null, next_focus: null,
    status: 'pending', anomaly_analysis_status: 'completed', ...noSnapshot, ...unreviewed,
    submitted_at: '2026-10-10T10:05:00Z', updated_at: '2026-10-10T10:05:00Z',
  },
  {
    id: SESSION_IDS.s10, client_submission_id: submission(10), ...B3,
    lesson_date: '2026-10-12', duration_minutes: 240,
    learning_material: 'Persiapan ujian tengah semester IPA',
    learning_notes: null, next_focus: null,
    status: 'pending', anomaly_analysis_status: 'completed', ...noSnapshot, ...unreviewed,
    submitted_at: '2026-10-12T10:00:00Z', updated_at: '2026-10-12T10:00:00Z',
  },
  {
    id: SESSION_IDS.s11, client_submission_id: submission(11), ...B3,
    lesson_date: '2026-10-10', duration_minutes: 60,
    learning_material: 'Gaya dan gerak',
    learning_notes: null, next_focus: null,
    status: 'approved', anomaly_analysis_status: 'completed', ...rateSnapshot,
    reviewed_by_user_id: USER_IDS.admin, reviewed_at: '2026-10-11T02:10:00Z', admin_note: null,
    submitted_at: '2026-10-10T12:00:00Z', updated_at: '2026-10-11T02:10:00Z',
  },
];

/** Bentuk baris `anomaly_flags` (docs/14 §3.9). Provider fake berlabel jelas. */
export interface FixtureAnomalyFlag {
  id: string;
  lesson_session_id: string;
  related_lesson_session_id: string | null;
  finding_type: FindingType;
  severity: FindingSeverity;
  reason: string;
  evidence_summary: string | null;
  provider: string | null;
  model: string | null;
  review_status: AnomalyReviewStatus;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

export const FAKE_DETECTOR_PROVIDER = 'fake-deterministic-test-double';

export const fixtureAnomalyFlags: FixtureAnomalyFlag[] = [
  {
    id: FINDING_IDS.duplicateS09, lesson_session_id: SESSION_IDS.s09, related_lesson_session_id: SESSION_IDS.s08,
    finding_type: 'suspected_duplicate', severity: 'medium',
    reason: 'Kombinasi tutor, murid, mapel, tanggal, dan durasi sama dengan sesi pembanding.',
    evidence_summary: 'Sintetis: tutor/murid/mapel/tanggal/durasi identik dengan sesi lebih awal.',
    provider: FAKE_DETECTOR_PROVIDER, model: null,
    review_status: 'pending_review', reviewed_by_user_id: null, reviewed_at: null, review_note: null,
    created_at: '2026-10-10T10:05:30Z',
  },
  {
    id: FINDING_IDS.outlierS10, lesson_session_id: SESSION_IDS.s10, related_lesson_session_id: null,
    finding_type: 'duration_outlier', severity: 'low',
    reason: 'Durasi melebihi ambang heuristik demo.',
    evidence_summary: 'Sintetis: 240 menit > ambang demo 180 menit.',
    provider: FAKE_DETECTOR_PROVIDER, model: null,
    review_status: 'pending_review', reviewed_by_user_id: null, reviewed_at: null, review_note: null,
    created_at: '2026-10-12T10:00:30Z',
  },
  {
    id: FINDING_IDS.falsePositiveS04, lesson_session_id: SESSION_IDS.s04, related_lesson_session_id: null,
    finding_type: 'unusual_pattern', severity: 'low',
    reason: 'Pola jadwal berbeda dari kebiasaan tutor.',
    evidence_summary: null,
    provider: FAKE_DETECTOR_PROVIDER, model: null,
    review_status: 'false_positive', reviewed_by_user_id: USER_IDS.admin, reviewed_at: '2026-10-07T02:55:00Z',
    review_note: 'Jadwal memang dipindah atas permintaan wali.',
    created_at: '2026-10-06T10:00:30Z',
  },
];
