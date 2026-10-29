/**
 * UUID sintetis yang stabil untuk fixture. Segmen ke-4 menandai jenis entitas;
 * sesi memakai `8000` agar selaras dengan `examples/anomaly-response.json`.
 */
const id = (namespace: string, n: number) =>
  `00000000-0000-4000-${namespace}-${String(n).padStart(12, '0')}`;

export const USER_IDS = {
  admin: id('8001', 1),
  tutorA: id('8001', 2),
  tutorB: id('8001', 3),
  parentA: id('8001', 4),
  parentB: id('8001', 5),
} as const;

export const TUTOR_IDS = {
  tutorA: id('8002', 1),
  tutorB: id('8002', 2),
} as const;

export const STUDENT_IDS = {
  murid1: id('8003', 1),
  murid2: id('8003', 2),
  murid3: id('8003', 3),
} as const;

export const SUBJECT_IDS = {
  matematika: id('8004', 1),
  bahasaInggris: id('8004', 2),
  ipa: id('8004', 3),
} as const;

export const ASSIGNMENT_IDS = {
  tutorAMurid1Matematika: id('8005', 1),
  tutorAMurid2BahasaInggris: id('8005', 2),
  tutorBMurid3Ipa: id('8005', 3),
  /** Nonaktif sejak 2026-09-30 — fixture "invalid assignment". */
  tutorBMurid2MatematikaInactive: id('8005', 4),
} as const;

export const RATE_IDS = {
  tutorAMurid1Matematika: id('8006', 1),
  tutorAMurid2BahasaInggris: id('8006', 2),
  tutorBMurid3Ipa: id('8006', 3),
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
