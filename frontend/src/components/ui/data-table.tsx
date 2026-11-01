import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type Header, type RowData } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { m } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { MOBILE_QUERY, useMediaQuery } from '../../lib/use-media-query';
import { AnimatedList, itemEnter } from './animated-list';
import { Button } from './button';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature wajib sama dengan deklarasi TanStack.
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Kolom aksi tetap terlihat di tepi kanan saat tabel digeser horizontal; di kartu HP tampil di pojok kanan atas. */
    stickyRight?: boolean;
    /** Kolom judul kartu di HP. Default: kolom pertama selain `no`. */
    cardTitle?: boolean;
    /** Sembunyikan kolom di tampilan kartu HP (kolom `no` selalu disembunyikan). */
    cardHidden?: boolean;
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
  /** Data sebelumnya tetap tampil (redup + bar progres) saat refetch, bukan kembali ke skeleton. */
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
 * Render sel/header sebagai panggilan fungsi biasa, bukan komponen. `flexRender` memperlakukan fungsi inline
 * sebagai tipe komponen; karena definisi kolom dibuat ulang tiap render, tipe itu selalu baru sehingga isi sel
 * di-remount (tombol kehilangan fokus, dialog tidak bisa mengembalikan fokus ke pemicunya).
 * Konsekuensi: fungsi `cell`/`header` tidak boleh memanggil hook; pakai komponen terpisah (mis. `<ApprovalSelect />`).
 */
function renderSlot<P extends object>(slot: unknown, props: P): ReactNode {
  if (typeof slot === 'function') return (slot as (props: P) => ReactNode)(props);
  return flexRender(slot as Parameters<typeof flexRender>[0], props);
}

/** Bar tipis tak tentu di tepi atas saat data diperbarui. Dekoratif: status sibuk diumumkan lewat `aria-busy`. */
function FetchingBar({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden">
      <div className="h-full w-2/5 animate-progress rounded-full bg-primary motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-60" />
    </div>
  );
}

/**
 * Tabel berbasis TanStack Table dengan pagination server-side.
 * ≥ 640px: tabel; bila lebih lebar dari kartunya, tabel digeser di dalam kartu dengan bayangan tepi sebagai
 * isyarat, dan kolom `meta.stickyRight` (aksi) selalu terlihat. < 640px: daftar kartu (judul + label–nilai).
 */
export function DataTable<T>({ caption, columns, data, getRowId, pagination, empty, isFetching = false, footer }: DataTableProps<T>) {
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table mengelola memoisasi sendiri.
  const table = useReactTable({ data, columns, getRowId, getCoreRowModel: getCoreRowModel(), manualPagination: true });
  const isMobile = useMediaQuery(MOBILE_QUERY);

  if (data.length === 0 && empty) return <>{empty}</>;

  return (
    <div className="relative" aria-busy={isFetching || undefined}>
      <FetchingBar active={isFetching} />
      <div className={cn('transition-opacity duration-200 motion-reduce:transition-none', isFetching && 'opacity-60')}>
        {isMobile ? <CardList table={table} caption={caption} footer={footer} /> : <Table table={table} caption={caption} footer={footer} />}
      </div>
      {pagination && <Pagination {...pagination} />}
    </div>
  );
}

type TableInstance<T> = ReturnType<typeof useReactTable<T>>;

