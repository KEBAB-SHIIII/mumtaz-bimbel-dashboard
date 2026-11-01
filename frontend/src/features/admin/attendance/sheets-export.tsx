import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CircleCheck, CircleX, ExternalLink, FileSpreadsheet, LoaderCircle, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { sheetTitleForPeriod, type ExportRunStatus, type SheetExportResponse, type SheetExportRun } from '@mumtaz/contracts';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { Modal } from '../../../components/ui/dialog';
import { EmptyState, ErrorState, InlineAlert, LoadingState } from '../../../components/ui/feedback';
import { Card } from '../../../components/ui/layout-primitives';
import { toApiError } from '../../../lib/api-error';
import { formatPeriod, formatTimestamp } from '../../../lib/format';
import { queryKeys } from '../../../lib/query-keys';
import { exportAttendanceToSheets, fetchExportHistory } from '../api';

type ExportedRun = SheetExportResponse['export'];

const RUN_STATUS: Record<ExportRunStatus, { label: string; tone: 'success' | 'danger' | 'info'; icon: typeof CircleCheck }> = {
  running: { label: 'Berjalan', tone: 'info', icon: LoaderCircle },
  succeeded: { label: 'Berhasil', tone: 'success', icon: CircleCheck },
  failed: { label: 'Gagal', tone: 'danger', icon: CircleX },
};

function SpreadsheetLink({ href, children = 'Buka spreadsheet' }: { href: string; children?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
      {children}
      <ExternalLink aria-hidden className="size-3.5" />
    </a>
  );
}

interface DialogState {
  period: string;
  /** Server minta konfirmasi kedua: periode kosong akan mengganti tab yang berisi. */
  emptyReplaceMessage: string | null;
}

/**
 * Ekspor absensi bulanan ke Google Sheets (docs/16, docs/15 Rekap). Hanya berjalan atas klik Admin,
 * setelah konfirmasi; mencakup SEMUA submission bulan tersebut (O-08). Tombol terkunci selama proses
 * berjalan; kunci server per periode mencegah ekspor ganda dari tab/perangkat lain.
 */
export function useSheetsExport() {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [lastResult, setLastResult] = useState<ExportedRun | null>(null);

  const mutation = useMutation({
    mutationFn: exportAttendanceToSheets,
    onSuccess: (run) => {
      setLastResult(run);
      setDialog(null);
    },
    onError: (error, variables) => {
      const apiError = toApiError(error);
      if (apiError.code === 'EMPTY_EXPORT_CONFIRMATION_REQUIRED') {
        setDialog({ period: variables.period, emptyReplaceMessage: apiError.message });
        mutation.reset();
      }
    },
    // Run gagal juga tercatat di riwayat.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.admin.exportHistory }),
  });

  const open = (period: string) => {
    mutation.reset();
    setLastResult(null);
    setDialog({ period, emptyReplaceMessage: null });
  };

  return { dialog, setDialog, mutation, lastResult, open };
}

type SheetsExport = ReturnType<typeof useSheetsExport>;

export function SheetsExportButton({ exporter, period }: { exporter: SheetsExport; period: string }) {
  return (
    // Ringkas di toolbar: teks terlihat "Ekspor", nama aksesibel lengkap (diawali teks yang terlihat).
    <Button
      variant="secondary"
      icon={<FileSpreadsheet aria-hidden className="size-4 text-primary" />}
      loading={exporter.mutation.isPending}
      aria-label="Ekspor Absensi Bulanan ke Google Sheets"
      title="Ekspor absensi bulanan ke Google Sheets"
      onClick={() => exporter.open(period)}
    >
      <span className="max-sm:sr-only">Ekspor</span>
    </Button>
  );
}

