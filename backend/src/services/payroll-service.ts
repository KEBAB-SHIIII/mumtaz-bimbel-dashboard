import { eq } from 'drizzle-orm';
import { Decimal } from 'decimal.js';
import {
  DEMO_RATE_LABEL,
  type PayrollPreviewResponse,
  type PayrollRateLine,
  type PayrollTutorSummary,
  type Period,
} from '@mumtaz/contracts';
import { tutorAssignments } from '../db/schema.js';
import { money } from '../lib/format.js';
import type { ServiceContext } from './context.js';
import { sessionsInPeriod } from './attendance/session-query.js';

/**
 * Estimasi honor (docs/03 §9):
 * - hanya sesi `approved` yang menghasilkan nominal;
 * - nominal dari `rate_amount_snapshot` yang disimpan saat approve (tidak ada angka hard-code);
 * - aritmetika `decimal.js` (bukan floating point);
 * - sesi approved tanpa tarif tidak diberi nominal palsu, melainkan warning.
 */
export async function getPayrollPreview(
  ctx: ServiceContext,
  period: Period,
  options: { tutorId?: string } = {},
): Promise<PayrollPreviewResponse> {
  const rows = await sessionsInPeriod(
    ctx.db,
    period,
    options.tutorId ? eq(tutorAssignments.tutor_id, options.tutorId) : undefined,
  );

  type Accumulator = Omit<PayrollTutorSummary, 'estimated_amount' | 'rate_lines'> & {
    amount: Decimal;
    lines: Map<string, { rate: Decimal; is_demo: boolean; session_ids: string[] }>;
  };
  const byTutor = new Map<string, Accumulator>();

  for (const row of rows) {
    const acc =
      byTutor.get(row.tutor_id) ??
      ({
        tutor_id: row.tutor_id,
        tutor_name: row.tutor_name,
        approved_sessions: 0,
        pending_sessions: 0,
        revision_requested_sessions: 0,
        rejected_sessions: 0,
        approved_sessions_without_rate: 0,
        is_demo_assumption: false,
        amount: new Decimal(0),
        lines: new Map(),
      } satisfies Accumulator);

    switch (row.status) {
      case 'approved': {
        acc.approved_sessions += 1;
        if (row.rate_amount_snapshot === null || row.rate_is_demo_snapshot === null) {
          acc.approved_sessions_without_rate += 1;
          break;
        }
        const rate = new Decimal(row.rate_amount_snapshot);
        const lineKey = `${rate.toFixed()}|${row.rate_is_demo_snapshot}`;
        const line = acc.lines.get(lineKey) ?? { rate, is_demo: row.rate_is_demo_snapshot, session_ids: [] };
        line.session_ids.push(row.id);
        acc.lines.set(lineKey, line);
        acc.amount = acc.amount.plus(rate);
        acc.is_demo_assumption ||= row.rate_is_demo_snapshot;
        break;
      }
      case 'pending':
        acc.pending_sessions += 1;
        break;
      case 'revision_requested':
        acc.revision_requested_sessions += 1;
        break;
      case 'rejected':
        acc.rejected_sessions += 1;
        break;
    }
    byTutor.set(row.tutor_id, acc);
  }

  let total = new Decimal(0);
  const warnings: string[] = [];
  const tutors: PayrollTutorSummary[] = [...byTutor.values()]
    .sort((a, b) => a.tutor_name.localeCompare(b.tutor_name) || a.tutor_id.localeCompare(b.tutor_id))
    .map(({ amount, lines, ...summary }) => {
      total = total.plus(amount);
      if (summary.approved_sessions_without_rate > 0) {
        warnings.push(
          `${summary.tutor_name}: ${summary.approved_sessions_without_rate} sesi approved belum memiliki tarif; nominal tidak dihitung.`,
        );
      }
      const rateLines: PayrollRateLine[] = [...lines.values()]
        .sort((a, b) => a.rate.comparedTo(b.rate))
        .map((line) => ({
          rate_amount: money(line.rate),
          is_demo_assumption: line.is_demo,
          sessions: line.session_ids.length,
          subtotal: money(line.rate.times(line.session_ids.length)),
          session_ids: [...line.session_ids].sort(),
        }));
      return { ...summary, estimated_amount: money(amount), rate_lines: rateLines };
    });

  const isDemo = tutors.some((tutor) => tutor.is_demo_assumption);
  return {
    period,
    tutors,
    total_estimated_amount: money(total),
    is_demo_assumption: isDemo,
    demo_label: isDemo ? DEMO_RATE_LABEL : null,
    warnings,
  };
}
