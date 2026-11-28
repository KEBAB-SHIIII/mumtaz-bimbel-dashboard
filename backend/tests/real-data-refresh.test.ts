import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { asc, count, eq } from 'drizzle-orm';
import { TEST_ONLY_CREDENTIALS } from '@mumtaz/contracts/fixtures';
import type { DatabaseHandle } from '../src/db/client.js';
import { importRealData } from '../src/db/real-data-import.js';
import { refreshRealData } from '../src/db/real-data-refresh.js';
import { lessonSessions, lessonSessionSubjects, studentGradeHistory, students, subjects, users } from '../src/db/schema.js';
import { IMPORT_NOTE, buildImportPlan, parseCsv, splitSubjects } from '../src/services/import/real-data.js';
import { seedSyntheticData } from './helpers/seed.js';
import { createTestDatabase } from './helpers/test-db.js';
import { testEnvSource } from './test-env.js';

/** Dataset lama: mapel dipisah `;`, tanpa sumber pendaftaran. */
const OLD_CSV = `nama_tutor,nama_murid,kelas,asal_sekolah,mata_pelajaran,materi,tanggal_les,jam_mulai,jam_selesai
Rina,Bayu,Kelas 1,SDIT Arafah,"Matematika; Mengaji, Tajwid, dan Hafalan",,2026-01-14,15:00,16:00
Rina,Bayu,Kelas 1,SDIT Arafah,Matematika,,2026-01-21,15:00,16:30
Dewi,Tono,Kelas 4,SDN 5 Baamang Hulu,Matematika,,2025-09-10,19:00,20:00
`;

/**
 * Dataset DS revisi: mapel dipisah koma, ada sumber pendaftaran + kolom agregat chart (diabaikan);
 * sesi 21 Jan dihapus DS, sesi Oktober 2025 baru ditambahkan.
 */
const NEW_CSV = `\uFEFFnama_tutor,nama_murid,kelas,asal_sekolah,mata_pelajaran,materi,tanggal_les,jam_mulai,jam_selesai,sumber_pendaftaran,jumlah_sesi_tutor,jumlah_murid_aktif_bulanan,pertumbuhan_murid_vs_bulan_lalu
Rina,Bayu,Kelas 1,SDIT Arafah,"Mengaji, Tajwid, dan Hafalan, Matematika",,2026-01-14,15:00,16:00,Instagram,1,1,0
Dewi,Tono,Kelas 4,SDN 5 Baamang Hulu,Matematika,,2025-09-10,19:00,20:00,Teman,2,1,
Dewi,Tono,Kelas 4,SDN 5 Baamang Hulu,Matematika,,2025-10-08,19:00,20:20,WhatsApp,2,1,0
Dewi,Tono,Kelas 4,SDN 5 Baamang Hulu,Bahasa Inggris,,2025-10-15,19:00,20:00,Teman,2,1,0
`;

describe('dataset DS revisi: pemisah koma & sumber pendaftaran', () => {
  it('memisah mapel dengan koma tanpa memecah "Mengaji, Tajwid, dan Hafalan"', () => {
    expect(splitSubjects('Fiqih, Matematika, Mengaji, Tajwid, dan Hafalan')).toEqual(['Mengaji, Tajwid, dan Hafalan', 'Fiqih', 'Matematika']);
    expect(splitSubjects('Mengaji, Tajwid, dan Hafalan')).toEqual(['Mengaji, Tajwid, dan Hafalan']);
    expect(splitSubjects('Bahasa Inggris, IPAS')).toEqual(['Bahasa Inggris', 'IPAS']);
    // Format lama tetap didukung.
    expect(splitSubjects('Matematika; Mengaji, Tajwid, dan Hafalan')).toEqual(['Matematika', 'Mengaji, Tajwid, dan Hafalan']);
  });

  it('sumber pendaftaran = mayoritas per murid (seri → sesi paling awal); label tak dikenal tidak valid', () => {
    const plan = buildImportPlan(parseCsv(NEW_CSV));
    const source = (name: string) => plan.students.find((s) => s.name === name)?.registration_source;
    expect(source('Bayu')).toBe('instagram');
    expect(source('Tono')).toBe('referral');
    expect(plan.issues.sourceConflicts).toEqual([{ student: 'Tono', school: 'SDN 5 Baamang Hulu', chosen: 'referral', counts: { referral: 2, whatsapp: 1 } }]);
    const tie = buildImportPlan(parseCsv(NEW_CSV.replace('2025-10-15,19:00,20:00,Teman', '2025-10-15,19:00,20:00,Lainnya')));
    expect(tie.students.find((s) => s.name === 'Tono')?.registration_source).toBe('referral');
    expect(buildImportPlan(parseCsv(NEW_CSV.replace(',Instagram,', ',Facebook,'))).issues.invalid).toHaveLength(1);
  });
});

