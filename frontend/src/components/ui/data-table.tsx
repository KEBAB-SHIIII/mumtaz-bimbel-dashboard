import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type RowData } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Button } from './button';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature wajib sama dengan deklarasi TanStack.
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Kolom aksi tetap terlihat di tepi kanan saat tabel digeser horizontal. */
    stickyRight?: boolean;
  }
}

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
  /** Satu baris ringkasan (mis. total dari backend); sel harus sejajar dengan kolom. */
  footer?: ReactNode[];
}

/** Deteksi apakah konten scroller masih bisa digeser ke kiri/kanan (untuk isyarat visual). */
function useHorizontalOverflow() {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [measure]);
  return { ref, edges, measure };
}

/**
 * Tabel berbasis TanStack Table dengan pagination server-side.
 * Di layar sempit tabel digeser di dalam kartunya sendiri (halaman tidak ikut melebar), dengan
 * bayangan tepi sebagai isyarat masih ada kolom lain; kolom `meta.stickyRight` (aksi) selalu terlihat.
 */
export function DataTable<T>({ caption, columns, data, getRowId, pagination, empty, isFetching = false, footer }: DataTableProps<T>) {
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table mengelola memoisasi sendiri.
  const table = useReactTable({ data, columns, getRowId, getCoreRowModel: getCoreRowModel(), manualPagination: true });
  const { ref, edges, measure } = useHorizontalOverflow();
  const hasSticky = columns.some((column) => column.meta?.stickyRight);
  const stickyClass = (sticky: boolean | undefined) =>
    sticky ? cn('sticky right-0 bg-inherit', edges.right && 'shadow-[-8px_0_8px_-8px_oklch(0_0_0/0.25)]') : undefined;

  if (data.length === 0 && empty) return <>{empty}</>;

  return (
    <div className={cn('transition-opacity', isFetching && 'opacity-60')} aria-busy={isFetching || undefined}>
      <div className="relative">
        {/* `relative` menahan elemen sr-only (caption) agar tidak melebarkan halaman. */}
        <div ref={ref} onScroll={measure} className="relative overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id} className="border-b border-border bg-surface-muted">
                  {group.headers.map((header) => (
                    <th
                      key={header.id}
                      scope="col"
                      className={cn('px-3 py-2 text-left text-xs font-semibold whitespace-nowrap text-muted', stickyClass(header.column.columnDef.meta?.stickyRight))}
                    >
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b border-border bg-surface last:border-b-0 hover:bg-surface-muted">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={cn('px-3 py-2 align-top text-text', stickyClass(cell.column.columnDef.meta?.stickyRight))}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {footer && (
              <tfoot>
                <tr className="border-t-2 border-border bg-surface-muted font-semibold">
                  {footer.map((cell, index) => (
                    <td key={index} className="px-3 py-2 text-text">{cell}</td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {edges.left && <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-linear-to-r from-black/10 to-transparent" />}
        {edges.right && !hasSticky && (
          <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-linear-to-l from-black/10 to-transparent" />
        )}
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
