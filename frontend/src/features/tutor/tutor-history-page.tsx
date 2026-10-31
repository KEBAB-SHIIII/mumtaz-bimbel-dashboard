import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, PencilLine } from 'lucide-react';
import { useState } from 'react';
import { sessionStatusSchema, type TutorSession } from '@mumtaz/contracts';
import { SESSION_STATUS_LABELS, StatusBadge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { DataTable } from '../../components/ui/data-table';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/feedback';
import { Select } from '../../components/ui/field';
import { Card, FilterBar, PageHeader } from '../../components/ui/layout-primitives';
import { PeriodSelector } from '../../components/ui/period-selector';
import { formatDuration, formatLessonDate, formatPeriod } from '../../lib/format';
import { usePeriodParam } from '../../lib/period';
import { queryKeys } from '../../lib/query-keys';
import { useSearchState } from '../../lib/use-search-state';
import { fetchAttendanceOptions, fetchTutorAttendance } from './api';
import { TutorSessionDialog } from './tutor-session-dialog';

const PAGE_SIZE = 20;

/** Riwayat Mengajar — hanya sesi milik tutor login (difilter backend dari session). */
export function TutorHistoryPage() {
  const [period, setPeriod] = usePeriodParam();
  const { values, page, update } = useSearchState(['status', 'student_id'] as const);
  const [selected, setSelected] = useState<TutorSession | null>(null);
  const status = sessionStatusSchema.safeParse(values.status).data;
  const filters = { period, status, student_id: values.student_id || undefined, page, page_size: PAGE_SIZE };

  const list = useQuery({
    queryKey: queryKeys.tutor.attendance(filters),
    queryFn: () => fetchTutorAttendance(filters),
    placeholderData: keepPreviousData,
  });
  const options = useQuery({ queryKey: queryKeys.tutor.attendanceOptions, queryFn: fetchAttendanceOptions });
  const studentOptions = (options.data?.students ?? []).map((student) => [student.id, student.full_name] as const);

  const columns: ColumnDef<TutorSession, unknown>[] = [
    { id: 'date', header: 'Tanggal les', cell: ({ row }) => <span className="whitespace-nowrap">{formatLessonDate(row.original.lesson_date)}</span> },
    { accessorKey: 'student_name', header: 'Siswa' },
    { accessorKey: 'grade', header: 'Kelas' },
    { accessorKey: 'subject_name', header: 'Mata pelajaran' },
    { id: 'duration', header: 'Durasi', cell: ({ row }) => <span className="whitespace-nowrap">{formatDuration(row.original.duration_minutes)}</span> },
    { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: 'material', header: 'Materi', cell: ({ row }) => <p className="line-clamp-2 max-w-xs">{row.original.learning_material}</p> },
    {
      id: 'actions',
      meta: { stickyRight: true },
      header: () => <span className="sr-only">Aksi</span>,
      cell: ({ row }) => {
        const needsRevision = row.original.status === 'revision_requested';
        return (
          <Button
            variant={needsRevision ? 'primary' : 'secondary'}
            size="sm"
            icon={needsRevision ? <PencilLine aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
            aria-label={`${needsRevision ? 'Revisi' : 'Detail'} sesi ${row.original.student_name} ${formatLessonDate(row.original.lesson_date)}`}
            onClick={() => setSelected(row.original)}
          >
            {needsRevision ? 'Revisi' : 'Detail'}
          </Button>
        );
      },
    },
  ];

  const hasFilters = Boolean(values.status || values.student_id);

  return (
    <>
      <PageHeader title="Riwayat Mengajar" description={`Sesi Anda pada ${formatPeriod(period)} (berdasarkan tanggal les).`} />
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
        <div className="flex flex-col gap-1.5">
          <label htmlFor="history-student" className="text-sm font-medium text-text">Siswa</label>
          <Select id="history-student" value={values.student_id} onChange={(e) => update({ student_id: e.target.value })} className="w-48">
            <option value="">Semua siswa</option>
            {studentOptions.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
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
            empty={
              <EmptyState
                title="Belum ada sesi"
                description={hasFilters ? 'Tidak ada sesi yang cocok dengan filter.' : `Belum ada sesi pada ${formatPeriod(period)}.`}
              />
            }
          />
        )}
      </Card>
      <TutorSessionDialog key={selected?.id ?? 'none'} session={selected} onClose={() => setSelected(null)} />
    </>
  );
}
