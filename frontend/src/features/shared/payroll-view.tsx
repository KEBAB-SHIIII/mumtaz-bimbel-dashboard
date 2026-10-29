import type { PayrollPreviewResponse } from '@mumtaz/contracts';
import { DemoBadge } from '../../components/ui/badge';
import { DemoRateNotice, EmptyState, InlineAlert } from '../../components/ui/feedback';
import { Card, StatCard } from '../../components/ui/layout-primitives';
import { formatPeriod, formatRupiah } from '../../lib/format';

/**
 * Tampilan estimasi honor (Admin & Tutor). Semua nominal dari backend;
 * frontend tidak menghitung ulang. Tidak ada status "sudah dibayar".
 */
export function PayrollView({ payroll, showTutorName }: { payroll: PayrollPreviewResponse; showTutorName: boolean }) {
  const approved = payroll.tutors.reduce((sum, tutor) => sum + tutor.approved_sessions, 0);
  const notCounted = payroll.tutors.reduce(
    (sum, tutor) => sum + tutor.pending_sessions + tutor.revision_requested_sessions + tutor.rejected_sessions,
    0,
  );

  return (
    <>
      {payroll.demo_label && (
        <InlineAlert tone="info" title={payroll.demo_label}>
          Nominal memakai tarif demo dari data Tarif Honor; ini estimasi, bukan status pembayaran.
        </InlineAlert>
      )}
      {payroll.warnings.map((warning) => (
        <InlineAlert key={warning} tone="warning" title="Tarif belum tersedia">
          {warning}
        </InlineAlert>
      ))}

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Total estimasi honor"
          value={formatRupiah(payroll.total_estimated_amount)}
          hint={<DemoRateNotice label={payroll.demo_label} />}
        />
        <StatCard label="Sesi disetujui (dihitung)" value={approved} />
        <StatCard label="Sesi belum disetujui (tidak dihitung)" value={notCounted} />
      </dl>

      {payroll.tutors.length === 0 ? (
        <Card>
          <EmptyState title="Belum ada sesi" description={`Tidak ada sesi pada ${formatPeriod(payroll.period)}.`} />
        </Card>
      ) : (
        payroll.tutors.map((tutor) => (
          <Card
            key={tutor.tutor_id}
            title={showTutorName ? tutor.tutor_name : 'Rincian honor'}
            actions={<span className="text-sm font-semibold tabular-nums text-text">{formatRupiah(tutor.estimated_amount)}</span>}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Rincian tarif {tutor.tutor_name}</caption>
                <thead>
                  <tr className="border-b border-border bg-surface-muted text-left text-xs text-muted">
                    <th scope="col" className="px-4 py-2 font-semibold">Tarif per sesi</th>
                    <th scope="col" className="px-4 py-2 font-semibold">Sesi disetujui</th>
                    <th scope="col" className="px-4 py-2 font-semibold">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {tutor.rate_lines.map((line) => (
                    <tr key={`${line.rate_amount}-${String(line.is_demo_assumption)}`} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center gap-2">
                          {formatRupiah(line.rate_amount)} {line.is_demo_assumption && <DemoBadge />}
                        </span>
                      </td>
                      <td className="px-4 py-2 tabular-nums">{line.sessions}</td>
                      <td className="px-4 py-2 tabular-nums">{formatRupiah(line.subtotal)}</td>
                    </tr>
                  ))}
                  {tutor.rate_lines.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-3 text-muted">Belum ada sesi disetujui dengan tarif.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="border-t border-border px-4 py-2 text-xs text-muted">
              Tidak dihitung: {tutor.pending_sessions} menunggu verifikasi · {tutor.revision_requested_sessions} perlu revisi ·{' '}
              {tutor.rejected_sessions} ditolak
              {tutor.approved_sessions_without_rate > 0 && ` · ${tutor.approved_sessions_without_rate} disetujui tanpa tarif`}
            </p>
          </Card>
        ))
      )}
    </>
  );
}
