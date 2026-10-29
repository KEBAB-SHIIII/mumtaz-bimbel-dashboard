import type { AnomalyFindingCandidate } from '@mumtaz/contracts';
import { FAKE_DETECTOR_PROVIDER } from '@mumtaz/contracts/fixtures';
import type { AnomalyDetectionInput, AnomalyDetector } from '../../src/integrations/anomaly/types.js';

/**
 * FAKE deterministic anomaly detector — test double, BUKAN hasil AI live.
 * Aturan:
 * - `suspected_duplicate`: pembanding dengan assignment, tanggal, dan durasi identik
 *   (pembanding pertama menurut `submitted_at`, lalu `id`).
 * - `duration_outlier`: durasi > `durationOutlierMinutes`.
 */
export class FakeAnomalyDetector implements AnomalyDetector {
  readonly provider = FAKE_DETECTOR_PROVIDER;
  readonly model = null;
  readonly calls: AnomalyDetectionInput[] = [];

  private readonly mode: 'ok' | 'error';

  constructor({ mode = 'ok' }: { mode?: 'ok' | 'error' } = {}) {
    this.mode = mode;
  }

  async detect(input: AnomalyDetectionInput): Promise<AnomalyFindingCandidate[]> {
    this.calls.push(input);
    if (this.mode === 'error') {
      throw new Error('Simulasi kegagalan provider anomali');
    }

    const { target, comparisons, config } = input;
    const findings: AnomalyFindingCandidate[] = [];

    const duplicate = comparisons
      .filter(
        (other) =>
          other.id !== target.id &&
          other.assignment_id === target.assignment_id &&
          other.lesson_date === target.lesson_date &&
          other.duration_minutes === target.duration_minutes,
      )
      .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at) || a.id.localeCompare(b.id))[0];

    if (duplicate) {
      findings.push({
        lesson_session_id: target.id,
        related_lesson_session_id: duplicate.id,
        is_anomaly: true,
        finding_type: 'suspected_duplicate',
        severity: 'medium',
        reason: 'Kombinasi assignment, tanggal, dan durasi sama dengan sesi pembanding.',
        evidence_summary: 'FAKE: atribut sesi identik dengan sesi pembanding; belum membuktikan data tidak valid.',
        suggested_action: 'review',
      });
    }

    if (target.duration_minutes > config.durationOutlierMinutes) {
      findings.push({
        lesson_session_id: target.id,
        related_lesson_session_id: null,
        is_anomaly: true,
        finding_type: 'duration_outlier',
        severity: 'low',
        reason: 'Durasi melebihi ambang heuristik demo yang dikonfigurasi.',
        evidence_summary: `FAKE: ${target.duration_minutes} menit > ambang ${config.durationOutlierMinutes} menit.`,
        suggested_action: 'review',
      });
    }

    return findings;
  }
}
