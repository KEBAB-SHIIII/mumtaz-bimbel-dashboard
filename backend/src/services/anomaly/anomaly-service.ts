import { and, asc, eq, gte, lte, ne, or } from 'drizzle-orm';
import { anomalyFindingCandidateSchema, type AnomalyFindingCandidate } from '@mumtaz/contracts';
import type { Database } from '../../db/client.js';
import { anomalyFlags, lessonSessions, tutorAssignments } from '../../db/schema.js';
import { safeErrorMessage } from '../../lib/db-errors.js';
import type { Logger } from '../../lib/logger.js';
import {
  AnomalyProviderError,
  type AnomalyDetectionConfig,
  type AnomalyDetector,
  type AnomalySessionSnapshot,
} from '../../integrations/anomaly/types.js';
import { COMPARISON_WINDOW_DAYS, generateCandidates, selectComparisons } from './candidates.js';

export interface AnomalyServiceDeps {
  db: Database;
  /** `null` = provider belum dikonfigurasi → `not_evaluated`. */
  detector: AnomalyDetector | null;
  config: AnomalyDetectionConfig;
  timeoutMs: number;
  logger: Logger;
}

/** `stale` = payload sesi berubah (revisi) selama analisis; hasil lama dibuang. */
export type AnalysisOutcome = 'completed' | 'failed' | 'not_evaluated' | 'skipped' | 'stale';

const snapshotColumns = {
  id: lessonSessions.id,
  assignment_id: lessonSessions.assignment_id,
  tutor_id: tutorAssignments.tutor_id,
  student_id: tutorAssignments.student_id,
  subject_id: tutorAssignments.subject_id,
  lesson_date: lessonSessions.lesson_date,
  duration_minutes: lessonSessions.duration_minutes,
  submitted_at: lessonSessions.submitted_at,
};

type SnapshotRow = { submitted_at: Date } & Omit<AnomalySessionSnapshot, 'submitted_at'>;

const toSnapshot = (row: SnapshotRow): AnomalySessionSnapshot => ({ ...row, submitted_at: row.submitted_at.toISOString() });

function shiftDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function loadTarget(db: Database, sessionId: string) {
  const [row] = await db
    .select({ ...snapshotColumns, anomaly_analysis_status: lessonSessions.anomaly_analysis_status })
    .from(lessonSessions)
    .innerJoin(tutorAssignments, eq(tutorAssignments.id, lessonSessions.assignment_id))
    .where(eq(lessonSessions.id, sessionId))
    .limit(1);
  return row;
}

/** Sesi di sekitar tanggal yang sama untuk tutor atau siswa yang sama (bukan seluruh histori). */
async function loadComparisonPool(db: Database, target: AnomalySessionSnapshot): Promise<AnomalySessionSnapshot[]> {
  const rows = await db
    .select(snapshotColumns)
    .from(lessonSessions)
    .innerJoin(tutorAssignments, eq(tutorAssignments.id, lessonSessions.assignment_id))
    .where(
      and(
        ne(lessonSessions.id, target.id),
        gte(lessonSessions.lesson_date, shiftDate(target.lesson_date, -COMPARISON_WINDOW_DAYS)),
        lte(lessonSessions.lesson_date, shiftDate(target.lesson_date, COMPARISON_WINDOW_DAYS)),
        or(eq(tutorAssignments.tutor_id, target.tutor_id), eq(tutorAssignments.student_id, target.student_id)),
      ),
    )
    .orderBy(asc(lessonSessions.submitted_at), asc(lessonSessions.id))
    .limit(200);
  return rows.map(toSnapshot);
}

/** Output detektor tidak dipercaya mentah: schema + konsistensi referensi sesi. */
function validateFindings(
  findings: AnomalyFindingCandidate[],
  target: AnomalySessionSnapshot,
  knownIds: Set<string>,
): AnomalyFindingCandidate[] {
  return findings.map((finding) => {
    const parsed = anomalyFindingCandidateSchema.safeParse(finding);
    if (
      !parsed.success ||
      parsed.data.lesson_session_id !== target.id ||
      (parsed.data.related_lesson_session_id !== null && !knownIds.has(parsed.data.related_lesson_session_id))
    ) {
      throw new AnomalyProviderError('Output detektor tidak valid', 'invalid_output');
    }
    return parsed.data;
  });
}

