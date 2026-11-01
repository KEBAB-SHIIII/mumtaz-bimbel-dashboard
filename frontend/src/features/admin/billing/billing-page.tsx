import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarCheck, Download, GraduationCap, ReceiptText } from 'lucide-react';
import type { BillingLine, BillingStudent } from '@mumtaz/contracts';
import { Avatar } from '../../../components/ui/avatar';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { EmptyState, InlineAlert, NoResultsState } from '../../../components/ui/feedback';
import { FilterSelect } from '../../../components/ui/filter-select';
import { Card, PageHeader, StatCard } from '../../../components/ui/layout-primitives';
import { PeriodSelector } from '../../../components/ui/period-selector';
import { QueryView } from '../../../components/ui/query-view';
import { SkeletonDataTable, SkeletonStatCards } from '../../../components/ui/skeleton';
import { toApiError } from '../../../lib/api-error';
import { cn } from '../../../lib/cn';
import { formatDuration, formatLessonDate, formatLessonTime, formatPeriod, formatRupiah } from '../../../lib/format';
import { usePeriodParam } from '../../../lib/period';
import { queryKeys } from '../../../lib/query-keys';
import { useSearchState } from '../../../lib/use-search-state';
import { downloadInvoice, fetchAdminAttendanceOptions, fetchBilling } from '../api';

/** Simpan blob sebagai file lewat tautan sementara (unduhan dipicu tombol, bukan navigasi). */
function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const columns: ColumnDef<BillingLine, unknown>[] = [
  { id: 'no', header: 'No', cell: ({ row }) => row.index + 1 },
  { id: 'date', header: 'Tanggal les', meta: { cardTitle: true }, cell: ({ row }) => <span className="whitespace-nowrap">{formatLessonDate(row.original.lesson_date)}</span> },
  { id: 'time', header: 'Jam', cell: ({ row }) => <span className="whitespace-nowrap">{formatLessonTime(row.original.start_time, row.original.end_time)}</span> },
  { accessorKey: 'subject_name', header: 'Mata pelajaran' },
  { accessorKey: 'tutor_name', header: 'Tutor' },
  { id: 'duration', header: 'Durasi', cell: ({ row }) => <span className="whitespace-nowrap">{formatDuration(row.original.duration_minutes)}</span> },
  { id: 'amount', header: () => <span className="block text-right">Tarif per sesi</span>, cell: ({ row }) => <span className="block text-right tabular-nums">{formatRupiah(row.original.amount)}</span> },
];

function StudentInvoice({ student, period }: { student: BillingStudent; period: string }) {
  const download = useMutation({
    mutationFn: () => downloadInvoice(student.student_id, period),
    onSuccess: ({ blob, fileName }) => saveBlob(blob, fileName),
  });
  const headingId = `invoice-${student.student_id}`;

  return (
    <section aria-labelledby={headingId} className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar seed={student.student_id} name={student.student_name} size={40} decorative />
          <div className="min-w-0">
          <h2 id={headingId} className="text-card-title text-text">{student.student_name}</h2>
          <p className="text-meta text-pretty text-muted">
            {student.grade} · {student.school_name}
            {student.parent_names.length > 0 && ` · Orang tua/wali: ${student.parent_names.join(', ')}`}
          </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-end">
            <p className="text-meta text-muted">Total tagihan · {student.sessions} sesi</p>
            <p className="text-card-title text-base tabular-nums text-text">{formatRupiah(student.total_amount)}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={<Download aria-hidden className="size-4" />}
            loading={download.isPending}
            aria-label={`Unduh invoice PDF ${student.student_name}`}
            onClick={() => download.mutate()}
          >
            Unduh PDF
          </Button>
        </div>
      </div>
      {download.isError && (
        <div className="px-4 pt-3">
          <InlineAlert tone="danger" title="Invoice gagal diunduh">{toApiError(download.error).message}</InlineAlert>
        </div>
      )}
      <DataTable
        caption={`Rincian tagihan ${student.student_name} ${formatPeriod(period)}`}
        columns={columns}
        data={student.lines}
        getRowId={(row) => row.session_id}
        footer={['', 'Total', '', '', '', `${student.sessions} sesi`, <span key="total" className="block text-right tabular-nums">{formatRupiah(student.total_amount)}</span>]}
      />
    </section>
  );
}

/**
 * Penagihan Orang Tua (revisi PM; menggantikan Rekap): sesi yang dihitung per murid dengan tarif per
 * sesi, subtotal, dan total tagihan; invoice PDF per murid dibuat backend.
 */
export function BillingPage() {
  const [period, setPeriod] = usePeriodParam();
  const { values, update } = useSearchState(['student_id'] as const);
  const options = useQuery({ queryKey: queryKeys.admin.attendanceOptions, queryFn: fetchAdminAttendanceOptions });
  const billing = useQuery({
    queryKey: queryKeys.admin.billing(period, values.student_id),
    queryFn: () => fetchBilling(period, values.student_id || undefined),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Penagihan Orang Tua"
        description={`Tagihan les ${formatPeriod(period)} per murid (berdasarkan tanggal les). Hanya sesi Valid dan Perlu revisi yang Disetujui yang ditagihkan.`}
      />

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <PeriodSelector value={period} onChange={setPeriod} hideLabel />
        <FilterSelect
          label="Murid"
          allLabel="Semua murid"
          value={values.student_id}
          onChange={(next) => update({ student_id: next })}
          options={(options.data?.students ?? []).map((student) => ({ value: student.id, label: student.full_name }))}
        />
      </div>

      <QueryView
        query={billing}
        skeleton={
          <>
            <SkeletonStatCards count={3} />
            <div className="rounded-lg border border-border bg-surface shadow-sm">
              <SkeletonDataTable headers={['No', 'Tanggal les', 'Jam', 'Mata pelajaran', 'Tutor', 'Durasi', 'Tarif per sesi']} rows={4} />
            </div>
          </>
        }
      >
        {(data) => (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
              <StatCard index={0} className="col-span-2 lg:col-span-1" icon={ReceiptText} accent="green" label="Total tagihan" count={{ value: Number(data.total_amount), format: (value) => formatRupiah(String(value)) }} />
              <StatCard index={1} icon={CalendarCheck} accent="blue" label="Jumlah sesi ditagih" count={{ value: data.total_sessions }} />
              <StatCard index={2} icon={GraduationCap} accent="violet" label="Murid ditagih" count={{ value: data.students.length }} />
            </dl>
            {data.warnings.length > 0 && (
              <InlineAlert tone="warning" title="Ada sesi yang belum memiliki tarif">
                <ul className="list-disc ps-5">
                  {data.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </InlineAlert>
            )}
            {data.students.length === 0 ? (
              <Card>
                {values.student_id ? (
                  <NoResultsState onReset={() => update({ student_id: '' })} />
                ) : (
                  <EmptyState title="Belum ada tagihan" description={`Belum ada sesi yang ditagihkan pada ${formatPeriod(period)}.`} />
                )}
              </Card>
            ) : (
              <div className={cn('flex flex-col gap-3 transition-opacity duration-200 sm:gap-4 motion-reduce:transition-none', billing.isFetching && 'opacity-60')} aria-busy={billing.isFetching || undefined}>
                {data.students.map((student) => (
                  <StudentInvoice key={student.student_id} student={student} period={data.period} />
                ))}
              </div>
            )}
          </>
        )}
      </QueryView>
    </>
  );
}
