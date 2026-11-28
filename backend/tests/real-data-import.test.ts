import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { count, eq, inArray, notInArray } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { TEST_ONLY_CREDENTIALS, fixtureStudents } from '@mumtaz/contracts/fixtures';
import type { DatabaseHandle } from '../src/db/client.js';
import { importRealData } from '../src/db/real-data-import.js';
import { lessonSessions, lessonSessionSubjects, parentStudents, studentGradeHistory, students, subjects, tutors, users } from '../src/db/schema.js';
import { buildImportPlan, makeUsername, mapGrade, parseCsv, schoolYear, splitSubjects } from '../src/services/import/real-data.js';
import { seedSyntheticData } from './helpers/seed.js';
import { createTestDatabase } from './helpers/test-db.js';
import { testEnvSource } from './test-env.js';

const CSV = `\uFEFFnama_tutor,nama_murid,kelas,asal_sekolah,mata_pelajaran,materi,tanggal_les,jam_mulai,jam_selesai
Rina,Bayu,TK B,TKIT Arafah,"Mengaji, Tajwid, dan Hafalan",,2025-06-02,14:30,15:30
Rina,Bayu,Kelas 1,SDIT Arafah,"Matematika; Mengaji, Tajwid, dan Hafalan",,2026-01-14,15:00,16:00
Rina,Bayu,Kelas 1,SDIT Arafah,"Matematika; Mengaji, Tajwid, dan Hafalan",,2026-01-14,15:00,16:00
Dewi Lestari,Tono,Kelas 4,SDN 5 Baamang Hulu,Matematika,,2025-05-14,19:00,20:00
Dewi Lestari,Tono,Kelas 3,SDN 5 Baamang Hulu,Matematika,,2025-05-21,19:00,20:30
Dewi Lestari,Tono,Kelas 3,SDN 5 Baamang Hulu,Matematika,,2025-06-02,19:00,20:00
Dewi Lestari,Tono,Kelas 4,SDN 5 Baamang Hulu,Bahasa Inggris,,2025-08-01,19:00,20:00
Sari,Andi,Kelas 10,SMAN 1 Sampit,Kimia,,2025-05-08,16:00,18:00
Sari,Andi,TK B,TK Perwanida,Calistung,,2025-05-20,16:00,17:00
Wulan,Mira,TK B,TK Fatwa,Calistung,,2026-02-11,01:00,02:00
Sari,Andi,Kelas 10,SMAN 1 Sampit,Kimia,,2026-06-04,16:00,19:10
`;

