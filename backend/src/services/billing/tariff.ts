import { GRADE_OPTIONS } from '@mumtaz/contracts';

/** Potongan Admin untuk keuntungan bimbel: flat per sesi (keputusan owner, hardcode sementara). */
export const ADMIN_FEE_PER_SESSION = 10_000;

/** Tarif les per jam (kotor) per jenjang, dari yang termurah. Mentok di SD kelas 6 (keputusan owner). */
export const HOURLY_RATE_BY_TIER = {
  'SD 1-3': 50_000,
  'SD 4-6': 70_000,
} as const;
export type GradeTier = keyof typeof HOURLY_RATE_BY_TIER;

const BASE_MINUTES = 60;
const EXTRA_BLOCK_MINUTES = 30;
const EXTRA_BLOCK_RATIO = 0.5;

/** Jenjang tarif dari kelas ("3 SD" → "SD 1-3"); `null` bila kelas tidak didukung (mis. data lama SMP/SMA). */
export function gradeTier(grade: string): GradeTier | null {
  if (!(GRADE_OPTIONS as readonly string[]).includes(grade)) return null;
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
  return { gross, adminFee: ADMIN_FEE_PER_SESSION, tutorNet: gross - ADMIN_FEE_PER_SESSION };
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
