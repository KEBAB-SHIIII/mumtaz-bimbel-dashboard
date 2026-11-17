import { describe, expect, it } from 'vitest';
import { formatLongDate, humanizeAiText } from './format';

describe('format tanggal & teks AI', () => {
  it('tanggal ISO → tanggal Indonesia dengan bulan lengkap', () => {
    expect(formatLongDate('2026-11-17')).toBe('17 November 2026');
    expect(formatLongDate('2026-01-05')).toBe('5 Januari 2026');
  });

  it('kalimat AI memakai tanggal & jam format Indonesia', () => {
    expect(humanizeAiText('pada tanggal 2026-11-17 (pukul 12:00–14:00 WIB (120 menit)).')).toBe(
      'pada tanggal 17 November 2026 (pukul 12.00–14.00 WIB (120 menit)).',
    );
    expect(humanizeAiText('Durasi sesi tercatat 300 menit.')).toBe('Durasi sesi tercatat 300 menit.');
  });
});
