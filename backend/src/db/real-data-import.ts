import { and, asc, count, eq, inArray, ne, notInArray, sql, type SQL } from 'drizzle-orm';
import type { Database } from './client.js';
import {
  anomalyFlags, appSessions, lessonSessions, lessonSessionSubjects, parentStudents, sheetExportRuns,
  studentGradeAudit, studentGradeHistory, students, subjects, tutors, users,
} from './schema.js';
import { IMPORT_NOTE, buildImportPlan, deterministicUuid, summarizePlan } from '../services/import/real-data.js';

/** Murid demo yang dipertahankan beserta sesi, flag, tutor, dan mapelnya (permintaan user 19-11-2026). */
export const DEFAULT_KEEP_STUDENT_NAMES = ['data testing'];

export interface TutorCredential { name: string; username: string; temporaryPassword: string }

export type ImportOptions = { keepStudentNames?: string[] } & (
  | { apply: false }
  | {
    apply: true;
    /** Dipanggil di dalam transaksi SEBELUM penghapusan; error membatalkan seluruh impor. */
    writeBackup: (backup: unknown) => Promise<void>;
    hashPassword: (password: string) => Promise<string>;
    generatePassword: () => string;
    now?: Date;
  });

const chunks = <T,>(list: T[], size = 500) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
/** `col NOT IN (ids)`; tanpa ids → selalu benar. */
const notIn = (col: Parameters<typeof notInArray>[0], ids: string[]): SQL => (ids.length ? notInArray(col, ids) : sql`true`);

/**
 * Ganti seluruh data operasional dummy dengan data asli hasil cleaning DS.
 * Dipertahankan: akun Admin dan murid demo (`keepStudentNames`) beserta sesi, flag, tutor, dan mapelnya.
 * Default preview (tanpa menulis). Apply berjalan dalam satu transaksi dan memverifikasi hasilnya.
 */
