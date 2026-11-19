import { describe, expect, it } from 'vitest';
import { formatLessonDate, formatShortDate, formatTimestamp, humanizeAiText } from './format';

describe('format tanggal & teks AI', () => {
  it('tanggal ISO → tanggal Indonesia dengan bulan lengkap', () => {
    expect(formatLessonDate('2026-11-17')).toBe('17 November 2026');
    expect(formatLessonDate('2026-01-05')).toBe('5 Januari 2026');
    expect(formatShortDate('2026-11-17')).toBe('17 Nov 2026');
    expect(formatTimestamp('2026-11-17T08:32:00Z')).toBe('17 Nov 2026, 15.32 WIB');
  });

  it('kalimat AI memakai tanggal & jam format Indonesia', () => {
    expect(humanizeAiText('pada tanggal 2026-11-17 (pukul 12:00–14:00 WIB (120 menit)).')).toBe(
      'pada tanggal 17 November 2026 (pukul 12.00–14.00 WIB (120 menit)).',
    );
    expect(humanizeAiText('Durasi sesi tercatat 300 menit.')).toBe('Durasi sesi tercatat 300 menit.');
  });
});
