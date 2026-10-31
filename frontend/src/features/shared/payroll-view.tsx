import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react';
import { ChevronDown } from 'lucide-react';
import type { PayrollPreviewResponse, PayrollSessionLine, PayrollTutorSummary } from '@mumtaz/contracts';
import { StatusBadge } from '../../components/ui/badge';
import { EmptyState, InlineAlert } from '../../components/ui/feedback';
import { Card, StatCard } from '../../components/ui/layout-primitives';
import { cn } from '../../lib/cn';
import { formatDuration, formatLessonDate, formatPeriod, formatRupiah } from '../../lib/format';

function RateLines({ tutor }: { tutor: PayrollTutorSummary }) {
  if (tutor.rate_lines.length === 0) {
    return <p className="px-4 py-3 text-sm text-muted">Belum ada sesi disetujui dengan tarif.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Ringkasan tarif {tutor.tutor_name}</caption>
        <thead>
          <tr className="border-b border-border bg-surface-muted text-left text-xs text-muted">
            <th scope="col" className="px-4 py-2 font-semibold">Tarif per sesi</th>
            <th scope="col" className="px-4 py-2 font-semibold">Sesi dihitung</th>
            <th scope="col" className="px-4 py-2 font-semibold">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {tutor.rate_lines.map((line) => (
            <tr key={line.rate_amount} className="border-b border-border last:border-0">
              <td className="px-4 py-2">
                <span className="inline-flex items-center gap-2">
                  {formatRupiah(line.rate_amount)}
                </span>
              </td>
              <td className="px-4 py-2 tabular-nums">{line.sessions}</td>
              <td className="px-4 py-2 tabular-nums">{formatRupiah(line.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Alasan sesi tidak masuk nominal — selalu eksplisit, tidak ada angka palsu. */
function notCountedReason(line: PayrollSessionLine): string {
  return line.status === 'approved' ? 'Tarif belum terkunci' : 'Tidak dihitung';
}

/** Rincian sesi sumber kalkulasi: total tutor = Σ kolom "Nilai" pada baris yang dihitung. */
function SessionLines({ tutor }: { tutor: PayrollTutorSummary }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Rincian sesi {tutor.tutor_name}</caption>
        <thead>
          <tr className="border-b border-border bg-surface-muted text-left text-xs text-muted">
            <th scope="col" className="px-4 py-2 font-semibold">Tanggal les</th>
            <th scope="col" className="px-4 py-2 font-semibold">Siswa</th>
            <th scope="col" className="px-4 py-2 font-semibold">Mata pelajaran</th>
            <th scope="col" className="px-4 py-2 font-semibold">Durasi</th>
            <th scope="col" className="px-4 py-2 font-semibold">Status</th>
            <th scope="col" className="px-4 py-2 font-semibold">Tarif</th>
            <th scope="col" className="px-4 py-2 text-right font-semibold">Nilai</th>
          </tr>
        </thead>
        <tbody>
          {tutor.sessions.map((line) => (
            <tr key={line.session_id} className={cn('border-b border-border last:border-0', !line.counted && 'text-muted')}>
              <td className="px-4 py-2 whitespace-nowrap">{formatLessonDate(line.lesson_date)}</td>
              <td className="px-4 py-2">{line.student_name}</td>
              <td className="px-4 py-2">{line.subject_name}</td>
              <td className="px-4 py-2 whitespace-nowrap">{formatDuration(line.duration_minutes)}</td>
              <td className="px-4 py-2"><StatusBadge status={line.status} /></td>
              <td className="px-4 py-2 whitespace-nowrap">
                {line.rate_amount ? (
                  <span className="inline-flex items-center gap-2">
                    {formatRupiah(line.rate_amount)}
                  </span>
                ) : (
                  '—'
                )}
              </td>
              <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">
                {line.amount ? formatRupiah(line.amount) : <span className="text-xs">{notCountedReason(line)}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TutorPayrollCard({ tutor, showTutorName, defaultOpen }: { tutor: PayrollTutorSummary; showTutorName: boolean; defaultOpen: boolean }) {
  return (
    <Card
      title={showTutorName ? tutor.tutor_name : 'Rincian honor'}
      actions={<span className="text-sm font-semibold tabular-nums text-text">{formatRupiah(tutor.estimated_amount)}</span>}
    >
      <RateLines tutor={tutor} />
      <p className="border-t border-border px-4 py-2 text-xs text-muted">
        Tidak dihitung: {tutor.pending_sessions} menunggu verifikasi · {tutor.revision_requested_sessions} perlu revisi ·{' '}
        {tutor.rejected_sessions} ditolak
        {tutor.approved_sessions_without_rate > 0 && ` · ${tutor.approved_sessions_without_rate} disetujui tanpa tarif`}
      </p>
      <Disclosure defaultOpen={defaultOpen}>
        <DisclosureButton className="group flex w-full items-center justify-between border-t border-border px-4 py-2 text-left text-sm font-medium text-primary hover:bg-surface-muted">
          Rincian sesi ({tutor.sessions.length})
          <ChevronDown aria-hidden className="size-4 transition-transform group-data-[open]:rotate-180" />
        </DisclosureButton>
        <DisclosurePanel className="border-t border-border">
          <SessionLines tutor={tutor} />
        </DisclosurePanel>
      </Disclosure>
    </Card>
  );
}

/**
 * Estimasi honor (Admin `Honor Tutor` & Tutor `Honor Saya`) dari service backend yang sama.
 * Semua nominal dari backend; frontend tidak menghitung ulang (tarif tunggal per sesi, D-24).
 * Tidak ada status "sudah dibayar".
 */
export function PayrollView({ payroll, showTutorName }: { payroll: PayrollPreviewResponse; showTutorName: boolean }) {
  const approved = payroll.tutors.reduce((sum, tutor) => sum + tutor.approved_sessions, 0);
  const notCounted = payroll.tutors.reduce(
    (sum, tutor) => sum + tutor.pending_sessions + tutor.revision_requested_sessions + tutor.rejected_sessions,
    0,
  );

  return (
    <>
      {payroll.warnings.map((warning) => (
        <InlineAlert key={warning} tone="warning" title="Tarif belum tersedia">
          {warning}
        </InlineAlert>
      ))}

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Total estimasi honor"
          value={formatRupiah(payroll.total_estimated_amount)}
        />
        <StatCard label="Sesi disetujui" value={approved} />
        <StatCard label="Sesi belum disetujui (tidak dihitung)" value={notCounted} />
      </dl>

      {payroll.tutors.length === 0 ? (
        <Card>
          <EmptyState title="Belum ada sesi" description={`Tidak ada sesi pada ${formatPeriod(payroll.period)}.`} />
        </Card>
      ) : (
        payroll.tutors.map((tutor) => (
          // Tutor hanya melihat dirinya sendiri → rincian langsung terbuka.
          <TutorPayrollCard key={tutor.tutor_id} tutor={tutor} showTutorName={showTutorName} defaultOpen={!showTutorName} />
        ))
      )}
    </>
  );
}
