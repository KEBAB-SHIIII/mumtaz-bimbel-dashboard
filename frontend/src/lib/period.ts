import { periodOfDate, todayInBusinessTimeZone, type Period } from '@mumtaz/contracts';

/** Bulan berjalan menurut Asia/Jakarta. */
export function currentPeriod(now: Date = new Date()): Period {
  return periodOfDate(todayInBusinessTimeZone(now));
}

