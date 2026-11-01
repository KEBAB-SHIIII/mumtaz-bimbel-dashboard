import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
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
import { EmptyState, ErrorState, InlineAlert, LoadingState } from '../../../components/ui/feedback';
import { Input, Select } from '../../../components/ui/field';
import { Card, FilterBar, PageHeader } from '../../../components/ui/layout-primitives';
import { PeriodSelector } from '../../../components/ui/period-selector';
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

/** Status approval — hanya untuk sesi Perlu revisi; dipilih manual Admin (hasil banding via WA). */
function ApprovalSelect({ item }: { item: AdminAttendanceListItem }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (approval: string) =>
      setAttendanceValidity(item.id, { validity: 'needs_revision', approval: approvalStatusSchema.parse(approval) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
  if (item.validity !== 'needs_revision' || !item.approval_status) return <span className="text-xs text-muted">—</span>;
  return (
    <div className="flex flex-col gap-1">
      <Select
        aria-label={`Status approval sesi ${item.student_name} ${formatLessonDate(item.lesson_date)}`}
        value={mutation.isPending ? (mutation.variables ?? item.approval_status) : item.approval_status}
        disabled={mutation.isPending}
        onChange={(event) => mutation.mutate(event.target.value)}
        className="h-9 min-w-40"
      >
        {approvalStatusSchema.options.map((option) => (
          <option key={option} value={option}>{APPROVAL_LABELS[option]}</option>
        ))}
      </Select>
      {mutation.isError && <span role="alert" className="text-xs text-danger">{toApiError(mutation.error).message}</span>}
    </div>
  );
}

export function AttendancePage() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = usePeriodParam();
  const { values, page, update } = useSearchState(FILTER_KEYS);
  const [searchDraft, setSearchDraft] = useState(values.search);
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
  const sessionLabel = (row: { student_name: string; lesson_date: string }) => `${row.student_name} ${formatLessonDate(row.lesson_date)}`;

  const columns: ColumnDef<AdminAttendanceListItem, unknown>[] = [
    { id: 'no', header: 'No', cell: ({ row }) => rowNumber(row.index, page, PAGE_SIZE) },
    {
      id: 'lesson_date',
      header: 'Tanggal & jam',
      cell: ({ row }) => (
        <div className="whitespace-nowrap">
          <p>{formatLessonDate(row.original.lesson_date)}</p>
          <p className="text-xs text-muted">{formatLessonTime(row.original.start_time, row.original.end_time)}</p>
        </div>
      ),
    },
    { accessorKey: 'tutor_name', header: 'Nama tutor' },
    {
      id: 'student',
      header: 'Nama murid',
      cell: ({ row }) => (
        <div>
          <p>{row.original.student_name}</p>
          <p className="text-xs text-muted">{row.original.grade} · {row.original.school_name}</p>
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
        return labels.length === 0 ? <span className="text-xs text-muted">—</span> : <p className="max-w-48 text-xs text-text">{labels.join(', ')}</p>;
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
            aria-label={`Detail sesi ${sessionLabel(row.original)}`}
            onClick={() => setDetailId(row.original.id)}
          >
            Detail
          </Button>
          {row.original.validity === 'rejected' && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 aria-hidden className="size-4" />}
              aria-label={`Hapus sesi ${sessionLabel(row.original)}`}
              onClick={() => setDeleting({ id: row.original.id, label: sessionLabel(row.original) })}
            >
              Hapus
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
        description={`Sesi ${formatPeriod(period)} (berdasarkan tanggal les). Divalidasi otomatis oleh AI; hanya Valid dan Perlu revisi yang Disetujui masuk rekap gaji.`}
        actions={
          <>
            <SheetsExportButton exporter={exporter} period={period} />
            <Button icon={<Plus aria-hidden className="size-4" />} onClick={() => setForm({ session: null })}>Tambah sesi</Button>
          </>
        }
      />
      <SheetsExportResult exporter={exporter} />
      <SheetsExportDialog
        exporter={exporter}
        totalSessions={!hasFilters && list.data && exporter.dialog?.period === period ? list.data.total : undefined}
      />

      <FilterBar>
        <PeriodSelector value={period} onChange={setPeriod} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="filter-validity" className="text-sm font-medium text-text">Validitas</label>
          <Select id="filter-validity" value={values.validity} onChange={(e) => update({ validity: e.target.value })} className="w-48">
            <option value="">Semua validitas</option>
            {VALIDITY_FILTERS.map((option) => (
              <option key={option} value={option}>{VALIDITY_LABELS[option]}</option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="filter-tutor" className="text-sm font-medium text-text">Tutor</label>
          <Select id="filter-tutor" value={values.tutor_id} onChange={(e) => update({ tutor_id: e.target.value })} className="w-44">
            <option value="">Semua tutor</option>
            {options.data?.tutors.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="filter-student" className="text-sm font-medium text-text">Siswa</label>
          <Select id="filter-student" value={values.student_id} onChange={(e) => update({ student_id: e.target.value })} className="w-44">
            <option value="">Semua siswa</option>
            {options.data?.students.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="filter-subject" className="text-sm font-medium text-text">Mata pelajaran</label>
          <Select id="filter-subject" value={values.subject_id} onChange={(e) => update({ subject_id: e.target.value })} className="w-44">
            <option value="">Semua mapel</option>
            {options.data?.subjects.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
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
              update({ validity: '', tutor_id: '', student_id: '', subject_id: '', search: '' });
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
                description={hasFilters ? 'Tidak ada sesi yang cocok dengan filter.' : `Belum ada sesi untuk ${formatPeriod(period)}.`}
              />
            }
          />
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
