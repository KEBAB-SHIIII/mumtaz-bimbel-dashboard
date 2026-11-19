import type { ReactNode } from 'react';
import { Pagination } from '../../components/ui/data-display/data-table';
import { useSearchState } from '../../hooks/use-search-state';

const PAGE_SIZE = 12;

export function PaginatedReportList<T>({ items, renderItem }: { items: readonly T[]; renderItem: (item: T) => ReactNode }) {
  const { page, update } = useSearchState([]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(items.length / PAGE_SIZE)));
  const start = (currentPage - 1) * PAGE_SIZE;

  return (
    <>
      {items.slice(start, start + PAGE_SIZE).map(renderItem)}
      {items.length > PAGE_SIZE && (
        <Pagination
          page={currentPage}
          pageSize={PAGE_SIZE}
          total={items.length}
          onPageChange={(next) => update({ page: String(next) })}
        />
      )}
    </>
  );
}
