import type {
  AnomalyCandidate,
  AnomalyDetectionConfig,
  AnomalySessionSnapshot,
} from '../../integrations/anomaly/types.js';

/** Rentang hari di sekitar `lesson_date` untuk mencari sesi pembanding. */
export const COMPARISON_WINDOW_DAYS = 7;
/** Batas jumlah sesi pembanding yang dikirim ke detektor (hemat token & PII minimum). */
export const MAX_COMPARISONS = 30;

const sameSubjects = (a: AnomalySessionSnapshot, b: AnomalySessionSnapshot) =>
  a.subject_ids.length === b.subject_ids.length && a.subject_ids.every((id, index) => id === b.subject_ids[index]);
const sharesSubject = (a: AnomalySessionSnapshot, b: AnomalySessionSnapshot) =>
  a.subject_ids.some((id) => b.subject_ids.includes(id));

const byEarliest = (a: AnomalySessionSnapshot, b: AnomalySessionSnapshot) =>
  a.submitted_at.localeCompare(b.submitted_at) || a.id.localeCompare(b.id);

/**
 * Rule engine deterministik (docs/05 §6): membentuk kandidat terstruktur agar
 * model tidak perlu memproses seluruh histori. Kandidat BUKAN finding final.
 *
 * Duplikasi hanya dibandingkan dengan sesi yang disubmit lebih awal, sehingga
 * sepasang sesi mirip menghasilkan satu kandidat (pada sesi yang lebih baru).
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
      other.duration_minutes === target.duration_minutes,
  );
  if (exact) {
    candidates.push({
      finding_type: 'suspected_duplicate',
      signal: 'same_tutor_student_subject_date_duration',
      related_lesson_session_id: exact.id,
      default_severity: 'medium',
    });
  } else {
    // Murid & mapel (beririsan) sama pada tanggal sama yang dicatat tutor lain.
    const sameStudent = earlier.find(
      (other) =>
        other.tutor_id !== target.tutor_id &&
        other.student_id === target.student_id &&
        sharesSubject(other, target) &&
        other.lesson_date === target.lesson_date,
    );
    if (sameStudent) {
      candidates.push({
        finding_type: 'suspected_duplicate',
        signal: 'same_student_subject_date',
        related_lesson_session_id: sameStudent.id,
        default_severity: 'low',
      });
    }
  }

  if (target.duration_minutes > config.durationOutlierMinutes) {
    candidates.push({
      finding_type: 'duration_outlier',
      signal: 'duration_above_threshold',
      related_lesson_session_id: null,
      default_severity: 'low',
    });
  }

  if (target.start_time !== null && target.start_time > config.lateStartAfter) {
    candidates.push({
      finding_type: 'late_start',
      signal: 'start_after_threshold',
      related_lesson_session_id: null,
      default_severity: 'low',
    });
  }

  return candidates;
}

/** Sesi pembanding yang relevan dipakai detektor: terkait kandidat lebih dulu, lalu terdekat tanggalnya. */
export function selectComparisons(
  target: AnomalySessionSnapshot,
  pool: readonly AnomalySessionSnapshot[],
  candidates: readonly AnomalyCandidate[],
): AnomalySessionSnapshot[] {
  const related = new Set(candidates.map((c) => c.related_lesson_session_id).filter(Boolean));
  const distance = (s: AnomalySessionSnapshot) => Math.abs(Date.parse(s.lesson_date) - Date.parse(target.lesson_date));
  return pool
    .filter((s) => s.id !== target.id)
    .sort((a, b) => Number(related.has(b.id)) - Number(related.has(a.id)) || distance(a) - distance(b) || a.id.localeCompare(b.id))
    .slice(0, MAX_COMPARISONS);
}
