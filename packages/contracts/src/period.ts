import { z } from 'zod';
import type { IsoDate } from './common.js';

/** Periode bulanan `YYYY-MM` — selalu berbasis `lesson_date` (docs/05 §4). */
export const periodSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Format periode harus YYYY-MM');

export type Period = z.infer<typeof periodSchema>;

export const periodQuerySchema = z.object({ period: periodSchema });

export interface PeriodDateRange {
  /** Inklusif: `lesson_date >= start`. */
  start: IsoDate;
  /** Eksklusif: `lesson_date < endExclusive` (hari pertama bulan berikutnya). */
  endExclusive: IsoDate;
}

export function periodDateRange(period: Period): PeriodDateRange {
  const [year, month] = periodSchema.parse(period).split('-').map(Number) as [number, number];
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    start: `${period}-01`,
    endExclusive: `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`,
  };
}

/** Periode dari `lesson_date`; operasi string murni agar tidak ada pergeseran timezone. */
export function periodOfDate(lessonDate: IsoDate): Period {
  return lessonDate.slice(0, 7);
}

/** Periode `count` bulan terakhir yang berakhir di `period` (urut lama → baru), mis. 6 bulan untuk grafik. */
export function trailingPeriods(period: Period, count: number): Period[] {
  const [year, month] = period.split('-').map(Number) as [number, number];
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (count - 1 - index), 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

export function isDateInPeriod(lessonDate: IsoDate, period: Period): boolean {
  const { start, endExclusive } = periodDateRange(period);
  return lessonDate >= start && lessonDate < endExclusive;
}

export const BUSINESS_TIME_ZONE = 'Asia/Jakarta';

/** Tanggal kalender hari ini menurut Asia/Jakarta, format `YYYY-MM-DD`. */
export function todayInBusinessTimeZone(now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Working default O-14 (provisional): tanggal les di masa depan (Asia/Jakarta) ditolak. */
export function isFutureLessonDate(lessonDate: IsoDate, now: Date = new Date()): boolean {
  return lessonDate > todayInBusinessTimeZone(now);
}
