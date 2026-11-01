import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, Plus, RotateCcw, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  approvalStatusSchema,
  sessionValiditySchema,
  type AdminAttendanceDetail,
  type AdminAttendanceListItem,
} from '@mumtaz/contracts';
import { APPROVAL_LABELS, ValidityBadge, VALIDITY_LABELS } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { DataTable, rowNumber } from '../../../components/ui/data-table';
import { ConfirmDialog } from '../../../components/ui/dialog';
import { EmptyState, ErrorState, InlineAlert, NoResultsState } from '../../../components/ui/feedback';
import { Select } from '../../../components/ui/field';
import { Card, PageHeader } from '../../../components/ui/layout-primitives';
import { FilterSelect } from '../../../components/ui/filter-select';
import { PeriodSelector } from '../../../components/ui/period-selector';
import { SearchInput } from '../../../components/ui/search-input';
import { LoadingSwitch, SkeletonDataTable } from '../../../components/ui/skeleton';
import { toApiError } from '../../../lib/api-error';
import { formatDuration, formatLessonDate, formatLessonTime, formatPeriod } from '../../../lib/format';
import { usePeriodParam } from '../../../lib/period';
import { queryKeys } from '../../../lib/query-keys';
import { useSearchState } from '../../../lib/use-search-state';
import { deleteAttendance, fetchAdminAttendance, fetchAdminAttendanceOptions, setAttendanceValidity, type AttendanceFilters } from '../api';
import { ANALYSIS_POLL_MS } from './analysis-polling';
import { AttendanceDetailDialog } from './attendance-detail-dialog';
import { FINDING_LABEL } from './finding-list';
import { SessionFormDialog } from './session-form-dialog';
import { SheetsExportButton, SheetsExportDialog, SheetsExportHistory, SheetsExportResult, useSheetsExport } from './sheets-export';

const PAGE_SIZE = 20;
const FILTER_KEYS = ['validity', 'tutor_id', 'student_id', 'subject_id', 'search'] as const;
const VALIDITY_FILTERS = [...sessionValiditySchema.options, 'unvalidated'] as const;
const TABLE_HEADERS = ['No', 'Tanggal & jam', 'Nama tutor', 'Nama murid', 'Mata pelajaran', 'Durasi', 'Validitas data', 'Temuan', 'Status approval', ''];

