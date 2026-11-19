// Format tampilan bersama (frontend & invoice PDF backend) agar tanggal/jam konsisten di seluruh aplikasi.

const LOCALE = 'id-ID';

/** "HH:MM" → menit sejak 00:00 (mis. "14:30" → 870). */
export function timeToMinutes(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

/**
 * Tanggal kalender `YYYY-MM-DD` → "17 November 2026" (`long`) atau "17 Nov 2026" (`short`).
 * Diproses sebagai tanggal kalender (UTC) sehingga tidak bergeser karena timezone.
 */
export function formatCalendarDate(isoDate: string, month: 'long' | 'short' = 'long'): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month, year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** Periode `YYYY-MM` → "Oktober 2026". */
export function formatPeriodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

/** Jam les "16:00"–"17:30" → "16.00–17.30 WIB" (pemisah titik sesuai kebiasaan Indonesia). */
export function formatTimeRange(start: string, end: string): string {
  return `${start.replace(':', '.')}–${end.replace(':', '.')} WIB`;
}
