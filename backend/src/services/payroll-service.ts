import { eq } from 'drizzle-orm';
import { Decimal } from 'decimal.js';
import type {
  PayrollPreviewResponse,
  PayrollSessionLine,
  PayrollTutorSummary,
  Period,
  SessionStatus,
  SessionValidity,
  TutorPayrollResponse,
} from '@mumtaz/contracts';
import { approvalStatusOf } from '@mumtaz/contracts';
import { lessonSessions } from '../db/schema.js';
import { money } from '../lib/format.js';
import type { ServiceContext } from './context.js';
import { sessionsInPeriod, type SessionView } from './attendance/session-query.js';

/**
 * Nominal sesi hanya bila dihitung (approved) DAN punya snapshot tarif. Potongan Admin dari snapshot;
 * snapshot lama tanpa potongan dianggap Rp0 (sebelum potongan berlaku).
 */
function pricedSnapshot(row: SessionView): { gross: Decimal; fee: Decimal } | null {
  if (row.status !== 'approved' || row.rate_amount_snapshot === null) return null;
  return { gross: new Decimal(row.rate_amount_snapshot), fee: new Decimal(row.admin_fee_snapshot ?? 0) };
}

function toSessionLine(row: SessionView): PayrollSessionLine {
  const priced = pricedSnapshot(row);
  const validity = row.validity as SessionValidity | null;
  return {
    session_id: row.id,
    lesson_date: row.lesson_date,
    student_name: row.student_name,
    subject_name: row.subject_name,
    duration_minutes: row.duration_minutes,
    status: row.status as SessionStatus,
    validity,
    approval_status: approvalStatusOf(validity, row.status as SessionStatus),
    counted: priced !== null,
    gross_amount: priced ? money(priced.gross) : null,
    admin_fee: priced ? money(priced.fee) : null,
    net_amount: priced ? money(priced.gross.minus(priced.fee)) : null,
  };
}

function summarizeTutor(tutorId: string, tutorName: string, rows: SessionView[]): PayrollTutorSummary {
  let gross = new Decimal(0);
  let fee = new Decimal(0);
  let counted = 0;
  for (const row of rows) {
    const priced = pricedSnapshot(row);
    if (!priced) continue;
    counted += 1;
    gross = gross.plus(priced.gross);
    fee = fee.plus(priced.fee);
  }
  const approved = rows.filter((row) => row.status === 'approved').length;

  return {
    tutor_id: tutorId,
    tutor_name: tutorName,
    counted_sessions: counted,
    not_counted_sessions: rows.length - counted,
    gross_amount: money(gross),
    admin_fee_amount: money(fee),
    net_amount: money(gross.minus(fee)),
    approved_sessions_without_rate: approved - counted,
    sessions: rows
      .map(toSessionLine)
      .sort((a, b) => a.lesson_date.localeCompare(b.lesson_date) || a.session_id.localeCompare(b.session_id)),
  };
}

/**
 * Honor (docs/03 §9; revisi PM D-25) — periode berbasis `lesson_date`; hanya sesi dihitung dengan
 * snapshot tarif yang bernominal; aritmetika `decimal.js`; sesi dihitung tanpa tarif tidak diberi
 * nominal palsu, melainkan warning. Setiap tutor membawa rincian sesi (crosscheck dengan tutor).
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

  const sum = (key: 'gross_amount' | 'admin_fee_amount' | 'net_amount') =>
    money(tutors.reduce((total, tutor) => total.plus(tutor[key]), new Decimal(0)));
  const warnings = tutors
    .filter((tutor) => tutor.approved_sessions_without_rate > 0)
    .map(
      (tutor) =>
        `${tutor.tutor_name}: ${tutor.approved_sessions_without_rate} sesi dihitung belum memiliki tarif (kelas murid tidak didukung); nominal tidak dihitung.`,
    );

  return {
    period,
    tutors,
    totals: { gross_amount: sum('gross_amount'), admin_fee_amount: sum('admin_fee_amount'), net_amount: sum('net_amount') },
    warnings,
  };
}

/**
 * Honor Saya — tutor login saja dan HANYA pendapatan bersih (revisi PM): tarif kotor dan potongan
 * Admin tidak pernah dikirim ke Tutor.
 */
export async function getTutorPayroll(ctx: ServiceContext, tutorId: string, period: Period): Promise<TutorPayrollResponse> {
  const preview = await getPayrollPreview(ctx, period, { tutorId });
  const tutor = preview.tutors[0];
  return {
    period,
    counted_sessions: tutor?.counted_sessions ?? 0,
    not_counted_sessions: tutor?.not_counted_sessions ?? 0,
    net_amount: tutor?.net_amount ?? '0',
    sessions: (tutor?.sessions ?? []).map(({ gross_amount: _gross, admin_fee: _fee, ...line }) => line),
    warnings: tutor && tutor.approved_sessions_without_rate > 0
      ? [`${tutor.approved_sessions_without_rate} sesi dihitung belum memiliki tarif; hubungi Admin.`]
      : [],
  };
}
