import { BUSINESS_TIME_ZONE, formatCalendarDate, formatPeriodLabel, formatTimeRange } from '@mumtaz/contracts';

const LOCALE = 'id-ID';

/** `YYYY-MM-DD` → "31 Oktober 2026" (bulan ditulis lengkap agar mudah dibaca). */
export function formatLessonDate(isoDate: string): string {
  return formatCalendarDate(isoDate, 'long');
}

/** `YYYY-MM-DD` → "31 Okt 2026" — versi ringkas untuk kolom tabel yang sempit. */
export function formatShortDate(isoDate: string): string {
  return formatCalendarDate(isoDate, 'short');
}

/**
 * Kalimat dari layanan AI memakai format teknis; ubah ke format Indonesia:
 * "2026-11-17" → "17 November 2026", "12:00" → "12.00".
 */
export function humanizeAiText(text: string): string {
  return text
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, (iso) => formatLessonDate(iso))
    .replace(/\b(\d{2}):(\d{2})\b/g, '$1.$2');
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
  return formatTimeRange(start, end);
}

/** `YYYY-MM` → "Oktober 2026". */
export const formatPeriod = formatPeriodLabel;

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
