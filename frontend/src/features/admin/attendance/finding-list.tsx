import type { FindingType } from '@mumtaz/contracts';

/**
 * Label jenis anomali (dialog detail Admin).
 * Diselaraskan dengan ke-4 nilai enum `finding_type` di PostgreSQL yang dipetakan dari
 * seluruh aturan bisnis model ML FastAPI:
 * - `suspected_duplicate`: duplikat persis (rejected) maupun duplikat samar beda jam (needs_revision)
 * - `duration_outlier`: durasi di luar rentang normal 30–180 menit (< 30 atau > 180)
 * - `late_start`: jam mulai di luar jam operasional 07:00–21:00 (< 07:00 atau > 21:00)
 * - `unusual_pattern`: jadwal bentrok (tutor/murid/sendiri) atau pola tidak biasa lainnya
 */
export const FINDING_LABEL: Record<FindingType, string> = {
  suspected_duplicate: 'Data duplikat',
  duration_outlier: 'Durasi di luar batas (30–180 menit)',
  late_start: 'Jam mulai di luar jam operasional',
  unusual_pattern: 'Jadwal bentrok / pola tidak biasa',
};
