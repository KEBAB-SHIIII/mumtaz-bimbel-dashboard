import { describe, expect, it } from 'vitest';
import { ADMIN_FEE_PER_SESSION, grossAmount, gradeTier, sessionFee } from '../src/services/billing/tariff.js';

describe('tarif les per jenjang (mirip tarif parkir)', () => {
  it.each([
    ['1 SD', 47, 50_000],
    ['3 SD', 60, 50_000],
    ['4 SD', 75, 70_000],
    ['5 SD', 90, 105_000],
    ['6 SD', 120, 140_000],
    ['2 SD', 29, 50_000],
    ['2 SD', 149, 100_000],
    ['2 SD', 150, 125_000],
  ])('%s selama %i menit → Rp%i', (grade, minutes, expected) => {
    expect(grossAmount(grade, minutes)).toBe(expected);
  });

  it('jenjang: SD 1-3 dan SD 4-6; kelas di luar SD tidak didukung', () => {
    expect(gradeTier('3 SD')).toBe('SD 1-3');
    expect(gradeTier('4 SD')).toBe('SD 4-6');
    expect(gradeTier('2 SMP')).toBeNull();
    expect(grossAmount('1 SMA', 60)).toBeNull();
    expect(grossAmount('3 SD', 0)).toBeNull();
  });

  it('pendapatan bersih tutor = kotor dikurangi potongan Admin Rp10.000 per sesi', () => {
    expect(ADMIN_FEE_PER_SESSION).toBe(10_000);
    expect(sessionFee('5 SD', 90)).toEqual({ gross: 105_000, adminFee: 10_000, tutorNet: 95_000 });
    expect(sessionFee('7 SD', 60)).toBeNull();
  });
});
