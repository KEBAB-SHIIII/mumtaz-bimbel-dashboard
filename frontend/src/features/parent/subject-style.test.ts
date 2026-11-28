import { BookHeart, BookOpen, Calculator, FlaskConical } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { subjectStyle } from './subject-style';

describe('subjectStyle: identitas warna & ikon mapel', () => {
  it('memetakan mapel umum ke ikonnya', () => {
    expect(subjectStyle('Matematika').icon).toBe(Calculator);
    expect(subjectStyle('Mengaji, Tajwid, dan Hafalan').icon).toBe(BookHeart);
    expect(subjectStyle('IPAS').icon).toBe(FlaskConical);
  });

  it('mapel tak dikenal memakai ikon cadangan tanpa error', () => {
    expect(subjectStyle('Seni Rupa').icon).toBe(BookOpen);
    expect(subjectStyle('').icon).toBe(BookOpen);
  });

  it('warna deterministik: nama sama (beda huruf besar) → kelas sama', () => {
    expect(subjectStyle('Bahasa Inggris')).toEqual(subjectStyle('bahasa inggris'));
    expect(subjectStyle('Matematika').tileClass).toMatch(/^bg-pastel-(blue|teal|amber|sky)$/);
  });
});
