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
  .map(({ session }) => ({
    id: session.id,
    tutor_id: session.tutor_id,
    student_id: session.student_id,
    subject_ids: [...session.subject_ids].sort(),
    lesson_date: session.lesson_date,
    start_time: session.start_time,
    duration_minutes: session.duration_minutes,
    submitted_at: session.submitted_at,
  }));

const config = { durationOutlierMinutes: FIXTURE_DURATION_OUTLIER_MINUTES, lateStartAfter: '21:00' };
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
      const detection = await detector.detect({ target, comparisons: selectComparisons(target, october, candidates), candidates, config }, { signal });
      findings.push(...detection.findings);
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
      { finding_type: 'suspected_duplicate', signal: 'same_tutor_student_subject_date_duration', related_lesson_session_id: first.id, default_severity: 'medium' },
    ]);
  });

  it('murid+mapel+tanggal sama dicatat tutor lain → kandidat duplikasi severity rendah', () => {
    const base = sessionAt(0);
    const other = { ...base, id: '00000000-0000-4000-8000-0000000000ab', tutor_id: 'tutor-lain', submitted_at: '2026-12-01T00:00:00Z' };
    expect(generateCandidates(other, [base, other], config)).toEqual([
      { finding_type: 'suspected_duplicate', signal: 'same_student_subject_date', related_lesson_session_id: base.id, default_severity: 'low' },
    ]);
  });

  it('durasi di atas ambang konfigurasi → kandidat duration_outlier', () => {
    const long = { ...sessionAt(0), duration_minutes: 181 };
    expect(generateCandidates(long, [long], config).map((c) => c.finding_type)).toEqual(['duration_outlier']);
    expect(generateCandidates({ ...long, duration_minutes: 180 }, [long], config)).toEqual([]);
  });

  it('mapel beririsan dihitung sama untuk tutor lain; himpunan mapel berbeda bukan duplikat persis', () => {
    const base = { ...sessionAt(0), subject_ids: ['m-a', 'm-b'] };
    const otherTutor = { ...base, id: '00000000-0000-4000-8000-0000000000ac', tutor_id: 'tutor-lain', subject_ids: ['m-b'], submitted_at: '2026-12-01T00:00:00Z' };
    expect(generateCandidates(otherTutor, [base, otherTutor], config).map((c) => c.signal)).toEqual(['same_student_subject_date']);
    const sameTutor = { ...base, id: '00000000-0000-4000-8000-0000000000ad', subject_ids: ['m-a'], submitted_at: '2026-12-01T00:00:00Z' };
    expect(generateCandidates(sameTutor, [base, sameTutor], config)).toEqual([]);
  });

  it('jam mulai setelah 21.00 → kandidat late_start; sesi lama tanpa jam tidak', () => {
    const late = { ...sessionAt(0), start_time: '21:01' };
    expect(generateCandidates(late, [late], config).map((c) => c.finding_type)).toEqual(['late_start']);
    expect(generateCandidates({ ...late, start_time: '21:00' }, [late], config)).toEqual([]);
    expect(generateCandidates({ ...late, start_time: null }, [late], config)).toEqual([]);
  });

  it('fake detector: duplikat persis → Ditolak, kandidat lain → Perlu revisi, dismiss → Valid', async () => {
    const target = sessionAt(0);
    const input = (signal: 'same_tutor_student_subject_date_duration' | 'duration_above_threshold') => ({
      target,
      comparisons: [],
      candidates: [{ finding_type: signal === 'duration_above_threshold' ? 'duration_outlier' as const : 'suspected_duplicate' as const, signal, related_lesson_session_id: null, default_severity: 'low' as const }],
      config,
    });
    expect((await new FakeAnomalyDetector().detect(input('same_tutor_student_subject_date_duration'), { signal })).validity).toBe('rejected');
    expect((await new FakeAnomalyDetector().detect(input('duration_above_threshold'), { signal })).validity).toBe('needs_revision');
    expect((await new FakeAnomalyDetector('dismiss_all').detect(input('duration_above_threshold'), { signal })).validity).toBe('valid');
  });

  it('pembanding: kandidat terkait diprioritaskan dan jumlahnya dibatasi', () => {
    const target = sessionAt(-1);
    const candidates = [{ finding_type: 'suspected_duplicate' as const, signal: 'same_tutor_student_subject_date_duration' as const, related_lesson_session_id: sessionAt(1).id, default_severity: 'medium' as const }];
    const comparisons = selectComparisons(target, october, candidates);
    expect(comparisons[0]?.id).toBe(sessionAt(1).id);
    expect(comparisons.map((c) => c.id)).not.toContain(target.id);
  });
});
