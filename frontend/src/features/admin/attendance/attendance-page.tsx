import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, RotateCcw, Search } from 'lucide-react';
import { useState } from 'react';
import { sessionStatusSchema, type AdminAttendanceListItem } from '@mumtaz/contracts';
import { FindingIndicator, SESSION_STATUS_LABELS, StatusBadge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { DataTable, rowNumber } from '../../../components/ui/data-table';
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/feedback';
import { Input, Select } from '../../../components/ui/field';
import { Card, FilterBar, PageHeader } from '../../../components/ui/layout-primitives';
import { PeriodSelector } from '../../../components/ui/period-selector';
import { formatDuration, formatLessonDate, formatPeriod } from '../../../lib/format';
import { usePeriodParam } from '../../../lib/period';
import { queryKeys } from '../../../lib/query-keys';
import { useSearchState } from '../../../lib/use-search-state';
import { fetchAdminAttendance, fetchMasterData, type AttendanceFilters } from '../api';
import { ANALYSIS_POLL_MS } from './analysis-polling';
import { AttendanceDetailDialog } from './attendance-detail-dialog';

const PAGE_SIZE = 20;
const FILTER_KEYS = ['status', 'tutor_id', 'student_id', 'subject_id', 'search'] as const;

/** Opsi filter tutor/siswa/mapel dari Master Data (maks. 100 item; cukup untuk satu bimbel). */
function useFilterOptions() {
  const params = { page: 1, page_size: 100 };
  const tutors = useQuery({ queryKey: queryKeys.admin.masterData('tutors', params), queryFn: () => fetchMasterData('tutors', params) });
  const students = useQuery({ queryKey: queryKeys.admin.masterData('students', params), queryFn: () => fetchMasterData('students', params) });
  const subjects = useQuery({ queryKey: queryKeys.admin.masterData('subjects', params), queryFn: () => fetchMasterData('subjects', params) });
  return {
    tutors: tutors.data?.items.map((t) => ({ id: t.id, label: t.full_name })) ?? [],
    students: students.data?.items.map((s) => ({ id: s.id, label: s.full_name })) ?? [],
    subjects: subjects.data?.items.map((s) => ({ id: s.id, label: s.name })) ?? [],
  };
}

export function AttendancePage() {
  const [period, setPeriod] = usePeriodParam();
  const { values, page, update } = useSearchState(FILTER_KEYS);
  const [searchDraft, setSearchDraft] = useState(values.search);
  const [detailId, setDetailId] = useState<string | null>(null);
  const options = useFilterOptions();

  const status = sessionStatusSchema.safeParse(values.status).data;
  const filters: AttendanceFilters = {
    period,
    page,
    page_size: PAGE_SIZE,
    ...(status ? { status } : {}),
    ...(values.tutor_id ? { tutor_id: values.tutor_id } : {}),
    ...(values.student_id ? { student_id: values.student_id } : {}),
    ...(values.subject_id ? { subject_id: values.subject_id } : {}),
    ...(values.search ? { search: values.search } : {}),
  };
  const list = useQuery({
    queryKey: queryKeys.admin.attendance(filters),
    queryFn: () => fetchAdminAttendance(filters),
    placeholderData: keepPreviousData,
    // Tidak ditampilkan ke Admin; hanya agar temuan baru muncul otomatis setelah analisis selesai.
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => item.anomaly_analysis_status === 'pending') ? ANALYSIS_POLL_MS : false,
  });

  const hasFilters = FILTER_KEYS.some((key) => values[key]);

  // Delapan kolom inti UMKM + status review, indikator anomali, aksi (docs/15 §2.2).
  const columns: ColumnDef<AdminAttendanceListItem, unknown>[] = [
    { id: 'no', header: 'No', cell: ({ row }) => rowNumber(row.index, page, PAGE_SIZE) },
    { accessorKey: 'tutor_name', header: 'Nama tutor' },
    { accessorKey: 'student_name', header: 'Nama murid' },
    { accessorKey: 'grade', header: 'Kelas' },
    { accessorKey: 'school_name', header: 'Asal sekolah' },
    { accessorKey: 'subject_name', header: 'Mata pelajaran' },
    { id: 'lesson_date', header: 'Tanggal les', cell: ({ row }) => <span className="whitespace-nowrap">{formatLessonDate(row.original.lesson_date)}</span> },
    { id: 'duration', header: 'Durasi les', cell: ({ row }) => <span className="whitespace-nowrap">{formatDuration(row.original.duration_minutes)}</span> },
    { id: 'status', header: 'Status review', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      id: 'findings',
      header: 'Temuan anomali',
      cell: ({ row }) => <FindingIndicator count={row.original.findings.filter((f) => f.review_status === 'pending_review').length} />,
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Aksi</span>,
      cell: ({ row }) => (
        <Button
          variant="secondary"
          size="sm"
          icon={<Eye aria-hidden className="size-4" />}
          aria-label={`Lihat detail sesi ${row.original.student_name} ${formatLessonDate(row.original.lesson_date)}`}
          onClick={() => setDetailId(row.original.id)}
        >
          Detail
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Data Absensi" description={`Semua sesi yang disubmit tutor pada ${formatPeriod(period)} (berdasarkan tanggal les).`} />

      <FilterBar>
        <PeriodSelector value={period} onChange={setPeriod} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="filter-status" className="text-sm font-medium text-text">Status</label>
          <Select id="filter-status" value={values.status} onChange={(e) => update({ status: e.target.value })} className="w-48">
            <option value="">Semua status</option>
            {sessionStatusSchema.options.map((option) => (
              <option key={option} value={option}>{SESSION_STATUS_LABELS[option]}</option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="filter-tutor" className="text-sm font-medium text-text">Tutor</label>
          <Select id="filter-tutor" value={values.tutor_id} onChange={(e) => update({ tutor_id: e.target.value })} className="w-44">
            <option value="">Semua tutor</option>
            {options.tutors.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="filter-student" className="text-sm font-medium text-text">Siswa</label>
          <Select id="filter-student" value={values.student_id} onChange={(e) => update({ student_id: e.target.value })} className="w-44">
            <option value="">Semua siswa</option>
            {options.students.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="filter-subject" className="text-sm font-medium text-text">Mata pelajaran</label>
          <Select id="filter-subject" value={values.subject_id} onChange={(e) => update({ subject_id: e.target.value })} className="w-44">
            <option value="">Semua mapel</option>
            {options.subjects.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </Select>
        </div>
        <form
          role="search"
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            update({ search: searchDraft.trim() });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="filter-search" className="text-sm font-medium text-text">Cari</label>
            <Input id="filter-search" type="search" placeholder="Tutor, siswa, mapel, materi" value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} className="w-56" />
          </div>
          <Button type="submit" variant="secondary" icon={<Search aria-hidden className="size-4" />}>Cari</Button>
        </form>
        {hasFilters && (
          <Button
            variant="ghost"
            icon={<RotateCcw aria-hidden className="size-4" />}
            onClick={() => {
              setSearchDraft('');
              update({ status: '', tutor_id: '', student_id: '', subject_id: '', search: '' });
            }}
          >
            Reset filter
          </Button>
        )}
      </FilterBar>

      <Card>
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : (
          <DataTable
            caption={`Data absensi ${formatPeriod(period)}`}
            columns={columns}
            data={list.data.items}
            getRowId={(row) => row.id}
            isFetching={list.isFetching}
            pagination={{ page, pageSize: PAGE_SIZE, total: list.data.total, onPageChange: (next) => update({ page: String(next) }, { resetPage: false }) }}
            empty={
              <EmptyState
                title="Belum ada sesi"
                description={hasFilters ? 'Tidak ada sesi yang cocok dengan filter.' : `Belum ada sesi yang disubmit untuk ${formatPeriod(period)}.`}
              />
            }
          />
        )}
      </Card>

      <AttendanceDetailDialog sessionId={detailId} onClose={() => setDetailId(null)} />
    </>
  );
}