export async function importRealData(db: Database, records: Record<string, string>[], options: ImportOptions) {
  const keepNames = (options.keepStudentNames ?? DEFAULT_KEEP_STUDENT_NAMES).map((n) => n.trim().toLowerCase());
  return db.transaction(async (tx) => {
    const [admin] = await tx.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).orderBy(asc(users.created_at)).limit(1);
    if (!admin) throw new Error('Tidak ada akun Admin; jalankan bootstrap admin dulu.');
    const [nonAdminExports] = await tx.select({ n: count() }).from(sheetExportRuns).innerJoin(users, eq(users.id, sheetExportRuns.exported_by_user_id)).where(ne(users.role, 'admin'));
    if ((nonAdminExports?.n ?? 0) > 0) throw new Error('Ada riwayat ekspor milik akun non-admin; tidak ada data diubah.');

    // Data demo yang dipertahankan.
    const keptStudents = keepNames.length
      ? await tx.select().from(students).where(inArray(sql`lower(${students.full_name})`, keepNames)) : [];
    const keptStudentIds = keptStudents.map((s) => s.id);
    const keptSessions = keptStudentIds.length ? await tx.select({ id: lessonSessions.id, tutor_id: lessonSessions.tutor_id }).from(lessonSessions).where(inArray(lessonSessions.student_id, keptStudentIds)) : [];
    const keptSessionIds = keptSessions.map((s) => s.id);
    const keptTutorIds = [...new Set(keptSessions.map((s) => s.tutor_id))];
    const keptTutors = keptTutorIds.length ? await tx.select({ id: tutors.id, user_id: tutors.user_id, username: users.username, name: users.full_name })
      .from(tutors).innerJoin(users, eq(users.id, tutors.user_id)).where(inArray(tutors.id, keptTutorIds)) : [];
    const keptUserIds = keptTutors.map((t) => t.user_id);
    const keptSubjects = keptSessionIds.length ? await tx.selectDistinct({ id: subjects.id, name: subjects.name }).from(subjects)
      .innerJoin(lessonSessionSubjects, eq(lessonSessionSubjects.subject_id, subjects.id)).where(inArray(lessonSessionSubjects.lesson_session_id, keptSessionIds)) : [];
    const keptSubjectIds = keptSubjects.map((s) => s.id);
    const kept = {
      students: keptStudents.map((s) => s.full_name), sessions: keptSessionIds.length,
      tutors: keptTutors.map((t) => `${t.name} (${t.username})`), subjects: keptSubjects.map((s) => s.name),
    };

    const plan = buildImportPlan(records, { reservedUsernames: keptTutors.map((t) => t.username ?? '') });
    const summary = summarizePlan(plan);
    if (plan.issues.invalid.length) {
      return { plan, summary, kept, existing: null, credentials: [] as TutorCredential[], blocked: 'Ada baris CSV tidak valid; perbaiki dulu sebelum impor.' };
    }
    const keptStudentKeys = new Set(keptStudents.map((s) => `${s.full_name.toLowerCase()}|${s.school_name.toLowerCase()}`));
    if (plan.students.some((s) => keptStudentKeys.has(`${s.name.toLowerCase()}|${s.school.toLowerCase()}`))) {
      throw new Error('Murid demo yang dipertahankan juga ada di CSV; tidak ada data diubah.');
    }

    const existing = {
      lesson_sessions: (await tx.select({ n: count() }).from(lessonSessions))[0]?.n ?? 0,
      students: (await tx.select({ n: count() }).from(students))[0]?.n ?? 0,
      tutors: (await tx.select({ n: count() }).from(tutors))[0]?.n ?? 0,
      subjects: (await tx.select({ n: count() }).from(subjects))[0]?.n ?? 0,
      non_admin_users: (await tx.select({ n: count() }).from(users).where(ne(users.role, 'admin')))[0]?.n ?? 0,
      parent_students: (await tx.select({ n: count() }).from(parentStudents))[0]?.n ?? 0,
      anomaly_flags: (await tx.select({ n: count() }).from(anomalyFlags))[0]?.n ?? 0,
    };
    if (!options.apply) return { plan, summary, kept, existing, credentials: [] as TutorCredential[], blocked: null };

    await tx.execute(sql`LOCK TABLE users, tutors, students, subjects, lesson_sessions, lesson_session_subjects, anomaly_flags,
      student_grade_history, student_grade_audit, parent_students IN SHARE ROW EXCLUSIVE MODE`);
    await options.writeBackup({
      version: 1, captured_at: new Date().toISOString(), note: 'Backup sebelum impor data asli DS', kept,
      users: await tx.select().from(users).where(ne(users.role, 'admin')),
      tutors: await tx.select().from(tutors),
      students: await tx.select().from(students),
      subjects: await tx.select().from(subjects),
      lesson_sessions: await tx.select().from(lessonSessions),
      lesson_session_subjects: await tx.select().from(lessonSessionSubjects),
      anomaly_flags: await tx.select().from(anomalyFlags),
      student_grade_history: await tx.select().from(studentGradeHistory),
      student_grade_audit: await tx.select().from(studentGradeAudit),
      parent_students: await tx.select().from(parentStudents),
    });

    // Hapus data dummy, kecuali data demo.
    await tx.delete(anomalyFlags).where(notIn(anomalyFlags.lesson_session_id, keptSessionIds));
    if (keptSessionIds.length) {
      await tx.update(anomalyFlags).set({ related_lesson_session_id: null })
        .where(and(sql`${anomalyFlags.related_lesson_session_id} is not null`, notIn(anomalyFlags.related_lesson_session_id, keptSessionIds)));
    }
    await tx.delete(lessonSessionSubjects).where(notIn(lessonSessionSubjects.lesson_session_id, keptSessionIds));
    await tx.delete(lessonSessions).where(notIn(lessonSessions.id, keptSessionIds));
    await tx.delete(studentGradeAudit).where(notIn(studentGradeAudit.student_id, keptStudentIds));
    await tx.delete(studentGradeHistory).where(notIn(studentGradeHistory.student_id, keptStudentIds));
    // Semua akun orang tua masih dummy (data asli belum punya data wali), termasuk tautan ke murid demo.
    await tx.delete(parentStudents);
    await tx.delete(students).where(notIn(students.id, keptStudentIds));
    await tx.delete(subjects).where(notIn(subjects.id, keptSubjectIds));
    await tx.delete(tutors).where(notIn(tutors.id, keptTutorIds));
    // Session login tutor/orang tua yang akunnya dihapus ikut dicabut.
    await tx.delete(appSessions).where(and(sql`(${appSessions.sess}::jsonb ->> 'role') in ('tutor', 'parent')`,
      keptUserIds.length ? sql`coalesce(${appSessions.sess}::jsonb ->> 'userId', '') not in (${sql.join(keptUserIds.map((id) => sql`${id}`), sql`, `)})` : sql`true`));
    await tx.delete(users).where(and(ne(users.role, 'admin'), notIn(users.id, keptUserIds)));

    // Insert data asli.
    const now = options.now ?? new Date();
    const credentials: TutorCredential[] = [];
    for (const t of plan.tutors) {
      const temporaryPassword = options.generatePassword();
      credentials.push({ name: t.name, username: t.username, temporaryPassword });
      await tx.insert(users).values({
        id: t.userId, full_name: t.name, username: t.username, password_hash: await options.hashPassword(temporaryPassword),
        must_change_password: true, role: 'tutor', is_active: true, created_at: now, updated_at: now,
      });
    }
    await tx.insert(tutors).values(plan.tutors.map((t) => ({ id: t.id, user_id: t.userId, is_active: true, created_at: now, updated_at: now })));

    // Mapel dengan nama sama (tanpa beda huruf besar/kecil) dengan mapel demo memakai baris yang sudah ada.
    const keptSubjectByName = new Map(keptSubjects.map((s) => [s.name.toLowerCase(), s.id]));
    const subjectIds = new Map(plan.subjects.map((name) => [name, keptSubjectByName.get(name.toLowerCase()) ?? deterministicUuid('subject', name.toLowerCase())]));
    const newSubjects = plan.subjects.filter((name) => !keptSubjectByName.has(name.toLowerCase()));
    if (newSubjects.length) {
      await tx.insert(subjects).values(newSubjects.map((name) => ({ id: subjectIds.get(name) as string, name, is_active: true, created_at: now, updated_at: now })));
    }
    await tx.update(subjects).set({ is_active: true }).where(inArray(subjects.id, [...subjectIds.values()]));

    for (const batch of chunks(plan.students)) {
      await tx.insert(students).values(batch.map((s) => ({ id: s.id, full_name: s.name, grade: s.grade, school_name: s.school, is_active: true, created_at: now, updated_at: now })));
    }
    const history = plan.students.flatMap((s) => s.history.map((h, i) => ({
      student_id: s.id, grade: h.grade, effective_from: h.effective_from,
      reason: i === 0 ? 'Kelas awal dari impor data historis DS' : 'Perubahan kelas dari impor data historis DS',
      changed_by: admin.id, created_at: now, updated_at: now,
    })));
    for (const batch of chunks(history)) await tx.insert(studentGradeHistory).values(batch);

    for (const batch of chunks(plan.sessions)) {
      await tx.insert(lessonSessions).values(batch.map((s) => ({
        id: s.id, client_submission_id: s.client_submission_id, tutor_id: s.tutor_id, student_id: s.student_id,
        lesson_date: s.lesson_date, start_time: s.start_time, end_time: s.end_time, duration_minutes: s.duration_minutes,
        learning_material: s.learning_material, status: 'approved', anomaly_analysis_status: 'not_evaluated',
        validity: 'valid', validity_reason: null, grade_snapshot: s.grade, grade_source: 'history',
        hourly_rate_snapshot: s.hourly_rate_snapshot, rate_amount_snapshot: s.rate_amount_snapshot, admin_fee_snapshot: s.admin_fee_snapshot,
        reviewed_by_user_id: admin.id, submitted_at: s.submitted_at, reviewed_at: now, updated_at: now, admin_note: IMPORT_NOTE,
      })));
    }
    const links = plan.sessions.flatMap((s) => s.subjects.map((name) => ({ lesson_session_id: s.id, subject_id: subjectIds.get(name) as string })));
    for (const batch of chunks(links, 1000)) await tx.insert(lessonSessionSubjects).values(batch);

    // Verifikasi; selisih apa pun membatalkan transaksi.
    const verify = async (label: string, actual: Promise<{ n: number }[]>, expected: number) => {
      const n = (await actual)[0]?.n ?? -1;
      if (n !== expected) throw new Error(`Verifikasi ${label} gagal (${n} ≠ ${expected}); transaksi dibatalkan.`);
    };
    await verify('sesi', tx.select({ n: count() }).from(lessonSessions), plan.sessions.length + keptSessionIds.length);
    await verify('murid', tx.select({ n: count() }).from(students), plan.students.length + keptStudentIds.length);
    await verify('tutor', tx.select({ n: count() }).from(tutors), plan.tutors.length + keptTutorIds.length);
    await verify('mapel', tx.select({ n: count() }).from(subjects), new Set([...subjectIds.values(), ...keptSubjectIds]).size);
    await verify('mapel sesi impor', tx.select({ n: count() }).from(lessonSessionSubjects).where(inArray(lessonSessionSubjects.lesson_session_id,
      tx.select({ id: lessonSessions.id }).from(lessonSessions).where(eq(lessonSessions.admin_note, IMPORT_NOTE)))), links.length);
    const [totals] = await tx.select({ gross: sql<string>`coalesce(sum(${lessonSessions.rate_amount_snapshot}), 0)` }).from(lessonSessions).where(eq(lessonSessions.admin_note, IMPORT_NOTE));
    if (Number(totals?.gross) !== summary.months.reduce((n, m) => n + m.gross, 0)) throw new Error('Verifikasi total tarif gagal; transaksi dibatalkan.');

    return { plan, summary, kept, existing, credentials, blocked: null };
  });
}
