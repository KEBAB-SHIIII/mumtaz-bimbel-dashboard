import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { sessionStatusSchema, type TutorSession } from '@mumtaz/contracts';
import { SESSION_STATUS_LABELS, StatusBadge } from '../../components/ui/badge';
import { DataTable } from '../../components/ui/data-table';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/feedback';
import { Select } from '../../components/ui/field';
import { Card, FilterBar, PageHeader } from '../../components/ui/layout-primitives';
import { PeriodSelector } from '../../components/ui/period-selector';
import { formatDuration, formatLessonDate, formatPeriod } from '../../lib/format';
import { usePeriodParam } from '../../lib/period';
import { queryKeys } from '../../lib/query-keys';
import { useSearchState } from '../../lib/use-search-state';
import { fetchTutorAttendance } from './api';

const PAGE_SIZE = 20;

/** Riwayat Mengajar — hanya sesi milik tutor login (difilter backend dari session). */
export function TutorHistoryPage() {
  const [period, setPeriod] = usePeriodParam();
  const { values, page, update } = useSearchState(['status'] as const);
  const status = sessionStatusSchema.safeParse(values.status).data;
  const filters = { period, status, page, page_size: PAGE_SIZE };
  const list = useQuery({
    queryKey: queryKeys.tutor.attendance(filters),
    queryFn: () => fetchTutorAttendance(filters),
    placeholderData: keepPreviousData,
  });

  const columns: ColumnDef<TutorSession, unknown>[] = [
    { id: 'date', header: 'Tanggal les', cell: ({ row }) => <span className="whitespace-nowrap">{formatLessonDate(row.original.lesson_date)}</span> },
    { accessorKey: 'student_name', header: 'Siswa' },
    { accessorKey: 'grade', header: 'Kelas' },
    { accessorKey: 'subject_name', header: 'Mata pelajaran' },
    { id: 'duration', header: 'Durasi', cell: ({ row }) => <span className="whitespace-nowrap">{formatDuration(row.original.duration_minutes)}</span> },
    { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      id: 'material',
      header: 'Materi',
      cell: ({ row }) => (
        <div className="max-w-xs">
          <p className="line-clamp-2">{row.original.learning_material}</p>
          {/* Hanya alasan revisi/penolakan yang ditampilkan ke tutor. */}
          {row.original.admin_note && (row.original.status === 'revision_requested' || row.original.status === 'rejected') && (
            <p className="mt-1 text-xs text-info">Catatan Admin: {row.original.admin_note}</p>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Riwayat Mengajar" description={`Sesi Anda pada ${formatPeriod(period)}.`} />
      <FilterBar>
        <PeriodSelector value={period} onChange={setPeriod} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="history-status" className="text-sm font-medium text-text">Status</label>
          <Select id="history-status" value={values.status} onChange={(e) => update({ status: e.target.value })} className="w-48">
            <option value="">Semua status</option>
            {sessionStatusSchema.options.map((option) => (
              <option key={option} value={option}>{SESSION_STATUS_LABELS[option]}</option>
            ))}
          </Select>
        </div>
      </FilterBar>
      <Card>
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : (
          <DataTable
            caption={`Riwayat mengajar ${formatPeriod(period)}`}
            columns={columns}
            data={list.data.items}
            getRowId={(row) => row.id}
            isFetching={list.isFetching}
            pagination={{ page, pageSize: PAGE_SIZE, total: list.data.total, onPageChange: (next) => update({ page: String(next) }, { resetPage: false }) }}
            empty={<EmptyState title="Belum ada sesi" description={`Belum ada sesi pada ${formatPeriod(period)}.`} />}
          />
        )}
      </Card>
    </>
  );
}
