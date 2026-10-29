import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

/**
 * Filter/pagination sebagai search param URL: dapat dibagikan, tahan reload,
 * dan otomatis menjadi bagian query key.
 */
export function useSearchState<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams();
  const values = Object.fromEntries(keys.map((key) => [key, params.get(key) ?? ''])) as Record<K, string>;

  const update = useCallback(
    (patch: Partial<Record<K | 'page', string>>, { resetPage = true } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch) as [string, string | undefined][]) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          if (resetPage && !('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  return { values, page, update };
}
