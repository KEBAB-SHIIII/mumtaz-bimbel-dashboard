import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react';
import { CalendarCheck, CalendarClock, ChevronDown, HandCoins, Landmark, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PayrollPreviewResponse, PayrollTutorSummary, TutorPayrollResponse } from '@mumtaz/contracts';
import { Avatar } from '../../components/ui/avatar';
import { ValidityBadge } from '../../components/ui/badge';
import { EmptyState, InlineAlert } from '../../components/ui/feedback';
import { Card, StatCard } from '../../components/ui/layout-primitives';
import { cn } from '../../lib/cn';
import { formatDuration, formatLessonDate, formatPeriod, formatRupiah } from '../../lib/format';

/** Kolom nominal sesi: angka bila dihitung, selain itu alasan eksplisit (tidak ada angka palsu). */
function AmountCell({ amount, counted }: { amount: string | null; counted: boolean }) {
  if (amount) return <span className="tabular-nums">{formatRupiah(amount)}</span>;
  return <span className="text-meta text-muted">{counted ? 'Tarif belum terkunci' : 'Tidak dihitung'}</span>;
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
          <tr className="border-b border-border bg-surface-muted text-start text-meta text-muted [&>th]:h-10 [&>th]:px-4 [&>th]:font-medium [&>th]:whitespace-nowrap">
            <th scope="col" className="text-start">Tanggal les</th>
            <th scope="col" className="text-start">Siswa</th>
            <th scope="col" className="text-start">Mata pelajaran</th>
            <th scope="col" className="text-start">Durasi</th>
            <th scope="col" className="text-start">Validitas</th>
            <th scope="col" className="text-end">{amountLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((line) => (
            <tr key={line.session_id} className={cn('border-b border-border last:border-0 [&>td]:h-11 [&>td]:px-4 [&>td]:py-2.5', line.counted ? 'text-text' : 'text-muted')}>
              <td className="whitespace-nowrap">{formatLessonDate(line.lesson_date)}</td>
              <td>{line.student_name}</td>
              <td>{line.subject_name}</td>
              <td className="whitespace-nowrap">{formatDuration(line.duration_minutes)}</td>
              <td><ValidityBadge validity={line.validity} size="sm" /></td>
              <td className="text-end whitespace-nowrap"><AmountCell amount={line.amount} counted={line.counted} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Nominal Rupiah (string desimal dari backend) untuk CountUp; tampilan tetap `formatRupiah`. */
function rupiahCount(amount: string) {
  return { value: Number(amount), format: (value: number) => formatRupiah(String(value)) };
}

function SessionDisclosure({ count, defaultOpen, children }: { count: number; defaultOpen: boolean; children: ReactNode }) {
  return (
    <Disclosure defaultOpen={defaultOpen}>
      <DisclosureButton className="group flex h-11 w-full items-center justify-between border-t border-border px-4 text-start text-sm font-medium text-primary transition-colors duration-150 hover:bg-surface-muted focus-visible:-outline-offset-2 sm:px-5 motion-reduce:transition-none">
        Rincian sesi ({count})
        <ChevronDown aria-hidden className="size-4 transition-transform duration-200 group-data-[open]:rotate-180 motion-reduce:transition-none" />
      </DisclosureButton>
      <DisclosurePanel className="border-t border-border">{children}</DisclosurePanel>
    </Disclosure>
  );
}

function Breakdown({ items }: { items: { label: string; value: ReactNode; strong?: boolean }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 sm:grid-cols-4 sm:px-5">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-meta text-muted">{item.label}</dt>
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
      description={`${tutor.counted_sessions} sesi dihitung`}
      actions={
        <div className="flex items-center gap-3">
          <span className="text-end">
            <span className="block text-meta text-muted">Total pendapatan bersih tutor</span>
            <span className="block text-base font-semibold tabular-nums text-text">{formatRupiah(tutor.net_amount)}</span>
          </span>
          <Avatar seed={tutor.tutor_id} name={tutor.tutor_name} size={40} decorative className="max-sm:hidden" />
        </div>
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
        <p className="border-t border-border px-4 py-2.5 text-meta text-muted sm:px-5">
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
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard index={0} icon={Wallet} accent="blue" label="Total pendapatan kotor" count={rupiahCount(payroll.totals.gross_amount)} hint="Total tarif les sesi valid" />
        <StatCard index={1} icon={Landmark} accent="green" label="Total pendapatan bersih" count={rupiahCount(payroll.totals.admin_fee_amount)} hint="Potongan admin untuk bimbel" />
        <StatCard index={2} icon={HandCoins} accent="orange" label="Total gaji yang harus dibayarkan" count={rupiahCount(payroll.totals.net_amount)} hint="Pendapatan bersih seluruh tutor" />
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
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard index={0} className="col-span-2 sm:col-span-1" icon={Wallet} accent="green" label="Pendapatan bersih bulan ini" count={rupiahCount(payroll.net_amount)} hint="Setelah potongan admin" />
        <StatCard index={1} icon={CalendarCheck} accent="blue" label="Sesi valid (dihitung)" count={{ value: payroll.counted_sessions }} />
        <StatCard index={2} icon={CalendarClock} accent="orange" label="Sesi belum dihitung" count={{ value: payroll.not_counted_sessions }} />
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
