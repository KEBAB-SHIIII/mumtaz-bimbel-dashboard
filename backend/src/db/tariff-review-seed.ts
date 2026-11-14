import { and, asc, eq, gte, inArray, lt, not, or, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import { anomalyFlags, lessonSessions, lessonSessionSubjects, parentStudents, students, subjects, tutors, users } from './schema.js';
import { countedSnapshot, gradeTier } from '../services/billing/tariff.js';

/**
 * Seed simulasi Oktober–November 2026 atas permintaan owner (13-11-2026):
 * - Oktober: murid SD memakai data asli yang sudah ada (tidak disentuh); ditambah 10 murid SMP + 10 murid SMA.
 * - November: 10 murid SD yang sudah ada + 5 SMP + 5 SMA (lanjutan murid Oktober).
 * Semua baris seed memakai prefix ID `d0261112-` sehingga bisa diganti ulang tanpa menyentuh data asli.
 */
export const SEED_PREFIX = 'd0261112-';
export const SEED_PERIODS = ['2026-10', '2026-11'] as const;
const WINDOW = { '2026-10': { first: 1, last: 31 }, '2026-11': { first: 2, last: 12 } } as const;
const SESSIONS_PER_STUDENT = { '2026-10': 5, '2026-11': 3 } as const;
const NOVEMBER_SD = 10;
const NOVEMBER_SMP_SMA = 5;
const LEGACY_DUMMY_STUDENT_IDS = Array.from({ length: 18 }, (_, i) => idFor('8003', i + 1));
const SLOTS = ['15:00', '16:30', '13:30', '18:30', '19:30'] as const;
const DURATIONS = [90, 60, 120, 90, 60] as const;

const NEW_STUDENTS = [
  ['Muhammad Rizki Pratama', '1 SMP', 'SMP Negeri 1 Sampit'],
  ['Annisa Rahmawati', '1 SMP', 'SMP Negeri 2 Sampit'],
  ['Farel Aditya Nugraha', '2 SMP', 'SMP Negeri 3 Sampit'],
  ['Nayla Putri Lestari', '2 SMP', 'SMP Islam Terpadu Sampit'],
  ['Galih Saputra', '3 SMP', 'MTs Negeri 1 Kotawaringin Timur'],
  ['Citra Ayu Wulandari', '1 SMP', 'SMP Negeri 1 Sampit'],
  ['Yusuf Hakim', '2 SMP', 'SMP Negeri 2 Sampit'],
  ['Zalfa Nurhaliza', '3 SMP', 'SMP Negeri 1 Sampit'],
  ['Rendi Kurniawan', '3 SMP', 'SMP Negeri 3 Sampit'],
  ['Laila Fitriani', '2 SMP', 'SMP Islam Terpadu Sampit'],
  ['Ahmad Fauzan', '1 SMA', 'SMA Negeri 1 Sampit'],
  ['Putri Ramadhani', '1 SMA', 'SMA Negeri 2 Sampit'],
  ['Dafa Maulana Yusuf', '2 SMA', 'SMA Negeri 1 Sampit'],
  ['Siti Nurhaliza', '2 SMA', 'MAN 1 Kotawaringin Timur'],
  ['Hendra Wijaya', '3 SMA', 'SMA Negeri 3 Sampit'],
  ['Aulia Rahma', '1 SMA', 'SMA Negeri 2 Sampit'],
  ['Ilham Akbar', '2 SMA', 'SMA Negeri 1 Sampit'],
  ['Tiara Anjani', '3 SMA', 'SMA Negeri 2 Sampit'],
  ['Reza Firmansyah', '3 SMA', 'SMA Negeri 3 Sampit'],
  ['Melati Kusuma', '1 SMA', 'MAN 1 Kotawaringin Timur'],
] as const;

type Level = 'SD' | 'SMP' | 'SMA';
const MATERIALS: Record<Level, Record<string, string[]>> = {
  SD: {
    Matematika: ['Perkalian bersusun', 'Pecahan senilai', 'Luas dan keliling', 'Bangun datar', 'Pembagian bersisa'],
    'Bahasa Indonesia': ['Membaca pemahaman', 'Kalimat efektif', 'Menulis karangan sederhana', 'Ide pokok paragraf'],
    IPA: ['Siklus air', 'Bagian tubuh tumbuhan', 'Gaya dan gerak', 'Sumber energi'],
    IPS: ['Kenampakan alam', 'Kegiatan ekonomi', 'Keragaman budaya'],
    'Bahasa Inggris': ['Daily activities', 'Numbers and colors', 'Things in the classroom'],
    Calistung: ['Mengenal huruf', 'Membaca suku kata', 'Menulis kata sederhana'],
  },
  SMP: {
    Matematika: ['Persamaan linear satu variabel', 'Perbandingan dan skala', 'Teorema Pythagoras', 'Bangun ruang sisi datar', 'Statistika dasar'],
    IPA: ['Sistem gerak manusia', 'Gaya dan hukum Newton', 'Getaran dan gelombang', 'Struktur atom sederhana'],
    'Bahasa Inggris': ['Descriptive text', 'Simple past tense', 'Recount text', 'Procedure text'],
  },
  SMA: {
    Matematika: ['Fungsi kuadrat', 'Trigonometri dasar', 'Barisan dan deret', 'Matriks', 'Limit fungsi'],
    IPA: ['Hukum Newton tentang gerak', 'Stoikiometri', 'Listrik dinamis', 'Sel dan jaringan'],
    'Bahasa Inggris': ['Analytical exposition', 'Passive voice', 'Conditional sentences', 'Report text'],
  },
};
const NOTES = [null, 'Sudah lancar, tinggal memperbanyak latihan mandiri.', null, 'Masih perlu pendampingan di soal cerita.', null, 'Fokus dan aktif bertanya selama les.'];

function idFor(kind: string, n: number) {
  return `d0261112-0000-4000-${kind}-${String(n).padStart(12, '0')}`;
}
const pad = (n: number) => String(n).padStart(2, '0');
/** Ambil elemen siklik; array di modul ini tidak pernah kosong. */
const at = <T,>(list: readonly T[], index: number): T => {
  const value = list[index % list.length];
  if (value === undefined) throw new Error('Daftar seed kosong.');
  return value;
};
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toTime = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const levelOf = (grade: string): Level => (grade.endsWith(' SMA') ? 'SMA' : grade.endsWith(' SMP') ? 'SMP' : 'SD');
const isSunday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() === 0;

type Busy = { tutor_id: string; student_id: string; lesson_date: string; start: number; end: number };
type Plan = { studentId: string; grade: string; tutorId: string; slot: string; subject: string };
export type SeedInput = {
  tutorIds: string[];
  subjectIds: Record<string, string>;
  sdStudents: { id: string; grade: string; tutorId: string | null; startTime: string | null; subject: string | null }[];
  busy: Busy[];
};

/** Bangun data seed secara deterministik; jadwal tidak bentrok dengan sesi tutor yang sudah ada. */
export function buildSeedData(input: SeedInput) {
  if (input.tutorIds.length === 0) throw new Error('Minimal satu tutor aktif dibutuhkan.');
  const studentRows = NEW_STUDENTS.map(([full_name, grade, school_name], i) => ({
    id: idFor('8005', i + 1), full_name, grade, school_name, is_active: true,
  }));
  const subjectNames = (level: Level) => Object.keys(MATERIALS[level]).filter((name) => input.subjectIds[name]);
  const plan = (studentId: string, grade: string, i: number, base?: { tutorId?: string | undefined; slot?: string | undefined; subject?: string | undefined }): Plan => {
    const names = subjectNames(levelOf(grade));
    const subject = base?.subject && names.includes(base.subject) ? base.subject : names[i % names.length];
    if (!subject) throw new Error(`Mapel untuk jenjang ${levelOf(grade)} tidak tersedia.`);
    return {
      studentId, grade, subject,
      tutorId: base?.tutorId ?? at(input.tutorIds, i),
      slot: base?.slot ?? at(SLOTS, i),
    };
  };
  const smp = studentRows.filter((s) => s.grade.endsWith(' SMP')).map((s, i) => plan(s.id, s.grade, i));
  const sma = studentRows.filter((s) => s.grade.endsWith(' SMA')).map((s, i) => plan(s.id, s.grade, i + 2));
  const sd = input.sdStudents.slice(0, NOVEMBER_SD).map((s, i) => plan(s.id, s.grade, i, {
    tutorId: s.tutorId ?? undefined,
    // Jam mulai di atas 20.00 dihindari agar seed tidak memicu kandidat anomali jam malam.
    slot: s.startTime && toMin(s.startTime) <= 20 * 60 ? s.startTime.slice(0, 5) : undefined, subject: s.subject ?? undefined,
  }));
  const roster = {
    '2026-10': [...smp, ...sma],
    '2026-11': [...sd, ...smp.slice(0, NOVEMBER_SMP_SMA), ...sma.slice(0, NOVEMBER_SMP_SMA)],
  } as const;

  const busy = [...input.busy];
  const free = (tutorId: string, studentId: string, date: string, start: number, end: number) =>
    !busy.some((b) => b.lesson_date === date && (b.student_id === studentId || (b.tutor_id === tutorId && b.start < end && b.end > start)));

  const sessionRows: (typeof lessonSessions.$inferInsert & { id: string })[] = [];
  const sessionSubjects: { lesson_session_id: string; subject_id: string }[] = [];
  let n = 0;
  for (const period of SEED_PERIODS) {
    const { first, last } = WINDOW[period];
    const days = Array.from({ length: last - first + 1 }, (_, i) => `${period}-${pad(first + i)}`).filter((d) => !isSunday(d));
    const count = SESSIONS_PER_STUDENT[period];
    for (const [i, p] of roster[period].entries()) {
      const step = Math.floor(days.length / count);
      const materials = MATERIALS[levelOf(p.grade)][p.subject] ?? [];
      const subjectId = input.subjectIds[p.subject];
      if (!subjectId) throw new Error(`Mapel ${p.subject} tidak tersedia.`);
      for (let k = 0; k < count; k++) {
        n += 1;
        const duration = at(DURATIONS, i + k);
        const preferredSlots = [p.slot, ...SLOTS.filter((s) => s !== p.slot)];
        let placed: { date: string; start: number } | null = null;
        const target = (i % step) + k * step;
        for (const slot of preferredSlots) {
          for (let offset = 0; offset < days.length && !placed; offset++) {
            const date = at(days, target + offset);
            const start = toMin(slot);
            if (free(p.tutorId, p.studentId, date, start, start + duration)) placed = { date, start };
          }
          if (placed) break;
        }
        if (!placed) throw new Error('Tidak menemukan jadwal kosong untuk seed.');
        const end = placed.start + duration;
        busy.push({ tutor_id: p.tutorId, student_id: p.studentId, lesson_date: placed.date, start: placed.start, end });
        const submittedAt = new Date(`${placed.date}T${toTime(Math.min(end + 45 + (n % 5) * 17, 23 * 60 + 50))}:00+07:00`);
        const material = at(materials, i + k);
        const id = idFor('8006', n);
        sessionRows.push({
          id, client_submission_id: idFor('9001', n),
          tutor_id: p.tutorId, student_id: p.studentId,
          lesson_date: placed.date, start_time: toTime(placed.start), end_time: toTime(end),
          duration_minutes: duration, learning_material: material,
          learning_notes: NOTES[(i + k) % NOTES.length] ?? null,
          next_focus: `Lanjut: ${at(materials, i + k + 1)}`,
          status: 'approved', validity: 'valid', validity_reason: null, anomaly_analysis_status: 'completed',
          ...countedSnapshot(p.grade, duration), reviewed_by_user_id: null,
          submitted_at: submittedAt, reviewed_at: submittedAt, updated_at: submittedAt, admin_note: null,
        });
        sessionSubjects.push({ lesson_session_id: id, subject_id: subjectId });
        if (k === 1 && input.subjectIds['Bahasa Inggris'] && p.subject !== 'Bahasa Inggris' && levelOf(p.grade) !== 'SD') {
          sessionSubjects.push({ lesson_session_id: id, subject_id: input.subjectIds['Bahasa Inggris'] });
        }
      }
    }
  }
  return { students: studentRows, sessions: sessionRows, sessionSubjects };
}

export function summarizeSeed(data: ReturnType<typeof buildSeedData>, grades: Map<string, string>) {
  return SEED_PERIODS.map((period) => {
    const rows = data.sessions.filter((s) => s.lesson_date.startsWith(period));
    const studentsByLevel: Record<Level, Set<string>> = { SD: new Set(), SMP: new Set(), SMA: new Set() };
    for (const s of rows) studentsByLevel[levelOf(grades.get(s.student_id) ?? '')].add(s.student_id);
    const gross = rows.reduce((sum, s) => sum + Number(s.rate_amount_snapshot), 0);
    const adminFee = rows.reduce((sum, s) => sum + Number(s.admin_fee_snapshot), 0);
    return {
      period, sessions: rows.length,
      students: { SD: studentsByLevel.SD.size, SMP: studentsByLevel.SMP.size, SMA: studentsByLevel.SMA.size },
      gross, adminFee, tutorNet: gross - adminFee,
    };
  });
}

const isSeedSession = sql`${lessonSessions.id}::text like ${`${SEED_PREFIX}%`}`;
const isSeedStudent = sql`${students.id}::text like ${`${SEED_PREFIX}%`}`;

/** Default hanya preview. Apply wajib menyimpan backup sebelum mengganti seluruh baris seed. */
export async function seedTariffReview(
  db: Database,
  options: { apply: false } | { apply: true; writeBackup: (backup: unknown) => Promise<void> },
) {
  return db.transaction(async (tx) => {
    if (options.apply) await tx.execute(sql`LOCK TABLE lesson_sessions, lesson_session_subjects, anomaly_flags, students IN SHARE ROW EXCLUSIVE MODE`);
    const activeTutors = await tx.select({ id: tutors.id }).from(tutors).innerJoin(users, eq(tutors.user_id, users.id))
      .where(and(eq(tutors.is_active, true), eq(users.is_active, true))).orderBy(asc(users.full_name));
    const subjectRows = await tx.select({ id: subjects.id, name: subjects.name }).from(subjects).where(eq(subjects.is_active, true));
    const subjectIds = Object.fromEntries(subjectRows.map((s) => [s.name, s.id]));
    const subjectNames = new Map(subjectRows.map((s) => [s.id, s.name]));

    const realSessions = await tx.select().from(lessonSessions)
      .where(and(not(isSeedSession), gte(lessonSessions.lesson_date, '2026-10-01'), lt(lessonSessions.lesson_date, '2026-12-01')));
    const realLinks = realSessions.length ? await tx.select().from(lessonSessionSubjects)
      .where(inArray(lessonSessionSubjects.lesson_session_id, realSessions.map((s) => s.id))) : [];
    const sdCandidates = (await tx.select().from(students).where(and(eq(students.is_active, true), not(isSeedStudent))).orderBy(asc(students.full_name)))
      .filter((s) => s.grade.endsWith(' SD') && gradeTier(s.grade));
    const mode = <T,>(values: T[]) => {
      const counts = new Map<T, number>();
      for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
      return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    };
    const october = realSessions.filter((s) => s.lesson_date < '2026-11-01');
    // Utamakan murid SD yang aktif les di Oktober agar November terasa sebagai kelanjutan.
    const sdStudents = sdCandidates.map((s) => {
      const own = october.filter((ls) => ls.student_id === s.id);
      const ownIds = new Set(own.map((ls) => ls.id));
      return {
        id: s.id, grade: s.grade, sessions: own.length,
        tutorId: mode(own.map((ls) => ls.tutor_id)),
        startTime: mode(own.map((ls) => ls.start_time).filter((t): t is string => Boolean(t))),
        subject: mode(realLinks.filter((l) => ownIds.has(l.lesson_session_id)).map((l) => subjectNames.get(l.subject_id) ?? '')),
      };
    }).sort((a, b) => Number(b.sessions > 0) - Number(a.sessions > 0));

    const busy = realSessions.flatMap((s) => (s.start_time && s.end_time ? [{
      tutor_id: s.tutor_id, student_id: s.student_id, lesson_date: s.lesson_date,
      start: toMin(s.start_time), end: toMin(s.end_time),
    }] : []));
    const data = buildSeedData({ tutorIds: activeTutors.map((t) => t.id), subjectIds, sdStudents, busy });

    const oldSessions = await tx.select().from(lessonSessions).where(isSeedSession);
    const ids = oldSessions.map((s) => s.id);
    const legacyStudents = await tx.select().from(students).where(inArray(students.id, LEGACY_DUMMY_STUDENT_IDS));
    const legacyParentLinks = await tx.select().from(parentStudents).where(inArray(parentStudents.student_id, LEGACY_DUMMY_STUDENT_IDS));
    if (legacyParentLinks.length) throw new Error('Murid dummy lama terhubung ke orang tua; tidak ada data diubah.');
    const existingNew = await tx.select().from(students).where(inArray(students.id, data.students.map((s) => s.id)));

    const grades = new Map([...sdCandidates, ...data.students].map((s) => [s.id, s.grade]));
    const summary = {
      replacedSessions: ids.length,
      legacyStudentsRemoved: legacyStudents.length,
      studentsAdded: data.students.length - existingNew.length,
      months: summarizeSeed(data, grades),
    };
    if (!options.apply) return summary;

    const oldLinks = ids.length ? await tx.select().from(lessonSessionSubjects).where(inArray(lessonSessionSubjects.lesson_session_id, ids)) : [];
    const oldFlags = ids.length ? await tx.select().from(anomalyFlags).where(or(inArray(anomalyFlags.lesson_session_id, ids), inArray(anomalyFlags.related_lesson_session_id, ids))) : [];
    await options.writeBackup({
      version: 2, captured_at: new Date().toISOString(),
      lesson_sessions: oldSessions, lesson_session_subjects: oldLinks, anomaly_flags: oldFlags,
      legacy_students: legacyStudents, existing_seed_students: existingNew,
      replacement_session_ids: data.sessions.map((s) => s.id),
    });
    if (ids.length) {
      await tx.delete(anomalyFlags).where(inArray(anomalyFlags.lesson_session_id, ids));
      await tx.update(anomalyFlags).set({ related_lesson_session_id: null }).where(inArray(anomalyFlags.related_lesson_session_id, ids));
      await tx.delete(lessonSessions).where(inArray(lessonSessions.id, ids)); // mapel terhapus melalui FK cascade
    }
    // Murid "[Dummy tarif]" lama tidak lagi punya sesi maupun orang tua, jadi aman dihapus.
    if (legacyStudents.length) await tx.delete(students).where(inArray(students.id, LEGACY_DUMMY_STUDENT_IDS));
    for (const s of data.students) {
      await tx.insert(students).values(s).onConflictDoUpdate({
        target: students.id, set: { full_name: s.full_name, grade: s.grade, school_name: s.school_name, is_active: true },
      });
    }
    await tx.insert(lessonSessions).values(data.sessions);
    await tx.insert(lessonSessionSubjects).values(data.sessionSubjects);

    const actual = await tx.select().from(lessonSessions).where(isSeedSession);
    if (actual.length !== data.sessions.length) throw new Error('Verifikasi jumlah sesi gagal; transaksi dibatalkan.');
    for (const row of actual) {
      const expected = data.sessions.find((s) => s.id === row.id);
      if (!expected || Number(row.rate_amount_snapshot) !== Number(expected.rate_amount_snapshot) || Number(row.admin_fee_snapshot) !== Number(expected.admin_fee_snapshot)) {
        throw new Error('Verifikasi snapshot gagal; transaksi dibatalkan.');
      }
    }
    return summary;
  });
}