/** Status approval — hanya untuk sesi Perlu revisi; dipilih manual Admin (hasil banding via WA). */
function ApprovalSelect({ item }: { item: AdminAttendanceListItem }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (approval: string) =>
      setAttendanceValidity(item.id, { validity: 'needs_revision', approval: approvalStatusSchema.parse(approval) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
  if (item.validity !== 'needs_revision' || !item.approval_status) return <span className="text-meta text-muted">—</span>;
  return (
    <div className="flex flex-col gap-1">
      <Select
        aria-label={`Status approval sesi ${item.student_name} ${formatLessonDate(item.lesson_date)}`}
        value={mutation.isPending ? (mutation.variables ?? item.approval_status) : item.approval_status}
        disabled={mutation.isPending}
        onChange={(event) => mutation.mutate(event.target.value)}
        className="min-w-40"
      >
        {approvalStatusSchema.options.map((option) => (
          <option key={option} value={option}>{APPROVAL_LABELS[option]}</option>
        ))}
      </Select>
      {mutation.isError && <span role="alert" className="text-meta text-danger">{toApiError(mutation.error).message}</span>}
    </div>
  );
}

export function AttendancePage() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = usePeriodParam();
  const { values, page, update } = useSearchState(FILTER_KEYS);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState<{ session: AdminAttendanceDetail | null } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; label: string } | null>(null);
  const exporter = useSheetsExport();
  const options = useQuery({ queryKey: queryKeys.admin.attendanceOptions, queryFn: fetchAdminAttendanceOptions });

  const validity = VALIDITY_FILTERS.find((option) => option === values.validity);
  const filters: AttendanceFilters = {
    period,
    page,
    page_size: PAGE_SIZE,
    ...(validity ? { validity } : {}),
    ...(values.tutor_id ? { tutor_id: values.tutor_id } : {}),
    ...(values.student_id ? { student_id: values.student_id } : {}),
    ...(values.subject_id ? { subject_id: values.subject_id } : {}),
    ...(values.search ? { search: values.search } : {}),
  };
  const list = useQuery({
    queryKey: queryKeys.admin.attendance(filters),
    queryFn: () => fetchAdminAttendance(filters),
    placeholderData: keepPreviousData,
    // Hasil validasi AI muncul otomatis setelah analisis selesai.
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => item.anomaly_analysis_status === 'pending') ? ANALYSIS_POLL_MS : false,
  });

  const removal = useMutation({
    mutationFn: (id: string) => deleteAttendance(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.admin.attendanceDetail(id) });
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      if (detailId === id) setDetailId(null);
      setDeleting(null);
    },
  });

  const hasFilters = FILTER_KEYS.some((key) => values[key]);
  const resetFilters = () => update({ validity: '', tutor_id: '', student_id: '', subject_id: '', search: '' });
  const sessionLabel = (row: { student_name: string; lesson_date: string }) => `${row.student_name} ${formatLessonDate(row.lesson_date)}`;

  const columns: ColumnDef<AdminAttendanceListItem, unknown>[] = [
    { id: 'no', header: 'No', cell: ({ row }) => rowNumber(row.index, page, PAGE_SIZE) },
    {
      id: 'lesson_date',
      header: 'Tanggal & jam',
      cell: ({ row }) => (
        <div className="whitespace-nowrap">
          <p>{formatLessonDate(row.original.lesson_date)}</p>
          <p className="text-meta text-muted">{formatLessonTime(row.original.start_time, row.original.end_time)}</p>
        </div>
      ),
    },
    { accessorKey: 'tutor_name', header: 'Nama tutor' },
    {
      id: 'student',
      header: 'Nama murid',
      meta: { cardTitle: true },
      cell: ({ row }) => (
        <div className="max-w-52 min-w-0">
          <p className="truncate" title={row.original.student_name}>{row.original.student_name}</p>
          <p className="truncate text-meta text-muted" title={`${row.original.grade} · ${row.original.school_name}`}>
            {row.original.grade} · {row.original.school_name}
          </p>
        </div>
      ),
    },
    { accessorKey: 'subject_name', header: 'Mata pelajaran' },
    { id: 'duration', header: 'Durasi', cell: ({ row }) => <span className="whitespace-nowrap">{formatDuration(row.original.duration_minutes)}</span> },
    { id: 'validity', header: 'Validitas data', cell: ({ row }) => <ValidityBadge validity={row.original.validity} /> },
    {
      id: 'findings',
      header: 'Temuan',
      cell: ({ row }) => {
        const labels = [...new Set(row.original.findings.filter((f) => f.review_status !== 'superseded').map((f) => FINDING_LABEL[f.finding_type]))];
        return labels.length === 0 ? <span className="text-meta text-muted">—</span> : <p className="max-w-48 min-w-32 text-meta text-text">{labels.join(', ')}</p>;
      },
    },
    { id: 'approval', header: 'Status approval', cell: ({ row }) => <ApprovalSelect item={row.original} /> },
    {
      id: 'actions',
      header: () => <span className="sr-only">Aksi</span>,
      meta: { stickyRight: true },
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            icon={<Eye aria-hidden className="size-4" />}
            title="Detail sesi"
            aria-label={`Detail sesi ${sessionLabel(row.original)}`}
            onClick={() => setDetailId(row.original.id)}
          >
            Detail
          </Button>
          {row.original.validity === 'rejected' && (
            <Button
              variant="ghost"
              size="icon-sm"
              title="Hapus sesi"
              aria-label={`Hapus sesi ${sessionLabel(row.original)}`}
              onClick={() => setDeleting({ id: row.original.id, label: sessionLabel(row.original) })}
            >
              <Trash2 aria-hidden className="size-4 text-danger" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Data Absensi"
        description={`Sesi ${formatPeriod(period)} berdasarkan tanggal les, divalidasi otomatis oleh AI. Hanya Valid dan Perlu revisi yang Disetujui masuk rekap gaji.`}
      />
      <SheetsExportResult exporter={exporter} />
      <SheetsExportDialog
        exporter={exporter}
        totalSessions={!hasFilters && list.data && exporter.dialog?.period === period ? list.data.total : undefined}
      />

      {/* Toolbar ringkas: baris 1 cari + periode + aksi, baris 2 chip filter. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div role="search" className="w-full sm:w-auto sm:min-w-44 sm:flex-1 lg:max-w-sm">
            <label htmlFor="filter-search" className="sr-only">Cari sesi</label>
            <SearchInput id="filter-search" value={values.search} onChange={(search) => update({ search })} placeholder="Cari tutor, siswa, mapel, materi" className="sm:w-full" />
          </div>
          <PeriodSelector value={period} onChange={setPeriod} hideLabel />
          <div className="ms-auto flex shrink-0 items-center gap-2">
            <SheetsExportButton exporter={exporter} period={period} />
            <Button icon={<Plus aria-hidden className="size-4" />} onClick={() => setForm({ session: null })}>
              <span className="max-sm:sr-only">Tambah sesi</span>
            </Button>
          </div>
        </div>
        <div role="group" aria-label="Filter sesi" className="flex flex-wrap items-center gap-2">
          <SlidersHorizontal aria-hidden className="me-0.5 size-4 shrink-0 text-muted max-sm:hidden" />
          <FilterSelect
            label="Validitas"
            allLabel="Semua validitas"
            value={values.validity}
            onChange={(next) => update({ validity: next })}
            options={VALIDITY_FILTERS.map((option) => ({ value: option, label: VALIDITY_LABELS[option] }))}
          />
          <FilterSelect
            label="Tutor"
            allLabel="Semua tutor"
            value={values.tutor_id}
            onChange={(next) => update({ tutor_id: next })}
            options={(options.data?.tutors ?? []).map((o) => ({ value: o.id, label: o.full_name }))}
          />
          <FilterSelect
            label="Siswa"
            allLabel="Semua siswa"
            value={values.student_id}
            onChange={(next) => update({ student_id: next })}
            options={(options.data?.students ?? []).map((o) => ({ value: o.id, label: o.full_name }))}
          />
          <FilterSelect
            label="Mapel"
            allLabel="Semua mapel"
            value={values.subject_id}
            onChange={(next) => update({ subject_id: next })}
            options={(options.data?.subjects ?? []).map((o) => ({ value: o.id, label: o.name }))}
          />
          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium text-primary transition-colors duration-150 animate-pop-in hover:bg-primary-subtle pointer-coarse:h-11 motion-reduce:animate-none motion-reduce:transition-none"
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Reset filter
            </button>
          )}
        </div>
      </div>

      <Card>
        {list.isError && !list.data ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : (
          <LoadingSwitch loading={!list.data} skeleton={<SkeletonDataTable headers={TABLE_HEADERS} />}>
            {() =>
              list.data && (
                <DataTable
                  caption={`Data absensi ${formatPeriod(period)}`}
                  columns={columns}
                  data={list.data.items}
                  getRowId={(row) => row.id}
                  isFetching={list.isFetching}
                  pagination={{ page, pageSize: PAGE_SIZE, total: list.data.total, onPageChange: (next) => update({ page: String(next) }, { resetPage: false }) }}
                  empty={
                    hasFilters ? (
                      <NoResultsState query={values.search || undefined} onReset={resetFilters} />
                    ) : (
                      <EmptyState
                        title="Belum ada sesi"
                        description={`Belum ada sesi untuk ${formatPeriod(period)}. Sesi muncul di sini setelah tutor mengisi absensi, atau tambahkan manual.`}
                        action={<Button size="sm" icon={<Plus aria-hidden className="size-4" />} onClick={() => setForm({ session: null })}>Tambah sesi</Button>}
                      />
                    )
                  }
                />
              )
            }
          </LoadingSwitch>
        )}
      </Card>

      <SheetsExportHistory exporter={exporter} />

      <AttendanceDetailDialog
        sessionId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={(detail) => setForm({ session: detail })}
        onDelete={(detail) => setDeleting({ id: detail.id, label: sessionLabel(detail) })}
      />
      {form && <SessionFormDialog key={form.session?.id ?? 'new'} session={form.session} onClose={() => setForm(null)} />}
      {deleting && (
        <ConfirmDialog
          open
          onClose={() => {
            setDeleting(null);
            removal.reset();
          }}
          onConfirm={() => removal.mutate(deleting.id)}
          title="Hapus sesi?"
          description={`Sesi ${deleting.label} dan temuannya dihapus permanen dari database. Tindakan ini tidak dapat dibatalkan.`}
          confirmLabel="Hapus"
          tone="danger"
          loading={removal.isPending}
        >
          {removal.isError && <InlineAlert tone="danger" title={toApiError(removal.error).message} />}
        </ConfirmDialog>
      )}
    </>
  );
}
