import { BUSINESS_TIME_ZONE, formatCalendarDate, formatPeriodLabel, formatTimeRange } from '@mumtaz/contracts';

const LOCALE = 'id-ID';
const MS_PER_DAY = 86_400_000;

const jakartaIsoDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function toUtcDayMs(isoDate: string): number {
  const [y = 0, m = 1, d = 1] = isoDate.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** `YYYY-MM-DD` → "31 Oktober 2026" (bulan ditulis lengkap agar mudah dibaca). */
export function formatLessonDate(isoDate: string): string {
  return formatCalendarDate(isoDate, 'long');
}

/** `YYYY-MM-DD` → "31 Okt 2026" — versi ringkas untuk kolom tabel yang sempit. */
export function formatShortDate(isoDate: string): string {
  return formatCalendarDate(isoDate, 'short');
}

/**
 * Selisih hari kalender WIB antara `isoDate` (`YYYY-MM-DD`) dan waktu sekarang (`now`):
 * "Hari ini", "Kemarin", "2 hari lalu", "1 minggu lalu", "2 bulan lalu", dst.
 */
export function formatRelativeLessonDate(isoDate: string, now: Date = new Date()): string {
  const todayIso = jakartaIsoDate.format(now);
  const diffDays = Math.round((toUtcDayMs(todayIso) - toUtcDayMs(isoDate)) / MS_PER_DAY);

  if (diffDays === 0) return 'Hari ini';
  if (diffDays === 1) return 'Kemarin';
  if (diffDays > 1 && diffDays < 7) return `${diffDays} hari lalu`;
  if (diffDays >= 7 && diffDays < 30) return `${Math.floor(diffDays / 7)} minggu lalu`;
  if (diffDays >= 30 && diffDays < 365) return `${Math.floor(diffDays / 30)} bulan lalu`;
  if (diffDays >= 365) return `${Math.floor(diffDays / 365)} tahun lalu`;
  if (diffDays === -1) return 'Besok';
  return `${Math.abs(diffDays)} hari lagi`;
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
