import { createHash } from 'node:crypto';
import { z } from 'zod';
import { GRADE_OPTIONS, timeToMinutes, usernameSchema } from '@mumtaz/contracts';
import { countedSnapshot } from '../billing/tariff.js';
import { BASELINE_DATE, hourlyFor } from '../master-data/grade-history.js';

/**
 * Perencanaan impor data asli dari CSV hasil cleaning tim DS (docs/dataset/MASALAH-DATA-MIGRASI.md).
 * Modul murni: tidak menyentuh database, sehingga preview dan test bisa memakai logika yang sama.
 */

export const CSV_COLUMNS = [
  'nama_tutor', 'nama_murid', 'kelas', 'asal_sekolah', 'mata_pelajaran', 'materi', 'tanggal_les', 'jam_mulai', 'jam_selesai',
] as const;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam HH:MM');
const text = (max: number) => z.string().trim().min(1).max(max);
export const csvRowSchema = z.object({
  nama_tutor: text(120),
  nama_murid: text(120),
  kelas: text(30),
  asal_sekolah: text(120),
  mata_pelajaran: text(255),
  materi: z.string().trim().max(255),
  tanggal_les: z.iso.date(),
  jam_mulai: time,
  jam_selesai: time,
}).refine((r) => timeToMinutes(r.jam_selesai) > timeToMinutes(r.jam_mulai), { message: 'Jam selesai harus setelah jam mulai' });
export type CsvRow = z.infer<typeof csvRowSchema>;

/** Parser CSV RFC 4180 sederhana (kutip ganda, koma di dalam kutip, BOM). */
export function parseCsv(content: string): Record<string, string>[] {
  const source = content.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { record.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      record.push(field); field = '';
      if (record.some((v) => v !== '')) records.push(record);
      record = [];
    } else field += ch;
  }
  record.push(field);
  if (record.some((v) => v !== '')) records.push(record);

  const [header, ...body] = records;
  if (!header) throw new Error('CSV kosong.');
  const names = header.map((h) => h.trim());
  const missing = CSV_COLUMNS.filter((c) => !names.includes(c));
  if (missing.length) throw new Error(`Kolom CSV hilang: ${missing.join(', ')}`);
  return body.map((values, index) => {
    if (values.length !== names.length) throw new Error(`Baris ${index + 2}: jumlah kolom ${values.length}, seharusnya ${names.length}.`);
    return Object.fromEntries(names.map((n, i) => [n, values[i] ?? '']));
  });
}

/** Kelas versi sheet owner → opsi kelas aplikasi (PAUD sampai SMA). */
export function mapGrade(kelas: string): (typeof GRADE_OPTIONS)[number] {
  const k = kelas.trim().replace(/\s+/g, ' ');
  if (k === 'PAUD' || k === 'Belum Sekolah') return 'PAUD';
  if (k === 'TK A' || k === 'TK B' || k === 'TK') return 'TK';
  const match = /^Kelas (\d{1,2})$/.exec(k);
  const n = match ? Number(match[1]) : NaN;
  if (n >= 1 && n <= 6) return `${n} SD` as (typeof GRADE_OPTIONS)[number];
  if (n >= 7 && n <= 9) return `${n - 6} SMP` as (typeof GRADE_OPTIONS)[number];
  if (n >= 10 && n <= 12) return `${n - 9} SMA` as (typeof GRADE_OPTIONS)[number];
  throw new Error(`Kelas tidak dikenali: "${kelas}"`);
}

/** Mapel dipisah `;` (nama mapel sendiri boleh memuat koma, mis. "Mengaji, Tajwid, dan Hafalan"). */
export function splitSubjects(value: string): string[] {
  return [...new Set(value.split(';').map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean))];
}

/** UUID v5-style deterministik dari teks. */
export function deterministicUuid(namespace: string, value: string): string {
  const hex = createHash('sha1').update(`${namespace}:${value}`).digest('hex');
  const variant = ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
}

