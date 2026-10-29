import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { periodOfDate, periodSchema, todayInBusinessTimeZone, type Period } from '@mumtaz/contracts';

/** Bulan berjalan menurut Asia/Jakarta. */
export function currentPeriod(now: Date = new Date()): Period {
  return periodOfDate(todayInBusinessTimeZone(now));
}

export function shiftPeriod(period: Period, months: number): Period {
  const [y, m] = period.split('-').map(Number) as [number, number];
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

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
