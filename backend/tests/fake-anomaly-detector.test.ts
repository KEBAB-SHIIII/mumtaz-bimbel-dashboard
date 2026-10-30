import { describe, expect, it } from 'vitest';
import { isDateInPeriod } from '@mumtaz/contracts';
import {
  EXPECTED_FAKE_DETECTOR_FINDINGS_2026_10,
  FIXTURE_DURATION_OUTLIER_MINUTES,
  fixtureSessions,
  resolveFixtureSession,
} from '@mumtaz/contracts/fixtures';
import type { AnomalySessionSnapshot } from '../src/integrations/anomaly/types.js';
import { generateCandidates, selectComparisons } from '../src/services/anomaly/candidates.js';
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
const signal = new AbortController().signal;

function sessionAt(index: number): AnomalySessionSnapshot {
  const session = october.at(index);
  if (!session) throw new Error(`Fixture sesi Oktober indeks ${index} tidak ada`);
  return session;
}

describe('candidate generator (rule engine deterministik)', () => {
  it('menghasilkan kandidat Oktober sesuai expected outcome fixture & examples/anomaly-response.json', async () => {
    const detector = new FakeAnomalyDetector();
    const findings = [];
    for (const target of october) {
      const candidates = generateCandidates(target, october, config);
      if (candidates.length === 0) continue;
      findings.push(...(await detector.detect({ target, comparisons: selectComparisons(target, october, candidates), candidates, config }, { signal })));
    }
    expect(
      findings.map(({ lesson_session_id, related_lesson_session_id, finding_type, severity }) => ({
        lesson_session_id, related_lesson_session_id, finding_type, severity,
      })),
    ).toEqual(EXPECTED_FAKE_DETECTOR_FINDINGS_2026_10);
  });

  it('duplikasi hanya terhadap sesi yang disubmit lebih awal (satu kandidat per pasangan)', () => {
    const [first, second] = [sessionAt(0), { ...sessionAt(0), id: '00000000-0000-4000-8000-0000000000aa', submitted_at: '2026-12-01T00:00:00Z' }];
    expect(generateCandidates(first, [first, second], config)).toEqual([]);
    expect(generateCandidates(second, [first, second], config)).toEqual([
      { finding_type: 'suspected_duplicate', signal: 'same_assignment_date_duration', related_lesson_session_id: first.id, default_severity: 'medium' },
    ]);
  });

  it('siswa+mapel+tanggal sama lewat penugasan lain → kandidat duplikasi severity rendah', () => {
    const base = sessionAt(0);
    const other = { ...base, id: '00000000-0000-4000-8000-0000000000ab', assignment_id: '00000000-0000-4000-8005-0000000000ff', tutor_id: 'tutor-lain', submitted_at: '2026-12-01T00:00:00Z' };
    expect(generateCandidates(other, [base, other], config)).toEqual([
      { finding_type: 'suspected_duplicate', signal: 'same_student_subject_date', related_lesson_session_id: base.id, default_severity: 'low' },
    ]);
  });

  it('durasi di atas ambang konfigurasi → kandidat duration_outlier', () => {
    const long = { ...sessionAt(0), duration_minutes: 181 };
    expect(generateCandidates(long, [long], config).map((c) => c.finding_type)).toEqual(['duration_outlier']);
    expect(generateCandidates({ ...long, duration_minutes: 180 }, [long], config)).toEqual([]);
  });

  it('pembanding: kandidat terkait diprioritaskan dan jumlahnya dibatasi', () => {
    const target = sessionAt(-1);
    const candidates = [{ finding_type: 'suspected_duplicate' as const, signal: 'same_assignment_date_duration' as const, related_lesson_session_id: sessionAt(1).id, default_severity: 'medium' as const }];
    const comparisons = selectComparisons(target, october, candidates);
    expect(comparisons[0]?.id).toBe(sessionAt(1).id);
    expect(comparisons.map((c) => c.id)).not.toContain(target.id);
  });
});
