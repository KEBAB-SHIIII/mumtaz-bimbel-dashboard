// @vitest-environment node
/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { subjectStyle } from './subject-style';

describe('subjectStyle: identitas warna mapel', () => {
  it('mapel tak dikenal tetap mendapat nada warna tanpa error', () => {
    expect(subjectStyle('Seni Rupa').barClass).toMatch(/^bg-bar-(blue|teal|amber|sky)$/);
    expect(subjectStyle('').barClass).toMatch(/^bg-bar-(blue|teal|amber|sky)$/);
  });

  it('warna deterministik: nama sama (beda huruf besar) → kelas sama', () => {
    expect(subjectStyle('Bahasa Inggris')).toEqual(subjectStyle('bahasa inggris'));
    expect(subjectStyle('Matematika').barClass).toMatch(/^bg-bar-(blue|teal|amber|sky)$/);
  });

  it('sesi multi-mapel memakai gaya mapel pertama (termasuk mapel bernama koma)', () => {
    expect(subjectStyle('Matematika, Bahasa Inggris')).toEqual(subjectStyle('Matematika'));
    expect(subjectStyle('Bahasa Inggris, Matematika')).toEqual(subjectStyle('Bahasa Inggris'));
    expect(subjectStyle('Mengaji, Tajwid, dan Hafalan, Matematika')).toEqual(subjectStyle('Mengaji, Tajwid, dan Hafalan'));
    expect(subjectStyle('Seni Rupa, Matematika')).toEqual(subjectStyle('Seni Rupa'));
  });
});

/** Kontras WCAG (rasio luminans relatif) antara dua warna hex. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('token warna portal Orang Tua', () => {
  // Dibaca dari file sumber: konfigurasi test memakai `css: false`, jadi import CSS selalu kosong.
  const tokens = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');
  const token = (name: string) => new RegExp(`--color-${name}: (#[0-9a-f]{6});`, 'i').exec(tokens)?.[1] ?? '';

  it('teks ink di atas latar pastel yang sama memenuhi kontras AA (≥ 4,5:1) untuk teks kecil', () => {
    for (const tone of ['blue', 'teal', 'amber', 'sky']) {
      expect(contrast(token(`ink-${tone}`), token(`pastel-${tone}`)), tone).toBeGreaterThanOrEqual(4.5);
    }
  });
});
