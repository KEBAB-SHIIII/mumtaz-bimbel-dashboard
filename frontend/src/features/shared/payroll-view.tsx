import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PayrollPreviewResponse, PayrollTutorSummary, TutorPayrollResponse } from '@mumtaz/contracts';
import { ValidityBadge } from '../../components/ui/badge';
import { EmptyState, InlineAlert } from '../../components/ui/feedback';
import { Card, StatCard } from '../../components/ui/layout-primitives';
import { cn } from '../../lib/cn';
import { formatDuration, formatLessonDate, formatPeriod, formatRupiah } from '../../lib/format';

/** Kolom nominal sesi: angka bila dihitung, selain itu alasan eksplisit (tidak ada angka palsu). */
function AmountCell({ amount, counted }: { amount: string | null; counted: boolean }) {
  if (amount) return <span className="tabular-nums">{formatRupiah(amount)}</span>;
  return <span className="text-xs text-muted">{counted ? 'Tarif belum terkunci' : 'Tidak dihitung'}</span>;
}

interface SessionRow {
  session_id: string;
  lesson_date: string;
  student_name: string;
  subject_name: string;
  duration_minutes: number;
  validity: PayrollTutorSummary['sessions'][number]['validity'];
  counted: boolean;
  amount: string | null;
}

/** Rincian sesi untuk crosscheck dengan tutor. `amountLabel`: tarif kotor (Admin) atau honor bersih (Tutor). */
function SessionLines({ caption, rows, amountLabel }: { caption: string; rows: SessionRow[]; amountLabel: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border bg-surface-muted text-left text-xs text-muted">
            <th scope="col" className="px-4 py-2 font-semibold">Tanggal les</th>
            <th scope="col" className="px-4 py-2 font-semibold">Siswa</th>
            <th scope="col" className="px-4 py-2 font-semibold">Mata pelajaran</th>
            <th scope="col" className="px-4 py-2 font-semibold">Durasi</th>
            <th scope="col" className="px-4 py-2 font-semibold">Validitas</th>
            <th scope="col" className="px-4 py-2 text-right font-semibold">{amountLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((line) => (
            <tr key={line.session_id} className={cn('border-b border-border last:border-0', !line.counted && 'text-muted')}>
              <td className="px-4 py-2 whitespace-nowrap">{formatLessonDate(line.lesson_date)}</td>
              <td className="px-4 py-2">{line.student_name}</td>
              <td className="px-4 py-2">{line.subject_name}</td>
              <td className="px-4 py-2 whitespace-nowrap">{formatDuration(line.duration_minutes)}</td>
              <td className="px-4 py-2"><ValidityBadge validity={line.validity} /></td>
              <td className="px-4 py-2 text-right whitespace-nowrap"><AmountCell amount={line.amount} counted={line.counted} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SessionDisclosure({ count, defaultOpen, children }: { count: number; defaultOpen: boolean; children: ReactNode }) {
  return (
    <Disclosure defaultOpen={defaultOpen}>
      <DisclosureButton className="group flex w-full items-center justify-between border-t border-border px-4 py-2 text-left text-sm font-medium text-primary hover:bg-surface-muted">
        Rincian sesi ({count})
        <ChevronDown aria-hidden className="size-4 transition-transform group-data-[open]:rotate-180" />
      </DisclosureButton>
      <DisclosurePanel className="border-t border-border">{children}</DisclosurePanel>
    </Disclosure>
  );
}

function Breakdown({ items }: { items: { label: string; value: ReactNode; strong?: boolean }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs text-muted">{item.label}</dt>
          <dd className={cn('mt-0.5 tabular-nums', item.strong ? 'font-semibold text-text' : 'text-text')}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function TutorPayrollCard({ tutor }: { tutor: PayrollTutorSummary }) {
  return (
    <Card
      title={tutor.tutor_name}
      actions={
        <span className="text-right">
          <span className="block text-xs text-muted">Total pendapatan bersih tutor</span>
          <span className="block text-base font-semibold tabular-nums text-text">{formatRupiah(tutor.net_amount)}</span>
        </span>
      }
    >
      <Breakdown
        items={[
          { label: 'Jumlah sesi valid', value: `${tutor.counted_sessions} sesi` },
          { label: 'Subtotal (kotor)', value: formatRupiah(tutor.gross_amount) },
          { label: 'Potongan admin', value: `− ${formatRupiah(tutor.admin_fee_amount)}` },
          { label: 'Total (pendapatan bersih)', value: formatRupiah(tutor.net_amount), strong: true },
        ]}
      />
      {tutor.not_counted_sessions > 0 && (
        <p className="border-t border-border px-4 py-2 text-xs text-muted">
          {tutor.not_counted_sessions} sesi tidak dihitung (menunggu validasi, perlu revisi, atau ditolak).
        </p>
      )}
      <SessionDisclosure count={tutor.sessions.length} defaultOpen={false}>
        <SessionLines
          caption={`Rincian sesi ${tutor.tutor_name}`}
          amountLabel="Tarif (kotor)"
          rows={tutor.sessions.map((line) => ({ ...line, amount: line.gross_amount }))}
        />
      </SessionDisclosure>
    </Card>
  );
}

function Warnings({ warnings }: { warnings: string[] }) {
  return warnings.map((warning) => (
    <InlineAlert key={warning} tone="warning" title="Tarif belum tersedia">
      {warning}
    </InlineAlert>
  ));
}

/**
 * Honor Tutor (Admin; revisi PM): crosscheck absensi dengan tutor. Semua nominal dari backend;
 * frontend tidak menghitung ulang. Tidak ada status "sudah dibayar".
 */
export function AdminPayrollView({ payroll }: { payroll: PayrollPreviewResponse }) {
  return (
    <>
      <Warnings warnings={payroll.warnings} />
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Total pendapatan kotor" value={formatRupiah(payroll.totals.gross_amount)} hint={<span className="text-xs text-muted">Total tarif les sesi valid</span>} />
        <StatCard label="Total pendapatan bersih" value={formatRupiah(payroll.totals.admin_fee_amount)} hint={<span className="text-xs text-muted">Potongan admin untuk bimbel</span>} />
        <StatCard label="Total gaji yang harus dibayarkan" value={formatRupiah(payroll.totals.net_amount)} hint={<span className="text-xs text-muted">Pendapatan bersih seluruh tutor</span>} />
      </dl>
      {payroll.tutors.length === 0 ? (
        <Card>
          <EmptyState title="Belum ada sesi" description={`Tidak ada sesi pada ${formatPeriod(payroll.period)}.`} />
        </Card>
      ) : (
        payroll.tutors.map((tutor) => <TutorPayrollCard key={tutor.tutor_id} tutor={tutor} />)
      )}
    </>
  );
}

/** Honor Saya (Tutor; revisi PM): hanya pendapatan bersih setelah potongan admin. */
export function TutorPayrollView({ payroll }: { payroll: TutorPayrollResponse }) {
  return (
    <>
      <Warnings warnings={payroll.warnings} />
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Pendapatan bersih bulan ini" value={formatRupiah(payroll.net_amount)} hint={<span className="text-xs text-muted">Setelah potongan admin</span>} />
        <StatCard label="Sesi valid (dihitung)" value={payroll.counted_sessions} />
        <StatCard label="Sesi belum dihitung" value={payroll.not_counted_sessions} />
      </dl>
      {payroll.sessions.length === 0 ? (
        <Card>
          <EmptyState title="Belum ada sesi" description={`Tidak ada sesi pada ${formatPeriod(payroll.period)}.`} />
        </Card>
      ) : (
        <Card title="Rincian honor">
          <SessionLines caption="Rincian honor per sesi" amountLabel="Honor (bersih)" rows={payroll.sessions.map((line) => ({ ...line, amount: line.net_amount }))} />
        </Card>
      )}
    </>
  );
}
