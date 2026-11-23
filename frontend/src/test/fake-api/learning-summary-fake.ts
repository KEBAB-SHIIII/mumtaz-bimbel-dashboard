import type {
  GenerateMonthlySummaryResponse,
  GenerateSessionSummaryResponse,
  LearningSummaryView,
  ParentLearningSummariesResponse,
} from '@mumtaz/contracts';
import type { FixtureLessonSession } from '@mumtaz/contracts/fixtures';

interface CachedSummary {
  fingerprint: string;
  view: LearningSummaryView;
}

export interface FakeLearningSummaryStore {
  getSummaries(
    studentId: string,
    period: string,
    approvedSessions: FixtureLessonSession[],
    subjectNamesOf: (session: FixtureLessonSession) => string[],
  ): ParentLearningSummariesResponse;
  generateMonthly(
    studentId: string,
    period: string,
    approvedSessions: FixtureLessonSession[],
    subjectNamesOf: (session: FixtureLessonSession) => string[],
    now: () => Date,
  ): GenerateMonthlySummaryResponse;
  generateSession(
    session: FixtureLessonSession,
    subjectNames: string[],
    now: () => Date,
  ): GenerateSessionSummaryResponse;
  failNext(): void;
  consumeShouldFail(): boolean;
}

function fingerprintOf(
  scope: 'session' | 'monthly',
  period: string,
  sessions: FixtureLessonSession[],
  subjectNamesOf: (session: FixtureLessonSession) => string[],
): string {
  const canonical = [...sessions]
    .sort((a, b) => a.lesson_date.localeCompare(b.lesson_date) || a.id.localeCompare(b.id))
    .map((s) => ({
      id: s.id,
      lesson_date: s.lesson_date,
      subjects: [...subjectNamesOf(s)].sort((a, b) => a.localeCompare(b)),
      duration_minutes: s.duration_minutes,
      learning_material: s.learning_material,
      learning_notes: s.learning_notes,
    }));
  return JSON.stringify({ scope, period, sessions: canonical });
}

function buildView(
  scope: 'session' | 'monthly',
  sessions: FixtureLessonSession[],
  subjectNamesOf: (session: FixtureLessonSession) => string[],
  generatedAt: string,
): LearningSummaryView {
  const uniqueSubjects = [
    ...new Set(sessions.flatMap((s) => subjectNamesOf(s))),
  ].sort((a, b) => a.localeCompare(b));

  const materials = sessions.map((s) => s.learning_material).join('; ');
  return {
    overall_status: 'good',
    summary:
      scope === 'monthly'
        ? `Perkembangan belajar bulan ini baik berdasarkan ${sessions.length} sesi terverifikasi (${materials}).`
        : `Pada sesi ini siswa mengikuti materi ${materials} dengan baik.`,
    strengths: ['Aktif mengikuti latihan yang diberikan tutor'],
    areas_to_improve: ['Perlu latihan rutin untuk menjaga ketelitian'],
    subjects_covered: uniqueSubjects.map((name) => ({
      subject_name: name,
      highlight: `Materi ${name} dibahas dengan baik sesuai target sesi.`,
    })),
    generated_at: generatedAt,
    is_stale: false,
  };
}

export function createFakeLearningSummaryStore(): FakeLearningSummaryStore {
  const monthlyCache = new Map<string, CachedSummary>();
  const sessionCache = new Map<string, CachedSummary>();
  let failNextFlag = false;

  return {
    failNext() {
      failNextFlag = true;
    },
    consumeShouldFail() {
      if (!failNextFlag) return false;
      failNextFlag = false;
      return true;
    },
    getSummaries(studentId, period, approvedSessions, subjectNamesOf) {
      if (approvedSessions.length === 0) {
        return {
          student_id: studentId,
          period,
          approved_session_count: 0,
          monthly: null,
          sessions: {},
        };
      }

      const monthlyFp = fingerprintOf('monthly', period, approvedSessions, subjectNamesOf);
      const cachedMonthly = monthlyCache.get(`${studentId}:${period}`);
      const monthly = cachedMonthly
        ? { ...cachedMonthly.view, is_stale: cachedMonthly.fingerprint !== monthlyFp }
        : null;

      const sessionsOut: Record<string, LearningSummaryView> = {};
      for (const s of approvedSessions) {
        const cached = sessionCache.get(s.id);
        if (!cached) continue;
        const fp = fingerprintOf('session', period, [s], subjectNamesOf);
        sessionsOut[s.id] = { ...cached.view, is_stale: cached.fingerprint !== fp };
      }

      return {
        student_id: studentId,
        period,
        approved_session_count: approvedSessions.length,
        monthly,
        sessions: sessionsOut,
      };
    },
    generateMonthly(studentId, period, approvedSessions, subjectNamesOf, now) {
      const fp = fingerprintOf('monthly', period, approvedSessions, subjectNamesOf);
      const key = `${studentId}:${period}`;
      const existing = monthlyCache.get(key);
      if (existing && existing.fingerprint === fp) {
        return { summary: { ...existing.view, is_stale: false }, cached: true };
      }
      const view = buildView('monthly', approvedSessions, subjectNamesOf, now().toISOString());
      monthlyCache.set(key, { fingerprint: fp, view });
      return { summary: view, cached: false };
    },
    generateSession(session, subjectNames, now) {
      const period = session.lesson_date.slice(0, 7);
      const fp = fingerprintOf('session', period, [session], () => subjectNames);
      const existing = sessionCache.get(session.id);
      if (existing && existing.fingerprint === fp) {
        return {
          lesson_session_id: session.id,
          summary: { ...existing.view, is_stale: false },
          cached: true,
        };
      }
      const view = buildView('session', [session], () => subjectNames, now().toISOString());
      sessionCache.set(session.id, { fingerprint: fp, view });
      return { lesson_session_id: session.id, summary: view, cached: false };
    },
  };
}
