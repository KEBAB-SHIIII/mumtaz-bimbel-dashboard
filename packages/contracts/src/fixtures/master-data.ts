import type { Role } from '../enums.js';
import {
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

/**
 * Nama FIKTIF (nama depan Indonesia, satu kata) agar data mudah dibaca seolah nyata.
 * Semua akun, sekolah, dan tarif tetap SINTETIS — bukan data UMKM.
 */
const tutorUser = (id: string, name: string): FixtureUser => ({
  id,
  full_name: name,
  username: name.toLowerCase(),
  email: `${name.toLowerCase()}@example.test`,
  role: 'tutor',
  is_active: true,
});
const parentUser = (id: string, name: string): FixtureUser => ({
  id,
  full_name: name,
  username: null,
  email: `${name.toLowerCase()}@example.test`,
  role: 'parent',
  is_active: true,
});

export const fixtureUsers: FixtureUser[] = [
  { id: USER_IDS.admin, full_name: 'Admin', username: 'admin.demo', email: 'admin@example.test', role: 'admin', is_active: true },
  tutorUser(USER_IDS.tutorA, 'Farhan'),
  tutorUser(USER_IDS.tutorB, 'Noreen'),
  parentUser(USER_IDS.parentA, 'Sari'),
  parentUser(USER_IDS.parentB, 'Budi'),
  tutorUser(USER_IDS.fazrin, 'Fazrin'),
  tutorUser(USER_IDS.rama, 'Rama'),
  tutorUser(USER_IDS.giyas, 'Giyas'),
  tutorUser(USER_IDS.nasywa, 'Nasywa'),
  parentUser(USER_IDS.wati, 'Wati'),
  parentUser(USER_IDS.agus, 'Agus'),
  parentUser(USER_IDS.rina, 'Rina'),
  parentUser(USER_IDS.hendra, 'Hendra'),
  parentUser(USER_IDS.yuni, 'Yuni'),
  parentUser(USER_IDS.dedi, 'Dedi'),
];

export const fixtureTutors: FixtureTutor[] = [
  { id: TUTOR_IDS.tutorA, user_id: USER_IDS.tutorA, phone: '080000000001', is_active: true },
  { id: TUTOR_IDS.tutorB, user_id: USER_IDS.tutorB, phone: '080000000002', is_active: true },
  { id: TUTOR_IDS.fazrin, user_id: USER_IDS.fazrin, phone: '080000000003', is_active: true },
  { id: TUTOR_IDS.rama, user_id: USER_IDS.rama, phone: '080000000004', is_active: true },
  { id: TUTOR_IDS.giyas, user_id: USER_IDS.giyas, phone: '080000000005', is_active: true },
  { id: TUTOR_IDS.nasywa, user_id: USER_IDS.nasywa, phone: '080000000006', is_active: true },
];

/** Sekolah fiktif — bukan nama sekolah nyata. */
const SCHOOL = {
  harapan: 'SD Harapan Bangsa',
  pelita: 'SD Pelita Ilmu',
  tunas: 'SMP Tunas Mulia',
  bina: 'SMP Bina Insani',
  cendekia: 'SMA Cendekia',
} as const;

const student = (id: string, full_name: string, grade: string, school_name: string): FixtureStudent => ({
  id,
  full_name,
  grade,
  school_name,
  is_active: true,
});

export const fixtureStudents: FixtureStudent[] = [
  student(STUDENT_IDS.murid1, 'Aisyah', '3 SD', SCHOOL.harapan),
  student(STUDENT_IDS.murid2, 'Bima', '5 SD', SCHOOL.pelita),
  student(STUDENT_IDS.murid3, 'Citra', '2 SMP', SCHOOL.tunas),
  student(STUDENT_IDS.dimas, 'Dimas', '4 SD', SCHOOL.harapan),
  student(STUDENT_IDS.eka, 'Eka', '6 SD', SCHOOL.pelita),
  student(STUDENT_IDS.fikri, 'Fikri', '1 SMP', SCHOOL.tunas),
  student(STUDENT_IDS.gita, 'Gita', '3 SMP', SCHOOL.bina),
  student(STUDENT_IDS.hana, 'Hana', '2 SD', SCHOOL.harapan),
  student(STUDENT_IDS.intan, 'Intan', '1 SMA', SCHOOL.cendekia),
  student(STUDENT_IDS.joko, 'Joko', '5 SD', SCHOOL.pelita),
  student(STUDENT_IDS.kirana, 'Kirana', '2 SMA', SCHOOL.cendekia),
  student(STUDENT_IDS.lutfi, 'Lutfi', '4 SD', SCHOOL.harapan),
];

/** Sari → Aisyah; Budi → Citra (dipakai tes akses silang); wali lain bisa punya beberapa anak. */
export const fixtureParentStudents: FixtureParentStudent[] = [
  { parent_user_id: USER_IDS.parentA, student_id: STUDENT_IDS.murid1, relationship: 'ibu' },
  { parent_user_id: USER_IDS.parentB, student_id: STUDENT_IDS.murid3, relationship: 'ayah' },
  { parent_user_id: USER_IDS.wati, student_id: STUDENT_IDS.murid2, relationship: 'ibu' },
  { parent_user_id: USER_IDS.agus, student_id: STUDENT_IDS.dimas, relationship: 'ayah' },
  { parent_user_id: USER_IDS.agus, student_id: STUDENT_IDS.eka, relationship: 'ayah' },
  { parent_user_id: USER_IDS.rina, student_id: STUDENT_IDS.fikri, relationship: 'ibu' },
  { parent_user_id: USER_IDS.rina, student_id: STUDENT_IDS.gita, relationship: 'ibu' },
  { parent_user_id: USER_IDS.hendra, student_id: STUDENT_IDS.hana, relationship: 'ayah' },
  { parent_user_id: USER_IDS.hendra, student_id: STUDENT_IDS.intan, relationship: 'ayah' },
  { parent_user_id: USER_IDS.yuni, student_id: STUDENT_IDS.joko, relationship: 'ibu' },
  { parent_user_id: USER_IDS.yuni, student_id: STUDENT_IDS.kirana, relationship: 'ibu' },
  { parent_user_id: USER_IDS.dedi, student_id: STUDENT_IDS.lutfi, relationship: 'wali' },
];

export const fixtureSubjects: FixtureSubject[] = [
  { id: SUBJECT_IDS.matematika, name: 'Matematika', is_active: true },
  { id: SUBJECT_IDS.bahasaInggris, name: 'Bahasa Inggris', is_active: true },
  { id: SUBJECT_IDS.ipa, name: 'IPA', is_active: true },
  { id: SUBJECT_IDS.bahasaIndonesia, name: 'Bahasa Indonesia', is_active: true },
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
    [USER_IDS.wati]: 'MUMTAZ-DEMO-PARENT-03',
    [USER_IDS.agus]: 'MUMTAZ-DEMO-PARENT-04',
    [USER_IDS.rina]: 'MUMTAZ-DEMO-PARENT-05',
    [USER_IDS.hendra]: 'MUMTAZ-DEMO-PARENT-06',
    [USER_IDS.yuni]: 'MUMTAZ-DEMO-PARENT-07',
    [USER_IDS.dedi]: 'MUMTAZ-DEMO-PARENT-08',
  },
} as const;
