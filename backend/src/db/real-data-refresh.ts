import { and, asc, count, eq, inArray, like, ne, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import {
  anomalyFlags, lessonSessions, lessonSessionSubjects, studentGradeHistory, students, subjects, tutors, users,
} from './schema.js';
import { IMPORT_NOTE, buildImportPlan, deterministicUuid, summarizePlan } from '../services/import/real-data.js';

export type RefreshOptions =
  | { apply: false }
  | {
    apply: true;
    /** Dipanggil di dalam transaksi SEBELUM perubahan; error membatalkan seluruh pembaruan. */
    writeBackup: (backup: unknown) => Promise<void>;
    now?: Date;
  };

const chunks = <T,>(list: T[], size = 500) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
const IMPORT_HISTORY_REASON = '%impor data historis DS';

/**
 * Perbarui data historis dari dataset DS revisi TANPA menghapus data operasional.
 * Hanya sesi hasil impor (`admin_note = IMPORT_NOTE`) yang diselaraskan dengan CSV berdasarkan ID
 * deterministik: yang hilang dihapus, yang baru disisipkan, yang sama diperbarui (kelas & nominal
 * dihitung ulang dengan aturan tarif saat ini). Akun tutor/password, akun & tautan orang tua, sesi
 * yang diinput lewat aplikasi, dan murid yang tidak ada di CSV tidak disentuh.
 * Default preview (tanpa menulis). Apply berjalan dalam satu transaksi dan memverifikasi hasilnya.
 */
export async function refreshRealData(db: Database, records: Record<string, string>[], options: RefreshOptions) {
  return db.transaction(async (tx) => {
    const [admin] = await tx.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).orderBy(asc(users.created_at)).limit(1);
    if (!admin) throw new Error('Tidak ada akun Admin; jalankan bootstrap admin dulu.');

    const plan = buildImportPlan(records);
    const summary = summarizePlan(plan);
    const base = { plan, summary };
    if (plan.issues.invalid.length) return { ...base, diff: null, blocked: 'Ada baris CSV tidak valid; perbaiki dulu sebelum memperbarui.' };

    // Tutor baru butuh akun + password sementara; di luar cakupan pembaruan → hentikan.
    const existingTutorIds = new Set((await tx.select({ id: tutors.id }).from(tutors)).map((t) => t.id));
    const newTutors = plan.tutors.filter((t) => !existingTutorIds.has(t.id)).map((t) => t.name);
    if (newTutors.length) return { ...base, diff: null, blocked: `Tutor baru di CSV belum punya akun: ${newTutors.join(', ')}. Buat akunnya dulu.` };

    const existingStudentIds = new Set((await tx.select({ id: students.id }).from(students)).map((s) => s.id));
    const newStudents = plan.students.filter((s) => !existingStudentIds.has(s.id));
    const subjectRows = await tx.select({ id: subjects.id, name: subjects.name }).from(subjects);
    const subjectByName = new Map(subjectRows.map((s) => [s.name.toLowerCase(), s.id]));
    const newSubjects = plan.subjects.filter((name) => !subjectByName.has(name.toLowerCase()));
    const subjectIds = new Map(plan.subjects.map((name) => [name, subjectByName.get(name.toLowerCase()) ?? deterministicUuid('subject', name.toLowerCase())]));

    const imported = await tx.select({
      id: lessonSessions.id, rate: lessonSessions.rate_amount_snapshot, fee: lessonSessions.admin_fee_snapshot, grade: lessonSessions.grade_snapshot,
    }).from(lessonSessions).where(eq(lessonSessions.admin_note, IMPORT_NOTE));
    const importedById = new Map(imported.map((s) => [s.id, s]));
    const planIds = new Set(plan.sessions.map((s) => s.id));
    const toDelete = imported.filter((s) => !planIds.has(s.id)).map((s) => s.id);
    const toInsert = plan.sessions.filter((s) => !importedById.has(s.id));
    const toUpdate = plan.sessions.filter((s) => importedById.has(s.id));
    const amountChanged = toUpdate.filter((s) => {
      const old = importedById.get(s.id);
      return Number(old?.rate ?? 0) !== Number(s.rate_amount_snapshot ?? 0) || Number(old?.fee ?? 0) !== Number(s.admin_fee_snapshot ?? 0);
    });
    const [otherSessions] = await tx.select({ n: count() }).from(lessonSessions).where(sql`${lessonSessions.admin_note} is distinct from ${IMPORT_NOTE}`);
    // Sesi yang diinput lewat aplikasi tidak boleh bertabrakan ID dengan sesi CSV.
    const collisions = await tx.select({ id: lessonSessions.id }).from(lessonSessions)
      .where(and(inArray(lessonSessions.id, toInsert.length ? toInsert.map((s) => s.id) : ['00000000-0000-0000-0000-000000000000']), sql`${lessonSessions.admin_note} is distinct from ${IMPORT_NOTE}`));
    if (collisions.length) throw new Error('ID sesi CSV bertabrakan dengan sesi aplikasi; tidak ada data diubah.');

    const diff = {
      sessions: { unchanged_or_updated: toUpdate.length, amount_recalculated: amountChanged.length, insert: toInsert.length, delete: toDelete.length, app_sessions_untouched: otherSessions?.n ?? 0 },
      students: { update: plan.students.length - newStudents.length, insert: newStudents.map((s) => `${s.name} (${s.school})`), not_in_csv_untouched: existingStudentIds.size - (plan.students.length - newStudents.length) },
      subjects_insert: newSubjects,
      registration_sources: plan.students.reduce<Record<string, number>>((acc, s) => { const k = s.registration_source ?? 'tidak diubah'; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {}),
      source_conflicts_resolved: plan.issues.sourceConflicts.length,
    };
    if (!options.apply) return { ...base, diff, blocked: null };

    await tx.execute(sql`LOCK TABLE students, subjects, lesson_sessions, lesson_session_subjects, anomaly_flags, student_grade_history IN SHARE ROW EXCLUSIVE MODE`);
    const planStudentIds = plan.students.map((s) => s.id);
    const importedIds = imported.map((s) => s.id);
    await options.writeBackup({
      version: 1, captured_at: new Date().toISOString(), note: 'Backup sebelum pembaruan data DS (refresh)',
      lesson_sessions: importedIds.length ? (await Promise.all(chunks(importedIds).map((ids) => tx.select().from(lessonSessions).where(inArray(lessonSessions.id, ids))))).flat() : [],
      lesson_session_subjects: importedIds.length ? (await Promise.all(chunks(importedIds).map((ids) => tx.select().from(lessonSessionSubjects).where(inArray(lessonSessionSubjects.lesson_session_id, ids))))).flat() : [],
      anomaly_flags: toDelete.length ? await tx.select().from(anomalyFlags).where(inArray(anomalyFlags.lesson_session_id, toDelete)) : [],
      students: await tx.select().from(students),
      student_grade_history: await tx.select().from(studentGradeHistory),
    });

    const now = options.now ?? new Date();
    if (newSubjects.length) {
      await tx.insert(subjects).values(newSubjects.map((name) => ({ id: subjectIds.get(name) as string, name, is_active: true, created_at: now, updated_at: now })));
    }
    await tx.update(subjects).set({ is_active: true, updated_at: now }).where(and(inArray(subjects.id, [...subjectIds.values()]), eq(subjects.is_active, false)));

    // Murid: sisipkan yang baru; perbarui kelas & sumber pendaftaran murid yang ada di CSV.
    if (newStudents.length) {
      await tx.insert(students).values(newStudents.map((s) => ({
        id: s.id, full_name: s.name, grade: s.grade, school_name: s.school, registration_source: s.registration_source ?? 'other', is_active: true, created_at: now, updated_at: now,
      })));
    }
    for (const s of plan.students) {
      await tx.update(students).set({ grade: s.grade, ...(s.registration_source ? { registration_source: s.registration_source } : {}), updated_at: now }).where(eq(students.id, s.id));
    }
    // Riwayat kelas hasil impor diganti dengan riwayat dari CSV baru; perubahan manual Admin dipertahankan.
    await tx.delete(studentGradeHistory).where(and(inArray(studentGradeHistory.student_id, planStudentIds), like(studentGradeHistory.reason, IMPORT_HISTORY_REASON)));
    const history = plan.students.flatMap((s) => s.history.map((h, i) => ({
      student_id: s.id, grade: h.grade, effective_from: h.effective_from,
      reason: i === 0 ? 'Kelas awal dari impor data historis DS' : 'Perubahan kelas dari impor data historis DS',
      changed_by: admin.id, created_at: now, updated_at: now,
    })));
    for (const batch of chunks(history)) await tx.insert(studentGradeHistory).values(batch).onConflictDoNothing();

    // Sesi: hapus yang tidak ada lagi di CSV (flag & tautan mapel ikut; ringkasan AI ter-cascade).
    for (const ids of chunks(toDelete)) {
      await tx.update(anomalyFlags).set({ related_lesson_session_id: null }).where(inArray(anomalyFlags.related_lesson_session_id, ids));
      await tx.delete(anomalyFlags).where(inArray(anomalyFlags.lesson_session_id, ids));
      await tx.delete(lessonSessions).where(inArray(lessonSessions.id, ids));
    }
    const values = (s: (typeof plan.sessions)[number]) => ({
      tutor_id: s.tutor_id, student_id: s.student_id, lesson_date: s.lesson_date, start_time: s.start_time, end_time: s.end_time,
      duration_minutes: s.duration_minutes, learning_material: s.learning_material, grade_snapshot: s.grade, grade_source: 'history',
      hourly_rate_snapshot: s.hourly_rate_snapshot, rate_amount_snapshot: s.rate_amount_snapshot, admin_fee_snapshot: s.admin_fee_snapshot,
    });
    // Kunci CSV (tutor, murid, tanggal, jam, mapel) sama → hanya kelas, durasi, materi, dan nominal yang diperbarui.
    for (const batch of chunks(toUpdate)) {
      const rows = sql.join(batch.map((s) => sql`(${s.id}::uuid, ${s.grade}, ${s.hourly_rate_snapshot}::numeric, ${s.rate_amount_snapshot}::numeric, ${s.admin_fee_snapshot}::numeric, ${s.learning_material}, ${s.duration_minutes}::int)`), sql`, `);
      await tx.execute(sql`update lesson_sessions as ls set grade_snapshot = v.grade, grade_source = 'history', hourly_rate_snapshot = v.hourly,
        rate_amount_snapshot = v.rate, admin_fee_snapshot = v.fee, learning_material = v.material, duration_minutes = v.duration, updated_at = ${now}
        from (values ${rows}) as v(id, grade, hourly, rate, fee, material, duration) where ls.id = v.id`);
    }
    for (const batch of chunks(toInsert)) {
      await tx.insert(lessonSessions).values(batch.map((s) => ({
        id: s.id, client_submission_id: s.client_submission_id, ...values(s), status: 'approved', anomaly_analysis_status: 'not_evaluated',
        validity: 'valid', validity_reason: null, reviewed_by_user_id: admin.id, submitted_at: s.submitted_at, reviewed_at: now, updated_at: now, admin_note: IMPORT_NOTE,
      })));
    }
    // Mapel per sesi selalu ditulis ulang dari CSV untuk sesi impor.
    const planSessionIds = plan.sessions.map((s) => s.id);
    for (const ids of chunks(planSessionIds)) await tx.delete(lessonSessionSubjects).where(inArray(lessonSessionSubjects.lesson_session_id, ids));
    const links = plan.sessions.flatMap((s) => s.subjects.map((name) => ({ lesson_session_id: s.id, subject_id: subjectIds.get(name) as string })));
    for (const batch of chunks(links, 1000)) await tx.insert(lessonSessionSubjects).values(batch);

    // Verifikasi; selisih apa pun membatalkan transaksi.
    const verify = (label: string, actual: number, expected: number) => {
      if (actual !== expected) throw new Error(`Verifikasi ${label} gagal (${actual} ≠ ${expected}); transaksi dibatalkan.`);
    };
    const [importedNow] = await tx.select({ n: count(), gross: sql<string>`coalesce(sum(${lessonSessions.rate_amount_snapshot}), 0)`, fee: sql<string>`coalesce(sum(${lessonSessions.admin_fee_snapshot}), 0)` })
      .from(lessonSessions).where(eq(lessonSessions.admin_note, IMPORT_NOTE));
    verify('sesi impor', importedNow?.n ?? -1, plan.sessions.length);
    verify('total kotor', Number(importedNow?.gross), summary.months.reduce((n, m) => n + m.gross, 0));
    verify('total potongan', Number(importedNow?.fee), summary.months.reduce((n, m) => n + m.adminFee, 0));
    const [othersNow] = await tx.select({ n: count() }).from(lessonSessions).where(sql`${lessonSessions.admin_note} is distinct from ${IMPORT_NOTE}`);
    verify('sesi aplikasi tidak tersentuh', othersNow?.n ?? -1, otherSessions?.n ?? 0);
    const [linksNow] = await tx.select({ n: count() }).from(lessonSessionSubjects).innerJoin(lessonSessions, eq(lessonSessions.id, lessonSessionSubjects.lesson_session_id)).where(eq(lessonSessions.admin_note, IMPORT_NOTE));
    verify('mapel sesi impor', linksNow?.n ?? -1, links.length);
    const [nullSource] = await tx.select({ n: count() }).from(students).where(and(inArray(students.id, planStudentIds), sql`${students.registration_source} is null`));
    verify('sumber pendaftaran terisi', nullSource?.n ?? -1, 0);
    const [orphanTutors] = await tx.select({ n: count() }).from(tutors).innerJoin(users, eq(users.id, tutors.user_id)).where(ne(users.role, 'tutor'));
    verify('akun tutor', orphanTutors?.n ?? -1, 0);
    return { ...base, diff, blocked: null };
  });
}
