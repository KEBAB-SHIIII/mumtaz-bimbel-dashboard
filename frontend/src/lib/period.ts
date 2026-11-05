import { periodOfDate, todayInBusinessTimeZone, type Period } from '@mumtaz/contracts';

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