/** Username huruf kecil dari nama: "Dewi Lestari" → "dewi.lestari"; bentrok diberi akhiran angka. */
export function makeUsername(name: string, taken: Set<string>): string {
  const base = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 60) || 'tutor';
  let candidate = base.length >= 3 ? base : `${base}.tutor`;
  for (let n = 2; taken.has(candidate); n++) candidate = `${base}${n}`;
  taken.add(candidate);
  return usernameSchema.parse(candidate);
}

export const IMPORT_NOTE = 'Impor data historis DS';
const TZ_OFFSET = '+07:00';
const norm = (s: string) => s.trim().replace(/\s+/g, ' ');

export interface PlannedTutor { id: string; userId: string; name: string; username: string; sessions: number }
export interface PlannedStudent {
  id: string; name: string; school: string; grade: string;
  history: { grade: string; effective_from: string }[];
  sessions: number;
}
export interface PlannedSession {
  id: string; client_submission_id: string; tutor_id: string; student_id: string;
  lesson_date: string; start_time: string; end_time: string; duration_minutes: number;
  learning_material: string; grade: string; subjects: string[];
  rate_amount_snapshot: string | null; admin_fee_snapshot: string | null; hourly_rate_snapshot: string | null;
  submitted_at: Date;
}
export interface ImportIssue { line: number; message: string }

/** Tahun ajaran Juli–Juni: 2025-08-01 → "2025/2026", 2026-03-01 → "2025/2026". */
export function schoolYear(date: string): string {
  const year = Number(date.slice(0, 4));
  return Number(date.slice(5, 7)) >= 7 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
}

const gradeOrder = (g: string) => GRADE_OPTIONS.indexOf(g as (typeof GRADE_OPTIONS)[number]);

/** Batas wajar sesi (aturan validitas D-25); di luar batas → baris dilewati, tidak diimpor. */
export const LESSON_WINDOW = { minDuration: 30, maxDuration: 180, earliestStart: 7 * 60, latestStart: 21 * 60 } as const;
export function unusualTimeReason(start: string, end: string): string | null {
  const s = timeToMinutes(start);
  const d = timeToMinutes(end) - s;
  if (d < LESSON_WINDOW.minDuration || d > LESSON_WINDOW.maxDuration) return `durasi ${d} menit`;
  if (s < LESSON_WINDOW.earliestStart || s > LESSON_WINDOW.latestStart) return `mulai ${start}`;
  return null;
}

export interface BuildPlanOptions {
  /** Username yang sudah dipakai akun yang dipertahankan (mis. tutor demo). */
  reservedUsernames?: Iterable<string>;
}

