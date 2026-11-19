/**
 * UUID sintetis yang stabil untuk fixture. Segmen ke-4 menandai jenis entitas;
 * sesi test memakai `8000` agar selaras dengan `examples/anomaly-response.json`,
 * sesi dataset dev memakai `8100`.
 *
 * Kunci `tutorA/tutorB`, `murid1..3`, `parentA/parentB` dipertahankan (dipakai test)
 * walau nama tampilannya kini nama depan Indonesia — lihat `master-data.ts`.
 */
export const fixtureId = (namespace: string, n: number) =>
  `00000000-0000-4000-${namespace}-${String(n).padStart(12, '0')}`;

const id = fixtureId;

export const USER_IDS = {
  admin: id('8001', 1),
  /** Farhan */
  tutorA: id('8001', 2),
  /** Noreen */
  tutorB: id('8001', 3),
  /** Sari (wali Aisyah) */
  parentA: id('8001', 4),
  /** Budi (wali Citra) */
  parentB: id('8001', 5),
  fazrin: id('8001', 6),
  rama: id('8001', 7),
  giyas: id('8001', 8),
  nasywa: id('8001', 9),
  wati: id('8001', 10),
  agus: id('8001', 11),
  rina: id('8001', 12),
  hendra: id('8001', 13),
  yuni: id('8001', 14),
  dedi: id('8001', 15),
} as const;

export const TUTOR_IDS = {
  /** Farhan */
  tutorA: id('8002', 1),
  /** Noreen */
  tutorB: id('8002', 2),
  fazrin: id('8002', 3),
  rama: id('8002', 4),
  giyas: id('8002', 5),
  nasywa: id('8002', 6),
} as const;

export const STUDENT_IDS = {
  /** Aisyah */
  murid1: id('8003', 1),
  /** Bima */
  murid2: id('8003', 2),
  /** Citra */
  murid3: id('8003', 3),
  dimas: id('8003', 4),
  eka: id('8003', 5),
  fikri: id('8003', 6),
  gita: id('8003', 7),
  hana: id('8003', 8),
  intan: id('8003', 9),
  joko: id('8003', 10),
  kirana: id('8003', 11),
  lutfi: id('8003', 12),
} as const;

export const SUBJECT_IDS = {
  matematika: id('8004', 1),
  bahasaInggris: id('8004', 2),
  ipa: id('8004', 3),
  bahasaIndonesia: id('8004', 4),
} as const;

export const SESSION_IDS = {
  s01: id('8000', 1),
  s02: id('8000', 2),
  s03: id('8000', 3),
  s04: id('8000', 4),
  s05: id('8000', 5),
  s06: id('8000', 6),
  s07: id('8000', 7),
  s08: id('8000', 8),
  s09: id('8000', 9),
  s10: id('8000', 10),
  s11: id('8000', 11),
} as const;

export const FINDING_IDS = {
  duplicateS09: id('8007', 1),
  outlierS10: id('8007', 2),
  falsePositiveS04: id('8007', 3),
} as const;

/** UUID yang tidak ada di fixture mana pun (untuk tes 404/akses silang). */
export const UNKNOWN_ID = id('8fff', 1);
