import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { ErrorState } from './feedback';
import { LoadingSwitch } from './skeleton';

/** Bagian hasil TanStack Query yang dibutuhkan untuk memilih state tampilan. */
export interface QueryState<T> {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

interface QueryViewProps<T> {
  query: QueryState<T>;
  /** Skeleton berbentuk konten asli (docs/design/04-components.md § Skeleton). */
  skeleton: ReactNode;
  children: (data: T) => ReactNode;
  /** Wadah isi; default kolom dengan jarak antar kartu 12px (HP) / 16px. */
  className?: string;
  errorTitle?: string;
  /** `false` bila QueryView sudah berada di dalam Card (hindari kartu di dalam kartu). */
  framed?: boolean;
}

/**
 * State wajib halaman (docs/design/05-pages.md): loading pertama → skeleton (delay 150ms, minimal 300ms),
 * error tanpa data → pesan + "Coba lagi", selain itu konten memudar masuk. Refetch tidak kembali ke skeleton.
 */
export function QueryView<T>({ query, skeleton, children, className = 'flex flex-col gap-3 sm:gap-4', errorTitle, framed = true }: QueryViewProps<T>) {
  if (query.isError && query.data === undefined) {
    return (
      <div className={cn(framed && 'rounded-lg border border-border bg-surface shadow-sm')}>
        <ErrorState error={query.error} onRetry={() => void query.refetch()} {...(errorTitle ? { title: errorTitle } : {})} />
      </div>
    );
  }
  const { data } = query;
  return (
    <LoadingSwitch loading={data === undefined} skeleton={skeleton} className={className}>
      {() => (data === undefined ? null : children(data))}
    </LoadingSwitch>
  );
}
