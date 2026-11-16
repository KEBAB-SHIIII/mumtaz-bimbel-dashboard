import { GRADE_OPTIONS } from '@mumtaz/contracts';

/** Potongan per jam; sisa lebih dari atau sama dengan 30 menit menambah satu potongan. */
export const ADMIN_FEE_PER_HOUR = 10_000;

/** Tarif les per jam (kotor) yang dikonfirmasi owner. */
export const HOURLY_RATE_BY_TIER = {
  'PAUD-TK': 40_000,
  'SD 1-3': 60_000,
  'SD 4-6': 80_000,
  SMP: 100_000,
  SMA: 120_000,
} as const;
export type GradeTier = keyof typeof HOURLY_RATE_BY_TIER;

const BASE_MINUTES = 60;
const EXTRA_BLOCK_MINUTES = 30;
const EXTRA_BLOCK_RATIO = 0.5;

/** Jenjang tarif dari kelas; `null` bila kelas tidak didukung. */
export function gradeTier(grade: string): GradeTier | null {
  if (!(GRADE_OPTIONS as readonly string[]).includes(grade)) return null;
  if (grade === 'PAUD' || grade === 'TK') return 'PAUD-TK';
  if (grade.endsWith(' SMP')) return 'SMP';
  if (grade.endsWith(' SMA')) return 'SMA';
  return Number.parseInt(grade, 10) <= 3 ? 'SD 1-3' : 'SD 4-6';
}

/**
 * Tarif kotor satu sesi, mirip tarif parkir: sampai 60 menit = tarif 1 jam; setelah itu tiap
 * 30 menit PENUH menambah 0,5× tarif (sisa kurang dari 30 menit tidak dihitung).
 * 47 mnt → 1×, 60 mnt → 1×, 75 mnt → 1×, 90 mnt → 1,5×, 120 mnt → 2×.
 */
export function grossAmount(grade: string, durationMinutes: number): number | null {
  const tier = gradeTier(grade);
  if (!tier || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
  const hourly = HOURLY_RATE_BY_TIER[tier];
  const extraBlocks = Math.max(0, Math.floor((durationMinutes - BASE_MINUTES) / EXTRA_BLOCK_MINUTES));
  return hourly + extraBlocks * hourly * EXTRA_BLOCK_RATIO;
}

export interface SessionFee {
  gross: number;
  adminFee: number;
  /** Pendapatan bersih tutor = kotor − potongan Admin. */
  tutorNet: number;
}

export function sessionFee(grade: string, durationMinutes: number): SessionFee | null {
  const gross = grossAmount(grade, durationMinutes);
  if (gross === null) return null;
  // Sisa >= 30 menit menambah potongan: 90/150 menit menjadi 2/3 potongan.
  const adminFee = ADMIN_FEE_PER_HOUR * Math.max(1, Math.floor((durationMinutes + 30) / 60));
  return { gross, adminFee, tutorNet: gross - adminFee };
}

/**
 * Nilai snapshot `lesson_sessions` saat sesi dihitung (status approved): tarif kotor & potongan Admin
 * dikunci agar honor/tagihan bulan lalu tidak berubah bila aturan tarif diganti. Kelas tidak didukung
 * → `null` (tidak diberi nominal palsu; payroll menampilkan peringatan).
 */
export function countedSnapshot(grade: string, durationMinutes: number) {
  const fee = sessionFee(grade, durationMinutes);
  return {
    rate_amount_snapshot: fee ? String(fee.gross) : null,
    admin_fee_snapshot: fee ? String(fee.adminFee) : null,
  };
}

export const NO_SNAPSHOT = { rate_amount_snapshot: null, admin_fee_snapshot: null } as const;
