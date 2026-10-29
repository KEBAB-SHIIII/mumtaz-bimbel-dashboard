import type { RateType, Role } from '../enums.js';
import {
  ASSIGNMENT_IDS,
  RATE_IDS,
  STUDENT_IDS,
  SUBJECT_IDS,
  TUTOR_IDS,
  USER_IDS,
} from './ids.js';

// Master data sintetis. Harus identik dengan `examples/seed-data.json`
// (dijaga oleh test `fixtures.test.ts`).

export interface FixtureUser {
  id: string;
  full_name: string;
  username: string | null;
  email: string | null;
  role: Role;
  is_active: boolean;
}

export interface FixtureTutor {
  id: string;
  user_id: string;
  phone: string | null;
  is_active: boolean;
}

export interface FixtureStudent {
  id: string;
  full_name: string;
  grade: string;
  school_name: string;
  is_active: boolean;
}

export interface FixtureParentStudent {
  parent_user_id: string;
  student_id: string;
  relationship: string | null;
}

export interface FixtureSubject {
  id: string;
  name: string;
  is_active: boolean;
}

export interface FixtureAssignment {
  id: string;
  tutor_id: string;
  student_id: string;
  subject_id: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
}

export interface FixtureRate {
  id: string;
  assignment_id: string;
  rate_type: RateType;
  rate_amount: string;
  is_demo_assumption: boolean;
  effective_from: string;
  effective_to: string | null;
}

export const fixtureUsers: FixtureUser[] = [
  { id: USER_IDS.admin, full_name: 'Admin Demo', username: 'admin.demo', email: 'admin@example.test', role: 'admin', is_active: true },
  { id: USER_IDS.tutorA, full_name: 'Tutor Demo A', username: 'tutor-a.demo', email: 'tutor-a@example.test', role: 'tutor', is_active: true },
  { id: USER_IDS.tutorB, full_name: 'Tutor Demo B', username: 'tutor-b.demo', email: 'tutor-b@example.test', role: 'tutor', is_active: true },
  { id: USER_IDS.parentA, full_name: 'Orang Tua Demo A', username: null, email: 'parent-a@example.test', role: 'parent', is_active: true },
  { id: USER_IDS.parentB, full_name: 'Orang Tua Demo B', username: null, email: 'parent-b@example.test', role: 'parent', is_active: true },
];

export const fixtureTutors: FixtureTutor[] = [
  { id: TUTOR_IDS.tutorA, user_id: USER_IDS.tutorA, phone: '080000000001', is_active: true },
  { id: TUTOR_IDS.tutorB, user_id: USER_IDS.tutorB, phone: '080000000002', is_active: true },
];

export const fixtureStudents: FixtureStudent[] = [
  { id: STUDENT_IDS.murid1, full_name: 'Murid Demo 1', grade: '3 SD', school_name: 'Sekolah Demo A', is_active: true },
  { id: STUDENT_IDS.murid2, full_name: 'Murid Demo 2', grade: '5 SD', school_name: 'Sekolah Demo B', is_active: true },
  { id: STUDENT_IDS.murid3, full_name: 'Murid Demo 3', grade: '2 SMP', school_name: 'Sekolah Demo C', is_active: true },
];

/** Parent A → Murid 1; Parent B → Murid 3 (untuk tes akses silang). */
export const fixtureParentStudents: FixtureParentStudent[] = [
  { parent_user_id: USER_IDS.parentA, student_id: STUDENT_IDS.murid1, relationship: 'orang tua' },
  { parent_user_id: USER_IDS.parentB, student_id: STUDENT_IDS.murid3, relationship: 'wali' },
];

export const fixtureSubjects: FixtureSubject[] = [
  { id: SUBJECT_IDS.matematika, name: 'Matematika', is_active: true },
  { id: SUBJECT_IDS.bahasaInggris, name: 'Bahasa Inggris', is_active: true },
  { id: SUBJECT_IDS.ipa, name: 'IPA', is_active: true },
];

export const fixtureAssignments: FixtureAssignment[] = [
  { id: ASSIGNMENT_IDS.tutorAMurid1Matematika, tutor_id: TUTOR_IDS.tutorA, student_id: STUDENT_IDS.murid1, subject_id: SUBJECT_IDS.matematika, start_date: '2026-09-01', end_date: null, is_active: true },
  { id: ASSIGNMENT_IDS.tutorAMurid2BahasaInggris, tutor_id: TUTOR_IDS.tutorA, student_id: STUDENT_IDS.murid2, subject_id: SUBJECT_IDS.bahasaInggris, start_date: '2026-09-01', end_date: null, is_active: true },
  { id: ASSIGNMENT_IDS.tutorBMurid3Ipa, tutor_id: TUTOR_IDS.tutorB, student_id: STUDENT_IDS.murid3, subject_id: SUBJECT_IDS.ipa, start_date: '2026-09-01', end_date: null, is_active: true },
  { id: ASSIGNMENT_IDS.tutorBMurid2MatematikaInactive, tutor_id: TUTOR_IDS.tutorB, student_id: STUDENT_IDS.murid2, subject_id: SUBJECT_IDS.matematika, start_date: '2026-09-01', end_date: '2026-09-30', is_active: false },
];

/** Tarif demo Rp50.000/sesi — simulasi, bukan tarif resmi UMKM. */
export const fixtureRates: FixtureRate[] = [
  { id: RATE_IDS.tutorAMurid1Matematika, assignment_id: ASSIGNMENT_IDS.tutorAMurid1Matematika, rate_type: 'per_session', rate_amount: '50000', is_demo_assumption: true, effective_from: '2026-09-01', effective_to: null },
  { id: RATE_IDS.tutorAMurid2BahasaInggris, assignment_id: ASSIGNMENT_IDS.tutorAMurid2BahasaInggris, rate_type: 'per_session', rate_amount: '50000', is_demo_assumption: true, effective_from: '2026-09-01', effective_to: null },
  { id: RATE_IDS.tutorBMurid3Ipa, assignment_id: ASSIGNMENT_IDS.tutorBMurid3Ipa, rate_type: 'per_session', rate_amount: '50000', is_demo_assumption: true, effective_from: '2026-09-01', effective_to: null },
];

/**
 * Credential KHUSUS TEST lokal/terisolasi. Tidak memenuhi format kode produksi
 * (≥128-bit CSPRNG) dan tidak boleh dipakai di production.
 */
export const TEST_ONLY_CREDENTIALS = {
  adminUsername: 'admin.demo',
  adminPassword: 'test-only-admin-password',
  tutorPassword: 'test-only-tutor-password',
  parentAccessCodes: {
    [USER_IDS.parentA]: 'MUMTAZ-DEMO-PARENT-ACCESS-ONLY',
    [USER_IDS.parentB]: 'MUMTAZ-DEMO-PARENT-B-ACCESS-ONLY',
  },
} as const;
