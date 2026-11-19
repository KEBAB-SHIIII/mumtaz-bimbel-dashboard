import type {
  AnomalyCandidate,
  AnomalyDetectionConfig,
  AnomalySessionSnapshot,
} from '../../integrations/anomaly/types.js';

/**
 * Rentang hari di sekitar `lesson_date` (+-30 hari) untuk mencari sesi pembanding.
 * Diselaraskan dengan perhitungan 12 fitur perbandingan & statistik 30 hari pada model ML FastAPI
 * (seperti `tutor_sessions_30d`, `student_sessions_30d`, `duration_diff_from_tutor_mean_30d`).
 */
export const COMPARISON_WINDOW_DAYS = 30;

/**
 * Batas maksimal sesi pembanding yang dikirim ke detektor (FastAPI).
 * Dinaikkan dari 30 ke 500 agar statistik 30 hari tutor/siswa dan deteksi bentrok/duplikat
 * tetap akurat tanpa membebani payload HTTP.
 */
export const MAX_COMPARISONS = 500;

const sameSubjects = (a: AnomalySessionSnapshot, b: AnomalySessionSnapshot) =>
  a.subject_ids.length === b.subject_ids.length && a.subject_ids.every((id, index) => id === b.subject_ids[index]);

/**
 * Urutan kronologis submit (`submitted_at` lebih awal, dengan `id` sebagai tie-breaker).
 * Digunakan untuk memastikan hanya sesi yang di-submit lebih dulu dari `target` yang dijadikan pembanding.
 */
const byEarliest = (a: AnomalySessionSnapshot, b: AnomalySessionSnapshot) =>
  a.submitted_at.localeCompare(b.submitted_at) || a.id.localeCompare(b.id);

/**
 * Rule engine deterministik (hanya untuk `FakeAnomalyDetector` di test).
 * FastAPI ML menghitung sendiri ke-19 fitur langsung dari `target` dan `comparisons`,
 * sehingga tidak bergantung pada `generateCandidates`.
 */
export function generateCandidates(
  target: AnomalySessionSnapshot,
  pool: readonly AnomalySessionSnapshot[],
  config: AnomalyDetectionConfig,
): AnomalyCandidate[] {
  const earlier = pool.filter((other) => other.id !== target.id && byEarliest(other, target) < 0).sort(byEarliest);
  const candidates: AnomalyCandidate[] = [];

  const exact = earlier.find(
    (other) =>
      other.tutor_id === target.tutor_id &&
      other.student_id === target.student_id &&
      sameSubjects(other, target) &&
      other.lesson_date === target.lesson_date &&
      other.duration_minutes === target.duration_minutes &&
      target.start_time !== null && other.start_time === target.start_time &&
      target.end_time != null && other.end_time === target.end_time &&
      target.learning_material !== undefined && other.learning_material === target.learning_material &&
      other.learning_notes === target.learning_notes &&
      other.next_focus === target.next_focus,
  );
  if (exact) {
    candidates.push({
      finding_type: 'suspected_duplicate',
      signal: 'same_tutor_student_subject_date_duration',
      related_lesson_session_id: exact.id,
      default_severity: 'medium',
    });
  }

  if (target.duration_minutes > config.durationOutlierMinutes) {
    candidates.push({
      finding_type: 'duration_outlier',
      signal: 'duration_above_threshold',
      related_lesson_session_id: null,
      default_severity: 'low',
    });
  }

  if (target.start_time !== null && target.start_time >= config.lateStartAfter) {
    candidates.push({
      finding_type: 'late_start',
      signal: 'start_after_threshold',
      related_lesson_session_id: null,
      default_severity: 'low',
    });
  }

  return candidates;
}

/**
 * Menyaring dan mengurutkan sesi pembanding dari `pool` untuk dikirim ke FastAPI/detektor:
 * 1. Hanya ambil sesi selain `target` yang di-submit LEBIH AWAL (`byEarliest(s, target) < 0`).
 *    Tujuannya sama persis dengan pembuatan fitur CSV pelatihan model ML: sesi pertama sah,
 *    sedangkan sesi duplikat/bentrok yang di-submit belakangan yang ditandai anomali.
 * 2. Prioritaskan sesi yang terkait kandidat, lalu yang tanggalnya paling dekat dengan `target`.
 * 3. Batasi maksimal `MAX_COMPARISONS` (500 sesi).
 */
export function selectComparisons(
  target: AnomalySessionSnapshot,
  pool: readonly AnomalySessionSnapshot[],
  candidates: readonly AnomalyCandidate[] = [],
): AnomalySessionSnapshot[] {
  const related = new Set(candidates.map((c) => c.related_lesson_session_id).filter(Boolean));
  const distance = (s: AnomalySessionSnapshot) => Math.abs(Date.parse(s.lesson_date) - Date.parse(target.lesson_date));
  return pool
    .filter((s) => s.id !== target.id && byEarliest(s, target) < 0)
    .sort((a, b) => Number(related.has(b.id)) - Number(related.has(a.id)) || distance(a) - distance(b) || a.id.localeCompare(b.id))
    .slice(0, MAX_COMPARISONS);
}
