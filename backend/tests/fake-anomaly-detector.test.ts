import { describe, expect, it } from 'vitest';
import { anomalyFindingCandidateSchema, isDateInPeriod } from '@mumtaz/contracts';
import {
  EXPECTED_FAKE_DETECTOR_FINDINGS_2026_10,
  FAKE_DETECTOR_PROVIDER,
  FIXTURE_DURATION_OUTLIER_MINUTES,
  fixtureSessions,
  resolveFixtureSession,
} from '@mumtaz/contracts/fixtures';
import type { AnomalySessionSnapshot } from '../src/integrations/anomaly/types.js';
import { FakeAnomalyDetector } from './fakes/fake-anomaly-detector.js';

const october: AnomalySessionSnapshot[] = fixtureSessions
  .filter((s) => isDateInPeriod(s.lesson_date, '2026-10'))
  .map(resolveFixtureSession)
  .map(({ session, assignment }) => ({
    id: session.id,
    assignment_id: session.assignment_id,
    tutor_id: assignment.tutor_id,
    student_id: assignment.student_id,
    subject_id: assignment.subject_id,
    lesson_date: session.lesson_date,
    duration_minutes: session.duration_minutes,
    submitted_at: session.submitted_at,
  }));

const config = { durationOutlierMinutes: FIXTURE_DURATION_OUTLIER_MINUTES };

function sessionAt(index: number): AnomalySessionSnapshot {
  const session = october.at(index);
  if (!session) throw new Error(`Fixture sesi Oktober indeks ${index} tidak ada`);
  return session;
}

describe('FakeAnomalyDetector (test double deterministik, bukan AI live)', () => {
  it('berlabel provider fake yang jelas', () => {
    const detector = new FakeAnomalyDetector();
    expect(detector.provider).toBe(FAKE_DETECTOR_PROVIDER);
    expect(detector.model).toBeNull();
  });

  it('menghasilkan finding Oktober sesuai expected outcome (pembanding = sesi lebih awal)', async () => {
    const detector = new FakeAnomalyDetector();
    const findings = [];
    for (const target of october) {
      const comparisons = october.filter((other) => other.submitted_at < target.submitted_at);
      findings.push(...(await detector.detect({ target, comparisons, config })));
    }

    for (const finding of findings) {
      expect(anomalyFindingCandidateSchema.safeParse(finding).success).toBe(true);
    }
    expect(
      findings.map(({ lesson_session_id, related_lesson_session_id, finding_type, severity }) => ({
        lesson_session_id, related_lesson_session_id, finding_type, severity,
      })),
    ).toEqual(EXPECTED_FAKE_DETECTOR_FINDINGS_2026_10);
  });

  it('deterministik: input sama → output sama', async () => {
    const detector = new FakeAnomalyDetector();
    const input = { target: sessionAt(-1), comparisons: october, config };
    expect(await detector.detect(input)).toEqual(await detector.detect(input));
  });

  it('input pseudonymous: tidak ada nama/kontak/kode akses yang dikirim ke detektor', async () => {
    const detector = new FakeAnomalyDetector();
    await detector.detect({ target: sessionAt(0), comparisons: october, config });
    const payload = JSON.stringify(detector.calls);
    expect(payload).not.toMatch(/Tutor Demo|Murid Demo|@example\.test|0800000|MUMTAZ-DEMO/);
  });

  it('mode error melempar agar service menandai analisis `failed` tanpa membatalkan sesi', async () => {
    const detector = new FakeAnomalyDetector({ mode: 'error' });
    await expect(detector.detect({ target: sessionAt(0), comparisons: [], config })).rejects.toThrow();
  });
});
