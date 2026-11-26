import { describe, expect, it } from 'vitest';
import { GRADE_OPTIONS } from '@mumtaz/contracts';
import { fixtureSessions, resolveFixtureSession } from '@mumtaz/contracts/fixtures';
import { ADMIN_FEE_PER_HOUR, billedHours, countedSnapshot, grossAmount, gradeTier, sessionFee } from '../src/services/billing/tariff.js';

describe('tarif owner PAUD sampai SMA', () => {
  it.each([
    ['PAUD', 'PAUD-TK', 40_000], ['TK', 'PAUD-TK', 40_000],
    ['1 SD', 'SD 1-3', 60_000], ['2 SD', 'SD 1-3', 60_000], ['3 SD', 'SD 1-3', 60_000],
    ['4 SD', 'SD 4-6', 80_000], ['5 SD', 'SD 4-6', 80_000], ['6 SD', 'SD 4-6', 80_000],
    ['1 SMP', 'SMP', 100_000], ['2 SMP', 'SMP', 100_000], ['3 SMP', 'SMP', 100_000],
    ['1 SMA', 'SMA', 120_000], ['2 SMA', 'SMA', 120_000], ['3 SMA', 'SMA', 120_000],
  ])('%s: jenjang %s, tarif satu jam Rp%i', (grade, tier, hourly) => {
    expect(GRADE_OPTIONS).toContain(grade);
    expect(gradeTier(grade)).toBe(tier);
    expect(sessionFee(grade, 60)).toEqual({ gross: hourly, adminFee: 10_000, tutorNet: hourly - 10_000 });
  });

  it.each([
    [30, 60_000, 10_000], [60, 60_000, 10_000], [61, 60_000, 10_000],
    [79, 60_000, 10_000], [80, 90_000, 15_000], [90, 90_000, 15_000],
    [109, 90_000, 15_000], [110, 120_000, 20_000], [120, 120_000, 20_000],
    [139, 120_000, 20_000], [140, 150_000, 25_000], [169, 150_000, 25_000],
    [170, 180_000, 30_000], [180, 180_000, 30_000], [199, 180_000, 30_000],
    [200, 210_000, 35_000],
  ])('%i menit: tagihan Rp%i, potongan Rp%i', (minutes, gross, adminFee) => {
    expect(ADMIN_FEE_PER_HOUR).toBe(10_000);
    expect(sessionFee('3 SD', minutes)).toEqual({ gross, adminFee, tutorNet: gross - adminFee });
    expect(countedSnapshot('3 SD', minutes)).toEqual({ rate_amount_snapshot: String(gross), admin_fee_snapshot: String(adminFee) });
  });

  it.each([
    [1, 1], [59, 1], [60, 1], [79, 1], [80, 1.5], [109, 1.5], [110, 2], [139, 2],
    [140, 2.5], [169, 2.5], [170, 3], [199, 3],
  ])('%i menit dibulatkan menjadi %s jam', (minutes, hours) => {
    expect(billedHours(minutes)).toBe(hours);
  });

  it.each([0, -1, NaN, Infinity, -Infinity])('durasi tidak valid %s tidak menghasilkan nominal', (minutes) => {
    expect(grossAmount('3 SD', minutes)).toBeNull();
    expect(sessionFee('3 SD', minutes)).toBeNull();
    expect(countedSnapshot('3 SD', minutes)).toEqual({ rate_amount_snapshot: null, admin_fee_snapshot: null });
  });

  it.each(['7 SD', '4 SMP', '4 SMA', 'SMA', '', 'kelas tidak dikenal'])('kelas tidak valid %s tidak menghasilkan nominal', (grade) => {
    expect(gradeTier(grade)).toBeNull();
    expect(sessionFee(grade, 60)).toBeNull();
  });
});


describe('snapshot data contoh', () => {
  it('semua sesi approved mengikuti tarif owner menurut kelas dan durasi', () => {
    for (const session of fixtureSessions.filter((row) => row.status === 'approved')) {
      const { student } = resolveFixtureSession(session);
      expect({ rate_amount_snapshot: session.rate_amount_snapshot, admin_fee_snapshot: session.admin_fee_snapshot })
        .toEqual(countedSnapshot(student.grade, session.duration_minutes));
    }
  });
});
