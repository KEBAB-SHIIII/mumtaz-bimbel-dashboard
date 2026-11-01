import type { AnomalyFindingCandidate } from '@mumtaz/contracts';
import { FAKE_DETECTOR_PROVIDER } from '@mumtaz/contracts/fixtures';
import type { AnomalyDetection, AnomalyDetectionInput, AnomalyDetector } from '../../src/integrations/anomaly/types.js';

type Mode = 'confirm_all' | 'dismiss_all' | 'error' | 'hang' | 'invalid_output';

/**
 * FAKE deterministic anomaly classifier — test double, BUKAN hasil AI live.
 * Mode:
 * - `confirm_all`: setiap kandidat menjadi finding (`is_anomaly=true`, severity default); validitas
 *   deterministik: duplikat persis → Ditolak, kandidat lain → Perlu revisi;
 * - `dismiss_all`: semua kandidat dinilai bukan anomali → Valid;
 * - `error` / `hang` / `invalid_output`: mensimulasikan kegagalan provider.
 */
export class FakeAnomalyDetector implements AnomalyDetector {
  readonly provider = FAKE_DETECTOR_PROVIDER;
  readonly model = null;
  readonly calls: AnomalyDetectionInput[] = [];

  constructor(private readonly mode: Mode = 'confirm_all') {}

  async detect(input: AnomalyDetectionInput, { signal }: { signal: AbortSignal }): Promise<AnomalyDetection> {
    this.calls.push(input);
    switch (this.mode) {
      case 'error':
        throw new Error('Simulasi kegagalan provider anomali');
      case 'hang':
        return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
      case 'invalid_output':
        return { findings: [{ lesson_session_id: 'bukan-uuid' } as unknown as AnomalyFindingCandidate], validity: 'valid', validity_reason: 'x' };
      default: {
        const confirm = this.mode === 'confirm_all';
        const findings = input.candidates.map((candidate): AnomalyFindingCandidate => ({
          lesson_session_id: input.target.id,
          related_lesson_session_id: candidate.related_lesson_session_id,
          is_anomaly: confirm,
          finding_type: candidate.finding_type,
          severity: candidate.default_severity,
          reason: `FAKE: kandidat ${candidate.signal}`,
          evidence_summary: 'FAKE: hasil test double, bukan AI live.',
          suggested_action: 'review',
        }));
        const duplicate = input.candidates.some((c) => c.signal === 'same_tutor_student_subject_date_duration');
        const validity = !confirm ? 'valid' : duplicate ? 'rejected' : 'needs_revision';
        return { findings, validity, validity_reason: `FAKE: validitas ${validity} dari test double.` };
      }
    }
  }
}
