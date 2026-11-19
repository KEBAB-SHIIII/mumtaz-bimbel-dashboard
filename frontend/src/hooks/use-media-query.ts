import { useCallback, useSyncExternalStore } from 'react';

/**
 * Status media query yang reaktif. Dipakai hanya bila struktur DOM harus berbeda (mis. tabel ↔ daftar kartu);
 * untuk sekadar gaya, pakai varian Tailwind. Tanpa `matchMedia` (jsdom) bernilai `fallback`.
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  const getSnapshot = () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : fallback);
  return useSyncExternalStore(subscribe, getSnapshot, () => fallback);
}

/** HP (< 640px, sama dengan batas `sm` Tailwind). */
export const MOBILE_QUERY = '(max-width: 39.999rem)';
