import type { AnomalyDetectionInput, AnomalySessionSnapshot } from './types.js';

/**
 * Payload minimum untuk model: alias pengganti semua ID (S/T/P/M), tanggal,
 * dan durasi. Tidak ada nama, kontak, materi/catatan, ataupun UUID internal.
 */
export interface PseudonymousPayload {
  config: { duration_outlier_minutes: number };
  target: PseudonymousSession;
  comparisons: PseudonymousSession[];
  candidates: { ref: string; finding_type: string; signal: string; related: string | null }[];
}

interface PseudonymousSession {
  ref: string;
  tutor: string;
  student: string;
  subject: string;
  lesson_date: string;
  duration_minutes: number;
}

export interface AliasMap {
  payload: PseudonymousPayload;
  /** Alias sesi (`S0` = target) → UUID sesi. */
  sessionIdOf: Map<string, string>;
  /** Alias kandidat (`C1`…) → indeks kandidat input. */
  candidateIndexOf: Map<string, number>;
}

function aliaser(prefix: string) {
  const map = new Map<string, string>();
  return (id: string) => {
    let alias = map.get(id);
    if (!alias) {
      alias = `${prefix}${map.size + 1}`;
      map.set(id, alias);
    }
    return alias;
  };
}

export function pseudonymize(input: AnomalyDetectionInput): AliasMap {
  const tutor = aliaser('T');
  const student = aliaser('P');
  const subject = aliaser('M');
  const sessionIdOf = new Map<string, string>();
  const sessionAlias = new Map<string, string>();

  const toSession = (snapshot: AnomalySessionSnapshot, ref: string): PseudonymousSession => {
    sessionIdOf.set(ref, snapshot.id);
    sessionAlias.set(snapshot.id, ref);
    return {
      ref,
      tutor: tutor(snapshot.tutor_id),
      student: student(snapshot.student_id),
      subject: subject(snapshot.subject_id),
      lesson_date: snapshot.lesson_date,
      duration_minutes: snapshot.duration_minutes,
    };
  };

  const target = toSession(input.target, 'S0');
  const comparisons = input.comparisons.map((snapshot, index) => toSession(snapshot, `S${index + 1}`));
  const candidateIndexOf = new Map<string, number>();
  const candidates = input.candidates.map((candidate, index) => {
    const ref = `C${index + 1}`;
    candidateIndexOf.set(ref, index);
    return {
      ref,
      finding_type: candidate.finding_type,
      signal: candidate.signal,
      related: candidate.related_lesson_session_id ? (sessionAlias.get(candidate.related_lesson_session_id) ?? null) : null,
    };
  });

  return {
    payload: { config: { duration_outlier_minutes: input.config.durationOutlierMinutes }, target, comparisons, candidates },
    sessionIdOf,
    candidateIndexOf,
  };
}

/** Alias tidak bermakna bagi Admin: ganti dengan frasa netral pada teks dari model. */
export function humanizeAliases(text: string): string {
  return text
    .replace(/\bS0\b/g, 'sesi ini')
    .replace(/\bS\d+\b/g, 'sesi pembanding')
    .replace(/\bT\d+\b/g, 'tutor')
    .replace(/\bP\d+\b/g, 'siswa')
    .replace(/\bM\d+\b/g, 'mata pelajaran')
    .replace(/\bC\d+\b/g, 'kandidat')
    .trim();
}
