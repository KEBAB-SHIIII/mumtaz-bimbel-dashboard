import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { FileSpreadsheet } from 'lucide-react';
import { Link } from 'react-router';
import { recapGroupBySchema, type RecapGroup, type RecapGroupBy } from '@mumtaz/contracts';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { EmptyState, ErrorState, InlineAlert, LoadingState } from '../../../components/ui/feedback';
import { Select } from '../../../components/ui/field';
import { Card, FilterBar, PageHeader } from '../../../components/ui/layout-primitives';
import { PeriodSelector } from '../../../components/ui/period-selector';
import { formatDuration, formatPeriod } from '../../../lib/format';
import { usePeriodParam } from '../../../lib/period';
import { queryKeys } from '../../../lib/query-keys';
import { useSearchState } from '../../../lib/use-search-state';
import { fetchRecap } from '../api';

const GROUP_LABEL: Record<RecapGroupBy, string> = { tutor: 'Tutor', student: 'Siswa', subject: 'Mata pelajaran' };
const DRILLDOWN_PARAM: Record<RecapGroupBy, string> = { tutor: 'tutor_id', student: 'student_id', subject: 'subject_id' };

export function RecapPage() {
  const [period, setPeriod] = usePeriodParam();
  const { values, update } = useSearchState(['group_by'] as const);
  const groupBy = recapGroupBySchema.safeParse(values.group_by).data ?? 'tutor';

  const recap = useQuery({
    queryKey: queryKeys.admin.recap(period, groupBy),
    queryFn: () => fetchRecap(period, groupBy),
    placeholderData: keepPreviousData,
  });

  const columns: ColumnDef<RecapGroup, unknown>[] = [
    {
      id: 'key',
      header: GROUP_LABEL[groupBy],
      cell: ({ row }) => (
        <Link
          className="font-medium text-primary hover:underline"
          to={`/admin/absensi?period=${period}&${DRILLDOWN_PARAM[groupBy]}=${row.original.key_id}`}
        >
          {row.original.key_label}
        </Link>
      ),
    },
    { accessorKey: 'total_sessions', header: 'Total sesi' },
    { accessorKey: 'approved_sessions', header: 'Disetujui' },
    { accessorKey: 'pending_sessions', header: 'Menunggu' },
    { accessorKey: 'revision_requested_sessions', header: 'Perlu revisi' },
    { accessorKey: 'rejected_sessions', header: 'Ditolak' },
    { id: 'duration', header: 'Durasi disetujui', cell: ({ row }) => formatDuration(row.original.approved_duration_minutes) },
  ];

  return (
    <>
      <PageHeader
        title="Rekap"
        description={`Ringkasan sesi ${formatPeriod(period)} per ${GROUP_LABEL[groupBy].toLowerCase()} (berdasarkan tanggal les).`}
        actions={
          <Button variant="secondary" disabled icon={<FileSpreadsheet aria-hidden className="size-4" />} title="Belum tersedia">
            Ekspor Absensi Bulanan ke Google Sheets
          </Button>
        }
      />
      <InlineAlert tone="info" title="Ekspor Google Sheets belum tersedia">
        Fitur ekspor bulanan sedang disiapkan. Ekspor hanya dijalankan atas tindakan Admin dan berisi delapan kolom absensi.
      </InlineAlert>

      <FilterBar>
        <PeriodSelector value={period} onChange={setPeriod} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="group-by" className="text-sm font-medium text-text">Kelompokkan per</label>
          <Select id="group-by" value={groupBy} onChange={(e) => update({ group_by: e.target.value })} className="w-48">
            {recapGroupBySchema.options.map((option) => (
              <option key={option} value={option}>{GROUP_LABEL[option]}</option>
            ))}
          </Select>
        </div>
      </FilterBar>

      <Card>
        {recap.isPending ? (
          <LoadingState />
        ) : recap.isError ? (
          <ErrorState error={recap.error} onRetry={() => void recap.refetch()} />
        ) : (
          <DataTable
            caption={`Rekap ${formatPeriod(period)} per ${GROUP_LABEL[groupBy]}`}
            columns={columns}
            data={recap.data.groups}
            getRowId={(row) => row.key_id}
            isFetching={recap.isFetching}
            empty={<EmptyState title="Belum ada sesi" description={`Belum ada sesi untuk ${formatPeriod(period)}.`} />}
          />
        )}
      </Card>
    </>
  );
}
