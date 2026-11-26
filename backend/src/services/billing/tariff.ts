import { GRADE_OPTIONS } from '@mumtaz/contracts';

/** Potongan per jam tertagih (Rp5.000 per setengah jam), dikalikan jam hasil pembulatan. */
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

/** Sisa menit (setelah jam penuh) mulai dari sini dibulatkan ke 0,5 jam. */
const HALF_HOUR_THRESHOLD = 20;
/** Sisa menit mulai dari sini dibulatkan ke 1 jam penuh berikutnya. */
const FULL_HOUR_THRESHOLD = 50;

/**
 * Jam tertagih (aturan owner): sisa < 20 menit dibulatkan ke bawah; sisa 20–49 menit menjadi
 * +0,5 jam; sisa ≥ 50 menit menjadi +1 jam. Minimal 1 jam.
 * 60–79 mnt → 1, 80–109 → 1,5, 110–139 → 2, 140–169 → 2,5, 170–199 → 3.
 */
export function billedHours(minutes: number): number {
  const full = Math.floor(minutes / 60);
  const rest = minutes - full * 60;
  const extra = rest >= FULL_HOUR_THRESHOLD ? 1 : rest >= HALF_HOUR_THRESHOLD ? 0.5 : 0;
  return Math.max(1, full + extra);
}

/** Jenjang tarif dari kelas; `null` bila kelas tidak didukung. */
export function gradeTier(grade: string): GradeTier | null {
  if (!(GRADE_OPTIONS as readonly string[]).includes(grade)) return null;
  if (grade === 'PAUD' || grade === 'TK') return 'PAUD-TK';
  if (grade.endsWith(' SMP')) return 'SMP';
  if (grade.endsWith(' SMA')) return 'SMA';
  return Number.parseInt(grade, 10) <= 3 ? 'SD 1-3' : 'SD 4-6';
}

/** Tarif kotor satu sesi = tarif per jam × jam tertagih (lihat `billedHours`). */
export function grossAmount(grade: string, durationMinutes: number): number | null {
  const tier = gradeTier(grade);
  if (!tier || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
  return HOURLY_RATE_BY_TIER[tier] * billedHours(durationMinutes);
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
  // Potongan mengikuti jam tertagih yang sama: 1,5 jam → Rp15.000, 2 jam → Rp20.000.
  const adminFee = ADMIN_FEE_PER_HOUR * billedHours(durationMinutes);
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

/** Billing basis is kept separately from approval amounts, including while a session is pending. */
export const durationMultiplier = billedHours;
export function snapshotFromBasis(session: {
  grade: string; duration_minutes: number; hourly_rate_snapshot?: string | null;
  rate_amount_snapshot?: string | null; admin_fee_snapshot?: string | null;
}) {
  if (session.rate_amount_snapshot != null && session.admin_fee_snapshot != null) {
    return { rate_amount_snapshot: session.rate_amount_snapshot, admin_fee_snapshot: session.admin_fee_snapshot };
  }
  if (session.hourly_rate_snapshot == null) return countedSnapshot(session.grade, session.duration_minutes);
  return {
    rate_amount_snapshot: String(Number(session.hourly_rate_snapshot) * durationMultiplier(session.duration_minutes)),
    admin_fee_snapshot: String(ADMIN_FEE_PER_HOUR * billedHours(session.duration_minutes)),
  };
}
