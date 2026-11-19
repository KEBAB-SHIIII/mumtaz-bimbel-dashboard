import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { periodSchema, type Period } from '@mumtaz/contracts';
import { currentPeriod } from '../lib/period';

/**
 * Periode disimpan di URL (`?period=YYYY-MM`) sehingga dapat dibagikan dan
 * otomatis menjadi bagian query key. Nilai tidak valid jatuh ke bulan berjalan.
 */
export function usePeriodParam(): [Period, (next: Period) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('period');
  const period = raw && periodSchema.safeParse(raw).success ? raw : currentPeriod();

  const setPeriod = useCallback(
    (next: Period) => {
      setParams(
        (prev) => {
          const updated = new URLSearchParams(prev);
          updated.set('period', next);
          updated.delete('page');
          return updated;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  return [period, setPeriod];
}