export function buildImportPlan(records: Record<string, string>[], options: BuildPlanOptions = {}) {
  const invalid: ImportIssue[] = [];
  const unusualTime: ImportIssue[] = [];
  const rows: { line: number; row: CsvRow; studentKey: string; rawGrade: string; subjects: string[] }[] = [];
  records.forEach((raw, i) => {
    const line = i + 2;
    const parsed = csvRowSchema.safeParse(raw);
    if (!parsed.success) { invalid.push({ line, message: parsed.error.issues.map((x) => `${x.path.join('.') || 'baris'}: ${x.message}`).join('; ') }); return; }
    const row = { ...parsed.data, nama_tutor: norm(parsed.data.nama_tutor), nama_murid: norm(parsed.data.nama_murid), asal_sekolah: norm(parsed.data.asal_sekolah) };
    const subjects = splitSubjects(row.mata_pelajaran);
    if (subjects.length < 1 || subjects.length > 5) { invalid.push({ line, message: 'Jumlah mapel harus 1–5' }); return; }
    if (subjects.some((s) => s.length > 120)) { invalid.push({ line, message: 'Nama mapel lebih dari 120 karakter' }); return; }
    const unusual = unusualTimeReason(row.jam_mulai, row.jam_selesai);
    if (unusual) { unusualTime.push({ line, message: `${row.nama_tutor} / ${row.nama_murid} ${row.tanggal_les} ${row.jam_mulai}–${row.jam_selesai}: ${unusual}` }); return; }
    // Identitas murid = nama + sekolah (keputusan user; nama sama di sekolah berbeda = murid berbeda).
    const studentKey = `${row.nama_murid.toLowerCase()}|${row.asal_sekolah.toLowerCase()}`;
    try { rows.push({ line, row, studentKey, rawGrade: mapGrade(row.kelas), subjects }); }
    catch (error) { invalid.push({ line, message: (error as Error).message }); }
  });

  // Kelas di CSV berganti bolak-balik dalam satu tahun ajaran; dipakai kelas mayoritas per murid per
  // tahun ajaran (seri → kelas lebih tinggi). Kasus yang dinormalisasi dicatat di laporan.
  const tally = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const key = `${r.studentKey}#${schoolYear(r.row.tanggal_les)}`;
    const counts = tally.get(key) ?? new Map<string, number>();
    counts.set(r.rawGrade, (counts.get(r.rawGrade) ?? 0) + 1);
    tally.set(key, counts);
  }
  const yearGrade = new Map<string, string>();
  const gradeNormalized: { student: string; school: string; schoolYear: string; chosen: string; counts: Record<string, number> }[] = [];
  for (const [key, counts] of tally) {
    const [chosen] = [...counts.entries()].sort((a, b) => b[1] - a[1] || gradeOrder(b[0]) - gradeOrder(a[0]))[0] as [string, number];
    yearGrade.set(key, chosen);
    if (counts.size > 1) {
      const sample = rows.find((r) => `${r.studentKey}#${schoolYear(r.row.tanggal_les)}` === key);
      gradeNormalized.push({ student: sample?.row.nama_murid ?? key, school: sample?.row.asal_sekolah ?? '', schoolYear: key.split('#')[1] ?? '', chosen, counts: Object.fromEntries(counts) });
    }
  }

  const tutorByName = new Map<string, PlannedTutor>();
  const usernames = new Set<string>(options.reservedUsernames ?? []);
  const studentByKey = new Map<string, PlannedStudent & { rows: { date: string; start: string; grade: string }[] }>();
  const subjectNames = new Map<string, string>();
  const sessions: PlannedSession[] = [];
  const duplicates: { line: number; duplicateOf: number }[] = [];
  const seen = new Map<string, number>();

  for (const { line, row, studentKey, subjects } of rows) {
    const grade = yearGrade.get(`${studentKey}#${schoolYear(row.tanggal_les)}`) as string;
    const tutorKey = row.nama_tutor.toLowerCase();
    let tutor = tutorByName.get(tutorKey);
    if (!tutor) {
      tutor = { id: deterministicUuid('tutor', tutorKey), userId: deterministicUuid('tutor-user', tutorKey), name: row.nama_tutor, username: '', sessions: 0 };
      tutorByName.set(tutorKey, tutor);
    }
    let student = studentByKey.get(studentKey);
    if (!student) {
      student = { id: deterministicUuid('student', studentKey), name: row.nama_murid, school: row.asal_sekolah, grade, history: [], sessions: 0, rows: [] };
      studentByKey.set(studentKey, student);
    }
    for (const s of subjects) if (!subjectNames.has(s.toLowerCase())) subjectNames.set(s.toLowerCase(), s);
    const canonicalSubjects = subjects.map((s) => subjectNames.get(s.toLowerCase()) ?? s).sort((a, b) => a.localeCompare(b));

    const dupKey = [tutorKey, studentKey, row.tanggal_les, row.jam_mulai, row.jam_selesai, canonicalSubjects.join('|').toLowerCase()].join('#');
    const firstLine = seen.get(dupKey);
    if (firstLine !== undefined) { duplicates.push({ line, duplicateOf: firstLine }); continue; }
    seen.set(dupKey, line);

    tutor.sessions++;
    student.sessions++;
    student.rows.push({ date: row.tanggal_les, start: row.jam_mulai, grade });
    const duration = timeToMinutes(row.jam_selesai) - timeToMinutes(row.jam_mulai);
    sessions.push({
      id: deterministicUuid('session', dupKey), client_submission_id: deterministicUuid('submission', dupKey),
      tutor_id: tutor.id, student_id: student.id,
      lesson_date: row.tanggal_les, start_time: row.jam_mulai, end_time: row.jam_selesai, duration_minutes: duration,
      learning_material: (row.materi || canonicalSubjects.join('; ')).slice(0, 255),
      grade, subjects: canonicalSubjects,
      ...countedSnapshot(grade, duration), hourly_rate_snapshot: hourlyFor(grade),
      submitted_at: new Date(`${row.tanggal_les}T${row.jam_selesai}:00${TZ_OFFSET}`),
    });
  }

  // Username dibuat berurutan menurut nama agar stabil antar-run.
  const tutors = [...tutorByName.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const t of tutors) t.username = makeUsername(t.name, usernames);

  // Riwayat kelas: baseline = kelas sesi pertama; perubahan kelas tercatat di tanggal les pertama kelas baru.
  const regressions: { student: string; school: string; date: string; from: string; to: string }[] = [];
  const students = [...studentByKey.values()].filter((s) => s.sessions > 0).map(({ rows: lessonRows, ...s }) => {
    const history: { grade: string; effective_from: string }[] = [];
    for (const r of [...lessonRows].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))) {
      const prev = history[history.length - 1];
      if (!prev) history.push({ grade: r.grade, effective_from: BASELINE_DATE });
      else if (prev.grade !== r.grade) {
        if (gradeOrder(r.grade) < gradeOrder(prev.grade)) regressions.push({ student: s.name, school: s.school, date: r.date, from: prev.grade, to: r.grade });
        history.push({ grade: r.grade, effective_from: r.date });
      }
    }
    return { ...s, grade: history[history.length - 1]?.grade ?? s.grade, history };
  }).sort((a, b) => a.name.localeCompare(b.name) || a.school.localeCompare(b.school));

  const subjects = [...subjectNames.values()].sort((a, b) => a.localeCompare(b));
  sessions.sort((a, b) => (a.lesson_date + a.start_time).localeCompare(b.lesson_date + b.start_time) || a.id.localeCompare(b.id));
  return { tutors, students, subjects, sessions, issues: { invalid, unusualTime, duplicates, gradeNormalized, regressions } };
}
export type ImportPlan = ReturnType<typeof buildImportPlan>;

