import { BUSINESS_TIME_ZONE } from '@mumtaz/contracts';

const LOCALE = 'id-ID';

/** `YYYY-MM-DD` → "31 Okt 2026". Diproses sebagai tanggal kalender (tanpa pergeseran timezone). */
export function formatLessonDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** Timestamp ISO → waktu Asia/Jakarta, mis. "2 Nov 2026, 10.00 WIB". */
export function formatTimestamp(iso: string): string {
  return `${new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BUSINESS_TIME_ZONE,
  }).format(new Date(iso))} WIB`;
}

/** Jam les "16:00"–"17:30" → "16.00–17.30 WIB"; sesi lama tanpa jam → "—". */
export function formatLessonTime(start: string | null, end: string | null): string {
  if (!start || !end) return '—';
  return `${start.replace(':', '.')}–${end.replace(':', '.')} WIB`;
}

/** `YYYY-MM` → "Oktober 2026". */
export function formatPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

const rupiah = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'IDR', maximumFractionDigits: 2, minimumFractionDigits: 0 });

/**
 * String desimal dari backend → "Rp50.000". Hanya format tampilan; nominal tidak
 * dihitung ulang di frontend (docs/04 §1). String diteruskan langsung ke Intl
 * (tanpa konversi float) agar presisi terjaga.
 */
export function formatRupiah(amount: string): string {
  return rupiah.format(amount as unknown as number);
}

export function formatDuration(minutes: number): string {
  return `${minutes} menit`;
}