function Table<T>({ table, caption, footer }: { table: TableInstance<T>; caption: string; footer: ReactNode[] | undefined }) {
  const { ref, edges, measure } = useHorizontalOverflow();
  const hasSticky = table.getAllColumns().some((column) => column.columnDef.meta?.stickyRight);
  const stickyClass = (sticky: boolean | undefined) =>
    sticky ? cn('sticky end-0 bg-inherit', edges.right && 'shadow-edge') : undefined;

  return (
    <div className="relative">
      {/* `relative` menahan elemen sr-only (caption) agar tidak melebarkan halaman. */}
      {/* Saat bisa digeser, wadah ikut urutan Tab agar tabel bisa digulir dengan panah keyboard. */}
      <div
        ref={ref}
        onScroll={measure}
        className="relative overflow-x-auto focus-visible:-outline-offset-2"
        {...(edges.left || edges.right ? { tabIndex: 0, role: 'region', 'aria-label': `${caption} (geser horizontal)` } : {})}
      >
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-b border-border bg-surface-muted">
                {group.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    className={cn(
                      'h-10 px-4 text-start text-meta font-medium whitespace-nowrap text-muted',
                      stickyClass(header.column.columnDef.meta?.stickyRight),
                    )}
                  >
                    {header.isPlaceholder ? null : renderSlot(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, index) => (
              <m.tr
                key={row.id}
                {...itemEnter(index)}
                className="border-b border-border bg-surface transition-colors duration-150 last:border-b-0 hover:bg-surface-muted/60 motion-reduce:transition-none"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={cn('h-11 px-4 py-2.5 align-middle text-text', stickyClass(cell.column.columnDef.meta?.stickyRight))}>
                    {renderSlot(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </m.tr>
            ))}
          </tbody>
          {footer && (
            <tfoot>
              <tr className="border-t border-border bg-surface-muted font-semibold">
                {footer.map((cell, index) => (
                  <td key={index} className="h-11 px-4 py-2.5 text-text tabular-nums">{cell}</td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {edges.left && <div aria-hidden className="pointer-events-none absolute inset-y-0 start-0 w-6 bg-linear-to-r from-text/8 to-transparent" />}
      {edges.right && !hasSticky && <div aria-hidden className="pointer-events-none absolute inset-y-0 end-0 w-6 bg-linear-to-l from-text/8 to-transparent" />}
    </div>
  );
}

function headerLabel<T>(header: Header<T, unknown> | undefined) {
  return header && !header.isPlaceholder ? renderSlot(header.column.columnDef.header, header.getContext()) : null;
}

/** Tampilan HP: tiap baris menjadi blok berpemisah garis (tanpa kartu di dalam kartu). Judul di atas, aksi di kanan atas, kolom lain sebagai label–nilai. */
function CardList<T>({ table, caption, footer }: { table: TableInstance<T>; caption: string; footer: ReactNode[] | undefined }) {
  const headers = table.getFlatHeaders();
  const columns = table.getVisibleLeafColumns();
  const titleId =
    columns.find((column) => column.columnDef.meta?.cardTitle)?.id ??
    columns.find((column) => column.id !== 'no' && !column.columnDef.meta?.stickyRight)?.id;
  const isDetail = (id: string, meta: (typeof columns)[number]['columnDef']['meta']) =>
    id !== 'no' && id !== titleId && !meta?.stickyRight && !meta?.cardHidden;
  const headerOf = (id: string) => headers.find((header) => header.column.id === id);

  return (
    <div>
      <AnimatedList
        aria-label={caption}
        className="divide-y divide-border"
        items={table.getRowModel().rows}
        getKey={(row) => row.id}
        renderItem={(row) => {
          const cells = row.getVisibleCells();
          const title = cells.find((cell) => cell.column.id === titleId);
          const actions = cells.filter((cell) => cell.column.columnDef.meta?.stickyRight);
          const details = cells.filter((cell) => isDetail(cell.column.id, cell.column.columnDef.meta));
          return (
            <article className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 text-sm font-semibold break-words text-text">
                  {title && renderSlot(title.column.columnDef.cell, title.getContext())}
                </div>
                {actions.map((cell) => (
                  <div key={cell.id} className="-me-1 -mt-1 shrink-0">
                    {renderSlot(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
              {details.length > 0 && (
                <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2.5">
                  {details.map((cell) => (
                    <div key={cell.id} className="min-w-0">
                      <dt className="text-meta text-muted">{headerLabel(headerOf(cell.column.id))}</dt>
                      <dd className="mt-0.5 text-sm break-words text-text">{renderSlot(cell.column.columnDef.cell, cell.getContext())}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </article>
          );
        }}
      />
      {footer && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-border bg-surface-muted px-4 py-3">
          {footer.map((cell, index) => {
            const column = columns[index];
            if (!column || cell === null || cell === undefined || cell === '' || column.id === 'no') return null;
            return (
              <div key={column.id} className="min-w-0">
                <dt className="text-meta text-muted">{headerLabel(headerOf(column.id))}</dt>
                <dd className="mt-0.5 text-sm font-semibold break-words text-text tabular-nums">{cell}</dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPageChange }: ServerPagination) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-2 border-t border-border px-4 py-2 text-sm text-muted">
      <span className="tabular-nums">
        {from}–{to} dari {total}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label="Halaman sebelumnya" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft aria-hidden className="size-4" />
        </Button>
        <span aria-current="page" className="min-w-12 text-center tabular-nums">
          {page} / {pages}
        </span>
        <Button variant="ghost" size="icon-sm" aria-label="Halaman berikutnya" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
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