export function summarizePlan(plan: ImportPlan) {
  const months = new Map<string, { sessions: number; gross: number; adminFee: number; unpriced: number }>();
  for (const s of plan.sessions) {
    const m = months.get(s.lesson_date.slice(0, 7)) ?? { sessions: 0, gross: 0, adminFee: 0, unpriced: 0 };
    m.sessions++;
    if (s.rate_amount_snapshot === null) m.unpriced++;
    m.gross += Number(s.rate_amount_snapshot ?? 0);
    m.adminFee += Number(s.admin_fee_snapshot ?? 0);
    months.set(s.lesson_date.slice(0, 7), m);
  }
  const names = new Map<string, number>();
  for (const s of plan.students) names.set(s.name.toLowerCase(), (names.get(s.name.toLowerCase()) ?? 0) + 1);
  return {
    tutors: plan.tutors.length,
    students: plan.students.length,
    studentNamesSharedAcrossSchools: [...names.values()].filter((n) => n > 1).length,
    subjects: plan.subjects.length,
    sessions: plan.sessions.length,
    sessionSubjectLinks: plan.sessions.reduce((n, s) => n + s.subjects.length, 0),
    gradeHistoryRows: plan.students.reduce((n, s) => n + s.history.length, 0),
    skipped: { invalid: plan.issues.invalid.length, unusualTime: plan.issues.unusualTime.length, exactDuplicates: plan.issues.duplicates.length },
    gradeRegressions: plan.issues.regressions.length,
    gradeNormalizedStudentYears: plan.issues.gradeNormalized.length,
    sessionsWithNormalizedGrade: plan.issues.gradeNormalized.reduce((n, g) => n + Object.entries(g.counts).filter(([k]) => k !== g.chosen).reduce((m, [, v]) => m + v, 0), 0),
    months: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, m]) => ({
      period, ...m, tutorNet: m.gross - m.adminFee,
    })),
  };
}
