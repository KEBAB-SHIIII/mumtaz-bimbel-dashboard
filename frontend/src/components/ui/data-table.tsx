import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Button } from './button';

export interface ServerPagination {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

interface DataTableProps<T> {
  /** Deskripsi tabel untuk pembaca layar. */
  caption: string;
  columns: ColumnDef<T, unknown>[];
  data: T[];
  getRowId: (row: T) => string;
  pagination?: ServerPagination;
  empty?: ReactNode;
  /** Data sebelumnya tetap tampil saat refetch (mis. ganti halaman). */
  isFetching?: boolean;
}

/**
 * Tabel berbasis TanStack Table dengan pagination server-side.
 * Overflow horizontal terkontrol di layar kecil.
 */
export function DataTable<T>({ caption, columns, data, getRowId, pagination, empty, isFetching = false }: DataTableProps<T>) {
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table mengelola memoisasi sendiri.
  const table = useReactTable({ data, columns, getRowId, getCoreRowModel: getCoreRowModel(), manualPagination: true });

  if (data.length === 0 && empty) return <>{empty}</>;

  return (
    <div className={cn('transition-opacity', isFetching && 'opacity-60')} aria-busy={isFetching || undefined}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-b border-border bg-surface-muted">
                {group.headers.map((header) => (
                  <th key={header.id} scope="col" className="px-3 py-2 text-left text-xs font-semibold whitespace-nowrap text-muted">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-surface-muted/60">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2 align-top text-text">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pagination && <Pagination {...pagination} />}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPageChange }: ServerPagination) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-sm text-muted">
      <span>
        {from}–{to} dari {total}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" aria-label="Halaman sebelumnya" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft aria-hidden className="size-4" />
        </Button>
        <span aria-current="page">
          {page} / {pages}
        </span>
        <Button variant="ghost" size="sm" aria-label="Halaman berikutnya" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          <ChevronRight aria-hidden className="size-4" />
        </Button>
      </div>
    </nav>
  );
}

/** Kolom `no` = nomor urut tampilan (bukan ID sesi). */
export function rowNumber(index: number, page = 1, pageSize = 0): number {
  return (page - 1) * pageSize + index + 1;
}