describe('perencanaan impor CSV', () => {
  const plan = buildImportPlan(parseCsv(CSV));

  it('memetakan kelas sheet owner ke kelas aplikasi', () => {
    expect(['Belum Sekolah', 'PAUD', 'TK A', 'TK B', 'Kelas 1', 'Kelas 6', 'Kelas 7', 'Kelas 9', 'Kelas 10'].map(mapGrade))
      .toEqual(['PAUD', 'PAUD', 'TK', 'TK', '1 SD', '6 SD', '1 SMP', '3 SMP', '1 SMA']);
    expect(() => mapGrade('Kelas 2 SD')).toThrow();
  });

  it('memisah mapel dengan titik koma tanpa memecah nama mapel berkoma', () => {
    expect(splitSubjects("Mengaji, Tajwid, dan Hafalan; Muroja'ah")).toEqual(['Mengaji, Tajwid, dan Hafalan', "Muroja'ah"]);
    // Nama panjang dipersingkat (permintaan user).
    expect(splitSubjects('Matematika; Pendidikan Pancasila dan Kewarganegaraan')).toEqual(['Matematika', 'PKN']);
  });

  it('username unik dan valid', () => {
    const taken = new Set<string>();
    expect(makeUsername('Dewi Lestari', taken)).toBe('dewi.lestari');
    expect(makeUsername('Dewi  Lestari', taken)).toBe('dewi.lestari2');
    expect(makeUsername('Ai', taken)).toBe('ai.tutor');
  });

  it('murid dibedakan per nama + sekolah, duplikat persis dilewati', () => {
    expect(plan.issues.invalid).toEqual([]);
    expect(plan.issues.duplicates).toEqual([{ line: 4, duplicateOf: 3 }]);
    expect(plan.students.map((s) => `${s.name}|${s.school}`)).toEqual([
      'Andi|SMAN 1 Sampit', 'Andi|TK Perwanida', 'Bayu|SDIT Arafah', 'Bayu|TKIT Arafah', 'Tono|SDN 5 Baamang Hulu',
    ]);
    expect(plan.sessions).toHaveLength(8);
    expect(plan.tutors.map((t) => t.username)).toEqual(['dewi.lestari', 'rina', 'sari']);
  });

  it('kelas dinormalisasi ke mayoritas per tahun ajaran (seri → kelas lebih tinggi)', () => {
    expect([schoolYear('2025-06-30'), schoolYear('2025-07-01')]).toEqual(['2024/2025', '2025/2026']);
    const tono = plan.students.find((s) => s.name === 'Tono');
    // 2024/2025: Kelas 3 ×2, Kelas 4 ×1 → 3 SD; 2025/2026: Kelas 4 → 4 SD.
    expect(tono?.history).toEqual([
      { grade: '3 SD', effective_from: '0001-01-01' },
      { grade: '4 SD', effective_from: '2025-08-01' },
    ]);
    expect(tono?.grade).toBe('4 SD');
    expect(plan.issues.regressions).toEqual([]);
    expect(plan.issues.gradeNormalized).toEqual([
      { student: 'Tono', school: 'SDN 5 Baamang Hulu', schoolYear: '2024/2025', chosen: '3 SD', counts: { '4 SD': 1, '3 SD': 2 } },
    ]);
    const olinSessions = plan.sessions.filter((s) => s.student_id === tono?.id);
    // 3 SD = 60rb/jam, 90 menit = 1,5 jam → 90rb, potongan Rp15.000; 4 SD = 80rb/jam.
    expect(olinSessions.map((s) => [s.lesson_date, s.grade, s.rate_amount_snapshot, s.admin_fee_snapshot])).toEqual([
      ['2025-05-14', '3 SD', '60000', '10000'], ['2025-05-21', '3 SD', '90000', '15000'],
      ['2025-06-02', '3 SD', '60000', '10000'], ['2025-08-01', '4 SD', '80000', '10000'],
    ]);
    expect(plan.sessions.every((s) => s.learning_material === s.subjects.join('; '))).toBe(true);
  });

  it('sesi dengan jam tidak wajar dilewati, bukan diimpor', () => {
    expect(plan.issues.unusualTime.map((i) => i.line)).toEqual([11, 12]);
    expect(plan.issues.unusualTime[0]?.message).toMatch(/mulai 01:00/);
    expect(plan.issues.unusualTime[1]?.message).toMatch(/durasi 190 menit/);
    expect(plan.tutors.map((t) => t.name)).not.toContain('Wulan');
    expect(plan.sessions.some((s) => s.lesson_date === '2026-02-11' || s.lesson_date === '2026-06-04')).toBe(false);
  });

  it('username tutor tidak memakai username akun yang dipertahankan', () => {
    const reserved = buildImportPlan(parseCsv(CSV), { reservedUsernames: ['rina'] });
    expect(reserved.tutors.map((t) => t.username)).toEqual(['dewi.lestari', 'rina2', 'sari']);
  });
});