describe('pembaruan data DS (refresh) ke database', () => {
  let handle: DatabaseHandle;
  let appSessionId: string;
  beforeAll(async () => {
    handle = await createTestDatabase();
    await seedSyntheticData(handle.db, {
      adminPassword: TEST_ONLY_CREDENTIALS.adminPassword,
      tutorPassword: TEST_ONLY_CREDENTIALS.tutorPassword,
      parentAccessCodePepper: testEnvSource.PARENT_ACCESS_CODE_PEPPER,
    });
    await importRealData(handle.db, parseCsv(OLD_CSV), {
      apply: true, writeBackup: async () => {}, hashPassword: async (p) => `hash:${p}`, generatePassword: () => 'Temp-Pass-1234',
    });
    // Sesi yang diinput lewat aplikasi setelah impor + tutor yang sudah ganti password.
    const [template] = await handle.db.select().from(lessonSessions).where(eq(lessonSessions.lesson_date, '2025-09-10'));
    if (!template) throw new Error('sesi impor tidak ditemukan');
    appSessionId = randomUUID();
    await handle.db.insert(lessonSessions).values({ ...template, id: appSessionId, client_submission_id: randomUUID(), lesson_date: '2026-11-26', admin_note: null });
    await handle.db.update(users).set({ password_hash: 'hash:diganti-tutor', must_change_password: false }).where(eq(users.username, 'rina'));
    // Nominal lama (aturan tarif sebelum D-27) harus dihitung ulang.
    await handle.db.update(lessonSessions).set({ rate_amount_snapshot: '1000.00', admin_fee_snapshot: '0.00' }).where(eq(lessonSessions.lesson_date, '2026-01-14'));
  });
  afterAll(() => handle.close());

  const imported = () => handle.db.select().from(lessonSessions).where(eq(lessonSessions.admin_note, IMPORT_NOTE)).orderBy(asc(lessonSessions.lesson_date));

  it('preview tidak menulis apa pun dan melaporkan selisih', async () => {
    const before = await imported();
    const preview = await refreshRealData(handle.db, parseCsv(NEW_CSV), { apply: false });
    expect(preview.blocked).toBeNull();
    expect(preview.diff?.sessions).toMatchObject({ unchanged_or_updated: 2, amount_recalculated: 1, insert: 2, delete: 1, app_sessions_untouched: 1 });
    expect(await imported()).toEqual(before);
  });

  it('menyelaraskan sesi impor, mempertahankan akun & sesi aplikasi, mengisi sumber pendaftaran', async () => {
    let backup: Record<string, unknown[]> | undefined;
    await refreshRealData(handle.db, parseCsv(NEW_CSV), { apply: true, writeBackup: async (b) => { backup = b as Record<string, unknown[]>; } });
    expect(backup?.lesson_sessions).toHaveLength(3);

    const rows = await imported();
    expect(rows.map((r) => [r.lesson_date, r.duration_minutes, r.rate_amount_snapshot, r.admin_fee_snapshot])).toEqual([
      ['2025-09-10', 60, '80000.00', '10000.00'],
      ['2025-10-08', 80, '120000.00', '15000.00'], // D-27: 80 menit = 1,5 jam
      ['2025-10-15', 60, '80000.00', '10000.00'],
      ['2026-01-14', 60, '60000.00', '10000.00'], // nominal lama dihitung ulang
    ]);
    // Sesi aplikasi & password tutor tidak tersentuh.
    expect((await handle.db.select().from(lessonSessions).where(eq(lessonSessions.id, appSessionId)))).toHaveLength(1);
    const [rina] = await handle.db.select().from(users).where(eq(users.username, 'rina'));
    expect(rina).toMatchObject({ password_hash: 'hash:diganti-tutor', must_change_password: false });

    const sources = await handle.db.select({ name: students.full_name, source: students.registration_source }).from(students).orderBy(asc(students.full_name));
    expect(sources.filter((s) => ['Bayu', 'Tono'].includes(s.name))).toEqual([{ name: 'Bayu', source: 'instagram' }, { name: 'Tono', source: 'referral' }]);
    // Mapel dipisah koma, tidak terduplikasi.
    const names = (await handle.db.select({ name: subjects.name }).from(subjects)).map((s) => s.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    const jan = rows.find((r) => r.lesson_date === '2026-01-14');
    expect(await handle.db.select({ n: count() }).from(lessonSessionSubjects).where(eq(lessonSessionSubjects.lesson_session_id, jan?.id ?? ''))).toEqual([{ n: 2 }]);
    expect((await handle.db.select().from(studentGradeHistory)).length).toBeGreaterThan(0);
  });

  it('idempoten: dijalankan ulang tidak mengubah apa pun', async () => {
    const before = await imported();
    const again = await refreshRealData(handle.db, parseCsv(NEW_CSV), { apply: true, writeBackup: async () => {} });
    expect(again.diff?.sessions).toMatchObject({ insert: 0, delete: 0, amount_recalculated: 0 });
    expect((await imported()).map(({ updated_at: _u, ...r }) => r)).toEqual(before.map(({ updated_at: _u, ...r }) => r));
  });

  it('tutor baru di CSV memblokir pembaruan', async () => {
    const result = await refreshRealData(handle.db, parseCsv(`${NEW_CSV}Baru,Tono,Kelas 4,SDN 5 Baamang Hulu,Matematika,,2025-10-22,19:00,20:00,Teman,1,1,0\n`), { apply: true, writeBackup: async () => {} });
    expect(result.blocked).toMatch(/Tutor baru/);
  });
});