async function withTimeout<T>(timeoutMs: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AnomalyProviderError('Provider anomali melebihi batas waktu', 'timeout'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Analisis satu sesi (docs/03 §5, docs/05 §6). Status analisis ditetapkan backend:
 * - provider tidak dikonfigurasi → `not_evaluated`;
 * - provider dipanggil lalu timeout/error/output invalid → `failed`;
 * - selesai → `completed` + finding (hanya `is_anomaly=true`) di `anomaly_flags`.
 * Tidak pernah mengubah `lesson_sessions.status` maupun snapshot honor. Semua
 * penulisan kondisional terhadap payload yang dianalisis, sehingga revisi yang
 * terjadi di tengah analisis tidak tertimpa hasil lama.
 */
export async function analyzeSession(deps: AnomalyServiceDeps, sessionId: string): Promise<AnalysisOutcome> {
  const row = await loadTarget(deps.db, sessionId);
  if (row?.anomaly_analysis_status !== 'pending') return 'skipped';
  const { anomaly_analysis_status: _status, ...rest } = row;
  const target = toSnapshot(rest);

  const sameSubmission = and(
    eq(lessonSessions.id, sessionId),
    eq(lessonSessions.anomaly_analysis_status, 'pending'),
    eq(lessonSessions.submitted_at, row.submitted_at),
  );
  const finish = async (status: 'completed' | 'failed' | 'not_evaluated', findings: AnomalyFindingCandidate[] = [], detector?: AnomalyDetector) =>
    deps.db.transaction(async (tx) => {
      const updated = await tx
        .update(lessonSessions)
        .set({ anomaly_analysis_status: status })
        .where(sameSubmission)
        .returning({ id: lessonSessions.id });
      if (updated.length === 0) return 'stale' as const;
      const flags = findings.filter((finding) => finding.is_anomaly);
      if (flags.length > 0) {
        await tx.insert(anomalyFlags).values(
          flags.map((finding) => ({
            lesson_session_id: finding.lesson_session_id,
            related_lesson_session_id: finding.related_lesson_session_id,
            finding_type: finding.finding_type,
            severity: finding.severity,
            reason: finding.reason,
            evidence_summary: finding.evidence_summary,
            provider: detector?.provider ?? null,
            model: detector?.model ?? null,
          })),
        );
      }
      return status;
    });

  if (!deps.detector) return finish('not_evaluated');

  const pool = await loadComparisonPool(deps.db, target);
  const candidates = generateCandidates(target, pool, deps.config);
  // Tidak ada kandidat dari rule engine → screening selesai tanpa memanggil model.
  if (candidates.length === 0) return finish('completed');

  const comparisons = selectComparisons(target, pool, candidates);
  const detector = deps.detector;
  try {
    const findings = await withTimeout(deps.timeoutMs, (signal) =>
      detector.detect({ target, comparisons, candidates, config: deps.config }, { signal }),
    );
    const valid = validateFindings(findings, target, new Set(comparisons.map((s) => s.id)));
    return await finish('completed', valid, detector);
  } catch (error) {
    deps.logger.warn('anomaly_analysis_failed', {
      session_id: sessionId,
      provider: detector.provider,
      reason: error instanceof AnomalyProviderError ? error.reason : 'unexpected',
      error_message: safeErrorMessage(error),
    });
    return finish('failed');
  }
}

/** ID sesi yang masih `pending` (mis. setelah restart) untuk dilanjutkan worker. */
export async function listPendingAnalysis(db: Database): Promise<string[]> {
  const rows = await db
    .select({ id: lessonSessions.id })
    .from(lessonSessions)
    .where(eq(lessonSessions.anomaly_analysis_status, 'pending'))
    .orderBy(asc(lessonSessions.submitted_at));
  return rows.map((row) => row.id);
}
