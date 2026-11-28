import { describe, expect, it } from 'vitest';
import {
  formatLessonDate,
  formatRelativeLessonDate,
  formatShortDate,
  formatTimestamp,
  humanizeAiText,
} from './format';

describe('format tanggal & teks AI', () => {
  it('tanggal ISO → tanggal Indonesia dengan bulan lengkap', () => {
    expect(formatLessonDate('2026-11-17')).toBe('17 November 2026');
    expect(formatLessonDate('2026-01-05')).toBe('5 Januari 2026');
    expect(formatShortDate('2026-11-17')).toBe('17 Nov 2026');
    expect(formatTimestamp('2026-11-17T08:32:00Z')).toBe('17 Nov 2026, 15.32 WIB');
  });

  it('menghitung waktu relatif sesi berdasarkan tanggal kalender WIB', () => {
    // 2026-11-28 18:00 WIB (= 11:00 UTC)
    const now = new Date('2026-11-28T11:00:00Z');
    expect(formatRelativeLessonDate('2026-11-28', now)).toBe('Hari ini');
    expect(formatRelativeLessonDate('2026-11-27', now)).toBe('Kemarin');
    expect(formatRelativeLessonDate('2026-11-26', now)).toBe('2 hari lalu');
    expect(formatRelativeLessonDate('2026-11-21', now)).toBe('1 minggu lalu');
    expect(formatRelativeLessonDate('2026-11-14', now)).toBe('2 minggu lalu');
    expect(formatRelativeLessonDate('2026-10-20', now)).toBe('1 bulan lalu');
    expect(formatRelativeLessonDate('2026-11-29', now)).toBe('Besok');

    // 2026-11-28 23:30 UTC = 2026-11-29 06:30 WIB (sudah ganti hari di WIB)
    const afterMidnightWib = new Date('2026-11-28T23:30:00Z');
    expect(formatRelativeLessonDate('2026-11-28', afterMidnightWib)).toBe('Kemarin');
  });

  it('kalimat AI memakai tanggal & jam format Indonesia', () => {
    expect(humanizeAiText('pada tanggal 2026-11-17 (pukul 12:00–14:00 WIB (120 menit)).')).toBe(
      'pada tanggal 17 November 2026 (pukul 12.00–14.00 WIB (120 menit)).',
    );
    expect(humanizeAiText('Durasi sesi tercatat 300 menit.')).toBe('Durasi sesi tercatat 300 menit.');
  });
});