export function SheetsExportDialog({ exporter, totalSessions }: { exporter: SheetsExport; totalSessions: number | undefined }) {
  const { dialog, setDialog, mutation } = exporter;
  const running = mutation.isPending;
  const close = () => {
    if (!running) setDialog(null);
  };
  if (!dialog) return null;

  const title = sheetTitleForPeriod(dialog.period);
  const confirmEmpty = dialog.emptyReplaceMessage !== null;
  const submit = () => mutation.mutate({ period: dialog.period, confirm_empty_replace: confirmEmpty });

  return (
    <Modal
      open
      onClose={close}
      title={confirmEmpty ? 'Ganti isi tab dengan laporan kosong?' : 'Ekspor absensi ke Google Sheets'}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={running}>
            Batal
          </Button>
          <Button variant={confirmEmpty ? 'danger' : 'primary'} onClick={submit} loading={running}>
            {confirmEmpty ? 'Ya, ganti dengan laporan kosong' : 'Ekspor sekarang'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-muted">Periode</dt>
          <dd className="font-medium text-text">{formatPeriod(dialog.period)}</dd>
          <dt className="text-muted">Tab tujuan</dt>
          <dd className="font-medium text-text">{title}</dd>
          {totalSessions !== undefined && (
            <>
              <dt className="text-muted">Total submission</dt>
              <dd className="font-medium text-text">{totalSessions}</dd>
            </>
          )}
        </dl>
        {confirmEmpty ? (
          <InlineAlert tone="warning" title="Konfirmasi diperlukan">
            {dialog.emptyReplaceMessage}
          </InlineAlert>
        ) : (
          <InlineAlert tone="warning">
            Laporan ini mencakup semua submission pada bulan terpilih, termasuk data yang belum disetujui.
          </InlineAlert>
        )}
        <p className="text-muted">
          Isi tab {title} akan diganti seluruhnya (tidak menambah baris ganda). Kolom: no, nama tutor, nama murid, kelas, asal
          sekolah, mata pelajaran, tanggal les, durasi les.
        </p>
        {mutation.isError && (
          <InlineAlert tone="danger" title="Ekspor gagal">
            {toApiError(mutation.error).message}
          </InlineAlert>
        )}
      </div>
    </Modal>
  );
}

export function SheetsExportResult({ exporter }: { exporter: SheetsExport }) {
  const run = exporter.lastResult;
  if (!run) return null;
  return (
    <InlineAlert tone="success" title="Ekspor berhasil">
      {run.records_exported} baris ditulis ke tab {run.sheet_title}. <SpreadsheetLink href={run.spreadsheet_url} />
    </InlineAlert>
  );
}

export function SheetsExportHistory({ exporter }: { exporter: SheetsExport }) {
  const history = useQuery({
    queryKey: queryKeys.admin.exportHistory,
    queryFn: () => fetchExportHistory({ page_size: 10 }),
  });

  const columns: ColumnDef<SheetExportRun, unknown>[] = [
    { id: 'started', header: 'Waktu', cell: ({ row }) => formatTimestamp(row.original.started_at) },
    { id: 'period', header: 'Periode', cell: ({ row }) => formatPeriod(row.original.period) },
    { accessorKey: 'sheet_title', header: 'Tab' },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const config = RUN_STATUS[row.original.status];
        return (
          <Badge tone={config.tone} icon={config.icon}>
            {config.label}
          </Badge>
        );
      },
    },
    { accessorKey: 'records_exported', header: 'Baris' },
    {
      id: 'detail',
      header: 'Keterangan',
      cell: ({ row }) => {
        const run = row.original;
        if (run.status === 'succeeded') return <SpreadsheetLink href={run.spreadsheet_url}>Buka</SpreadsheetLink>;
        if (run.status === 'running') return <span className="text-muted">Sedang diproses…</span>;
        return (
          <div className="flex flex-col items-start gap-1">
            <span className="text-muted">{run.safe_error_message ?? 'Ekspor gagal.'}</span>
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw aria-hidden className="size-3.5" />}
              disabled={exporter.mutation.isPending}
              onClick={() => exporter.open(run.period)}
            >
              Coba lagi
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <Card title="Riwayat ekspor Google Sheets (10 terakhir)">
      {history.isPending ? (
        <LoadingState />
      ) : history.isError ? (
        <ErrorState error={history.error} onRetry={() => void history.refetch()} />
      ) : (
        <DataTable
          caption="Riwayat ekspor Google Sheets"
          columns={columns}
          data={history.data.items}
          getRowId={(row) => row.id}
          isFetching={history.isFetching}
          empty={<EmptyState title="Belum ada ekspor" description="Ekspor pertama akan tercatat di sini." />}
        />
      )}
    </Card>
  );
}