describe('impor ke database', () => {
  let handle: DatabaseHandle;
  let demo: { studentId: string; sessionIds: string[]; tutorIds: string[]; usernames: string[] };
  beforeAll(async () => {
    handle = await createTestDatabase();
    await seedSyntheticData(handle.db, {
      adminPassword: TEST_ONLY_CREDENTIALS.adminPassword,
      tutorPassword: TEST_ONLY_CREDENTIALS.tutorPassword,
      parentAccessCodePepper: testEnvSource.PARENT_ACCESS_CODE_PEPPER,
    });
    // Murid demo "data testing" (permintaan user) harus selamat dari impor.
    const [student] = await handle.db.update(students).set({ full_name: 'data testing' }).where(eq(students.full_name, fixtureStudents[0]?.full_name ?? '')).returning();
    if (!student) throw new Error('fixture murid tidak ditemukan');
    const sessions = await handle.db.select().from(lessonSessions).where(eq(lessonSessions.student_id, student.id));
    const tutorIds = [...new Set(sessions.map((s) => s.tutor_id))];
    const tutorUsers = await handle.db.select({ username: users.username }).from(tutors).innerJoin(users, eq(users.id, tutors.user_id)).where(inArray(tutors.id, tutorIds));
    demo = { studentId: student.id, sessionIds: sessions.map((s) => s.id).sort(), tutorIds, usernames: tutorUsers.map((u) => u.username ?? '') };
    expect(demo.sessionIds.length).toBeGreaterThan(0);
  });
  afterAll(() => handle.close());

  const records = parseCsv(CSV);
  const n = async (table: PgTable) => (await handle.db.select({ n: count() }).from(table))[0]?.n;
  const applyOptions = (writeBackup: (b: unknown) => Promise<void> = async () => {}) => ({
    apply: true as const, writeBackup, hashPassword: async (p: string) => `hash:${p}`, generatePassword: () => 'Temp-Pass-1234',
  });

  it('preview tidak mengubah data; backup gagal membatalkan semuanya', async () => {
    const before = await n(lessonSessions);
    const preview = await importRealData(handle.db, records, { apply: false });
    expect(preview.existing?.lesson_sessions).toBe(before);
    expect(preview.kept).toMatchObject({ students: ['data testing'], sessions: demo.sessionIds.length });
    expect(preview.summary).toMatchObject({ tutors: 3, students: 5, sessions: 8, skipped: { exactDuplicates: 1 } });
    await expect(importRealData(handle.db, records, applyOptions(async () => { throw new Error('backup gagal'); }))).rejects.toThrow('backup gagal');
    expect(await n(lessonSessions)).toBe(before);
  });

  it('mengganti data dummy, mempertahankan admin + data demo, dan idempoten', async () => {
    let backup: Record<string, unknown[]> | undefined;
    const result = await importRealData(handle.db, records, applyOptions(async (b) => { backup = b as Record<string, unknown[]>; }));
    expect(backup?.lesson_sessions?.length).toBeGreaterThan(0);
    expect(result.credentials.map((c) => c.username).every((u) => !demo.usernames.includes(u))).toBe(true);

    expect(await n(lessonSessions)).toBe(8 + demo.sessionIds.length);
    expect(await n(students)).toBe(5 + 1);
    expect(await n(tutors)).toBe(3 + demo.tutorIds.length);
    expect(await n(parentStudents)).toBe(0);
    const keptSessions = await handle.db.select().from(lessonSessions).where(eq(lessonSessions.student_id, demo.studentId));
    expect(keptSessions.map((s) => s.id).sort()).toEqual(demo.sessionIds);
    expect((await handle.db.select().from(lessonSessionSubjects).where(inArray(lessonSessionSubjects.lesson_session_id, demo.sessionIds))).length).toBeGreaterThan(0);
    const roles = await handle.db.select({ role: users.role, username: users.username, must: users.must_change_password }).from(users);
    expect(roles.filter((r) => r.role === 'admin')).toHaveLength(1);
    expect(roles.filter((r) => r.role === 'parent')).toHaveLength(0);
    expect(roles.filter((r) => r.role === 'tutor' && !demo.usernames.includes(r.username ?? '')).every((r) => r.must)).toBe(true);

    const imported = await handle.db.select().from(lessonSessions).where(eq(lessonSessions.admin_note, 'Impor data historis DS'));
    expect(imported).toHaveLength(8);
    expect(imported.every((r) => r.status === 'approved' && r.validity === 'valid' && r.anomaly_analysis_status === 'not_evaluated'
      && r.rate_amount_snapshot !== null && r.reviewed_by_user_id !== null)).toBe(true);
    const kimia = imported.find((r) => r.grade_snapshot === '1 SMA');
    expect(kimia).toMatchObject({ duration_minutes: 120, rate_amount_snapshot: '240000.00', admin_fee_snapshot: '20000.00' });
    expect((await handle.db.select().from(studentGradeHistory).where(notInArray(studentGradeHistory.student_id, [demo.studentId])))).toHaveLength(6);
    // Mapel bernama sama dengan mapel demo (Matematika) tidak diduplikasi.
    const subjectNames = (await handle.db.select({ name: subjects.name }).from(subjects)).map((s) => s.name.toLowerCase());
    expect(new Set(subjectNames).size).toBe(subjectNames.length);

    const firstIds = (await handle.db.select({ id: lessonSessions.id }).from(lessonSessions)).map((r) => r.id).sort();
    await importRealData(handle.db, records, applyOptions());
    expect((await handle.db.select({ id: lessonSessions.id }).from(lessonSessions)).map((r) => r.id).sort()).toEqual(firstIds);
    const [bayu] = await handle.db.select().from(students).where(eq(students.school_name, 'SDIT Arafah'));
    expect(bayu).toMatchObject({ full_name: 'Bayu', grade: '1 SD' });
  });

  it('CSV tidak valid memblokir impor tanpa menyentuh database', async () => {
    const before = await n(lessonSessions);
    const bad = parseCsv('nama_tutor,nama_murid,kelas,asal_sekolah,mata_pelajaran,materi,tanggal_les,jam_mulai,jam_selesai\nA,B,Kelas 13,S,M,,2025-01-01,10:00,09:00\n');
    const result = await importRealData(handle.db, bad, applyOptions());
    expect(result.plan.issues.invalid).toHaveLength(1);
    expect(result.blocked).toMatch(/tidak valid/);
    expect(await n(lessonSessions)).toBe(before);
  });
});
