import { eq } from 'drizzle-orm';
import { Decimal } from 'decimal.js';
import type {
  PayrollPreviewResponse,
  PayrollRateLine,
  PayrollSessionLine,
  PayrollTutorSummary,
  Period,
  SessionStatus,
} from '@mumtaz/contracts';
import { lessonSessions } from '../db/schema.js';
import { money } from '../lib/format.js';
import type { ServiceContext } from './context.js';
import { sessionsInPeriod, type SessionView } from './attendance/session-query.js';

/** Sesi masuk nominal hanya bila approved DAN punya tarif snapshot yang lengkap. */
function pricedSnapshot(row: SessionView): { rate: Decimal } | null {
  if (row.status !== 'approved' || row.rate_amount_snapshot === null) return null;
  return { rate: new Decimal(row.rate_amount_snapshot) };
}

function toSessionLine(row: SessionView): PayrollSessionLine {
  const priced = pricedSnapshot(row);
  return {
    session_id: row.id,
    lesson_date: row.lesson_date,
    student_name: row.student_name,
    subject_name: row.subject_name,
    duration_minutes: row.duration_minutes,
    status: row.status as SessionStatus,
    rate_amount: priced ? money(priced.rate) : null,
    // Tarif tunggal per sesi (D-24): nilai sesi = tarif snapshot.
    amount: priced ? money(priced.rate) : null,
    counted: priced !== null,
  };
}

function summarizeTutor(tutorId: string, tutorName: string, rows: SessionView[]): PayrollTutorSummary {
  const lines = new Map<string, { rate: Decimal; sessionIds: string[] }>();
  const count = (status: SessionStatus) => rows.filter((row) => row.status === status).length;
  let amount = new Decimal(0);

  for (const row of rows) {
    const priced = pricedSnapshot(row);
    if (!priced) continue;
    const key = priced.rate.toFixed();
    const line = lines.get(key) ?? { rate: priced.rate, sessionIds: [] };
    line.sessionIds.push(row.id);
    lines.set(key, line);
    amount = amount.plus(priced.rate);
  }

  const rateLines: PayrollRateLine[] = [...lines.values()]
    .sort((a, b) => a.rate.comparedTo(b.rate))
    .map((line) => ({
      rate_amount: money(line.rate),
      sessions: line.sessionIds.length,
      subtotal: money(line.rate.times(line.sessionIds.length)),
      session_ids: [...line.sessionIds].sort(),
    }));
  const pricedCount = rateLines.reduce((sum, line) => sum + line.sessions, 0);

  return {
    tutor_id: tutorId,
    tutor_name: tutorName,
    approved_sessions: count('approved'),
    pending_sessions: count('pending'),
    revision_requested_sessions: count('revision_requested'),
    rejected_sessions: count('rejected'),
    estimated_amount: money(amount),
    rate_lines: rateLines,
    approved_sessions_without_rate: count('approved') - pricedCount,
    sessions: rows
      .map(toSessionLine)
      .sort((a, b) => a.lesson_date.localeCompare(b.lesson_date) || a.session_id.localeCompare(b.session_id)),
  };
}

/**
 * Estimasi honor (docs/03 §9) — service yang SAMA untuk Admin (`Honor Tutor`) dan
 * Tutor (`Honor Saya`, difilter ke tutor login):
 * - periode berbasis `lesson_date`;
 * - hanya sesi `approved` dengan tarif snapshot yang menghasilkan nominal;
 * - nominal dari `rate_amount_snapshot` (bukan angka hard-code), aritmetika `decimal.js`;
 * - sesi approved tanpa tarif tidak diberi nominal palsu, melainkan warning;
 * - setiap tutor membawa rincian sesi sehingga total dapat ditelusuri ke sesi sumbernya.
 * Ini estimasi, bukan catatan pembayaran.
 */
export async function getPayrollPreview(
  ctx: ServiceContext,
  period: Period,
  options: { tutorId?: string } = {},
): Promise<PayrollPreviewResponse> {
  const rows = await sessionsInPeriod(
    ctx.db,
    period,
    options.tutorId ? eq(lessonSessions.tutor_id, options.tutorId) : undefined,
  );

  const byTutor = new Map<string, { name: string; rows: SessionView[] }>();
  for (const row of rows) {
    const group = byTutor.get(row.tutor_id) ?? { name: row.tutor_name, rows: [] };
    group.rows.push(row);
    byTutor.set(row.tutor_id, group);
  }

  const tutors = [...byTutor.entries()]
    .map(([tutorId, group]) => summarizeTutor(tutorId, group.name, group.rows))
    .sort((a, b) => a.tutor_name.localeCompare(b.tutor_name) || a.tutor_id.localeCompare(b.tutor_id));

  const total = tutors.reduce((sum, tutor) => sum.plus(tutor.estimated_amount), new Decimal(0));
  const warnings = tutors
    .filter((tutor) => tutor.approved_sessions_without_rate > 0)
    .map(
      (tutor) =>
        `${tutor.tutor_name}: ${tutor.approved_sessions_without_rate} sesi approved belum memiliki tarif; nominal tidak dihitung. Periksa konfigurasi HONOR_RATE_PER_SESSION.`,
    );

  return {
    period,
    tutors,
    total_estimated_amount: money(total),
    warnings,
  };
}
