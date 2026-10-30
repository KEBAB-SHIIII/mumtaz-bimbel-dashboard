/**
 * DATASET DEV SINTETIS (Neon development) untuk menguji anomaly screening Gemini.
 * Deterministik (PRNG ber-seed) di atas master data fixture. Semua sesi berstatus
 * analisis `pending` dan TANPA temuan, sehingga worker menganalisisnya dari nol.
 * Nama/akun fiktif; tarif Rp50.000 adalah simulasi. Bukan data UMKM.
 */
import type { SessionStatus } from '../enums.js';
import { fixtureId, USER_IDS } from './ids.js';
import { fixtureAssignments, fixtureSubjects } from './master-data.js';
import type { FixtureLessonSession } from './sessions.js';

/** Rentang tanggal les dataset dev (tidak ada tanggal di masa depan). */
export const DEV_DATASET_RANGE = { from: '2026-09-01', to: '2026-10-29' } as const;
/** Batas akhir timestamp review agar tidak melewati "hari ini" dataset. */
const REVIEW_CUTOFF = Date.parse('2026-10-29T12:00:00Z');

/** mulberry32 — PRNG kecil & deterministik. */
function createRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    pick: <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T,
    chance: (p: number) => next() < p,
  };
}

const MATERIALS: Record<string, string[]> = {
  Matematika: [
    'Penjumlahan dan pengurangan bersusun',
    'Perkalian dan pembagian',
    'Pecahan senilai dan penyederhanaan',
    'Bangun datar: keliling dan luas',
    'Operasi hitung bilangan bulat',
    'Persamaan linear satu variabel',
    'Soal cerita perbandingan',
    'Statistika sederhana: rata-rata dan modus',
  ],
  'Bahasa Inggris': [
    'Simple present tense',
    'Vocabulary: daily activities',
    'Reading comprehension: short story',
    'Describing people and places',
    'Past tense: regular and irregular verbs',
    'Asking and giving directions',
    'Writing a short paragraph',
  ],
  IPA: [
    'Sistem pencernaan manusia',
    'Gaya dan gerak',
    'Siklus air',
    'Rangkaian listrik sederhana',
    'Klasifikasi makhluk hidup',
    'Perubahan wujud zat',
    'Sistem tata surya',
  ],
  'Bahasa Indonesia': [
    'Membaca pemahaman teks narasi',
    'Menulis paragraf deskripsi',
    'Kalimat efektif',
    'Menentukan ide pokok paragraf',
    'Teks prosedur',
    'Puisi: diksi dan rima',
  ],
};

const NOTES = [
  'Siswa mengikuti dengan baik dan aktif bertanya.',
  'Masih perlu latihan soal secara mandiri di rumah.',
  'Pemahaman konsep sudah baik, kecepatan mengerjakan perlu ditingkatkan.',
  'Siswa sempat kurang fokus di awal, membaik setelah istirahat singkat.',
  'Latihan soal 80% benar.',
];
const FOCUS = ['Latihan soal cerita bertahap.', 'Review materi sebelumnya.', 'Lanjut ke sub-bab berikutnya.', 'Persiapan ulangan harian.'];
const REVISION_NOTES = ['Durasi tidak sesuai jadwal; mohon periksa kembali.', 'Materi kurang spesifik; mohon dilengkapi.'];
const REJECT_NOTES = ['Tidak ada jadwal les pada tanggal tersebut.', 'Sesi dibatalkan oleh wali; mohon tidak dicatat.'];

function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return dates;
}

const weekday = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`).getUTCDay();
const addMinutes = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60_000).toISOString();

export interface DevDatasetSummary {
  sessions: FixtureLessonSession[];
  /** Sesi yang sengaja dibuat untuk memicu kandidat anomali, per skenario. */
  triggers: { exactDuplicates: string[]; crossTutorDuplicates: string[]; durationOutliers: string[] };
}

/**
 * ~150 sesi Sep–Okt 2026 untuk semua assignment aktif:
 * - sesi normal 1–2x/minggu, durasi 60–120 menit, status review campuran;
 * - ~10 duplikat persis (assignment+tanggal+durasi sama, disubmit belakangan);
 * - ~5 duplikat lintas tutor (siswa+mapel+tanggal sama lewat assignment lain);
 * - ~10 durasi 200–300 menit (2 di antaranya juga diduplikasi).
 */
export function buildDevDataset(seed = 20261030): DevDatasetSummary {
  const random = createRandom(seed);
  const active = fixtureAssignments.filter((a) => a.is_active);
  const subjectName = (subjectId: string) => fixtureSubjects.find((s) => s.id === subjectId)?.name ?? 'Matematika';
  const sessions: FixtureLessonSession[] = [];
  let n = 0;

  const make = (
    assignmentId: string,
    lessonDate: string,
    duration: number,
    options: { status?: SessionStatus; submittedOffsetMinutes?: number; material?: string } = {},
  ): FixtureLessonSession => {
    n += 1;
    const a = active.find((row) => row.id === assignmentId);
    const subject = subjectName(a?.subject_id ?? '');
    // Tutor mengisi absensi sore hari (17.00–20.00 WIB = 10.00–13.00 UTC).
    const submitted = addMinutes(`${lessonDate}T10:00:00.000Z`, Math.floor(random.next() * 180) + (options.submittedOffsetMinutes ?? 0));
    const status = options.status ?? statusFor(lessonDate);
    const reviewedAt = status === 'pending' ? null : new Date(Math.min(Date.parse(submitted) + 36 * 3_600_000, REVIEW_CUTOFF)).toISOString();
    return {
      id: fixtureId('8100', n),
      client_submission_id: fixtureId('9100', n),
      assignment_id: assignmentId,
      lesson_date: lessonDate,
      duration_minutes: duration,
      learning_material: options.material ?? random.pick(MATERIALS[subject] ?? MATERIALS.Matematika ?? []),
      learning_notes: random.chance(0.6) ? random.pick(NOTES) : null,
      next_focus: random.chance(0.5) ? random.pick(FOCUS) : null,
      status,
      anomaly_analysis_status: 'pending',
      ...(status === 'approved'
        ? { rate_type_snapshot: 'per_session', rate_amount_snapshot: '50000', rate_is_demo_snapshot: true }
        : { rate_type_snapshot: null, rate_amount_snapshot: null, rate_is_demo_snapshot: null }),
      reviewed_by_user_id: status === 'pending' ? null : USER_IDS.admin,
      submitted_at: submitted,
      reviewed_at: reviewedAt,
      updated_at: reviewedAt ?? submitted,
      admin_note: status === 'revision_requested' ? random.pick(REVISION_NOTES) : status === 'rejected' ? random.pick(REJECT_NOTES) : null,
    };
  };

  /** September mayoritas sudah direview; Oktober makin baru makin banyak yang menunggu. */
  function statusFor(lessonDate: string): SessionStatus {
    const roll = random.next();
    if (lessonDate < '2026-10-01') return roll < 0.85 ? 'approved' : roll < 0.93 ? 'revision_requested' : 'rejected';
    if (lessonDate < '2026-10-20') return roll < 0.6 ? 'approved' : roll < 0.85 ? 'pending' : roll < 0.95 ? 'revision_requested' : 'rejected';
    return roll < 0.15 ? 'approved' : 'pending';
  }

  // 1) Sesi normal: setiap assignment punya dua hari tetap per minggu.
  const dates = dateRange(DEV_DATASET_RANGE.from, DEV_DATASET_RANGE.to);
  active.forEach((a, index) => {
    const days = new Set([1 + (index % 5), 1 + ((index + 2) % 5)]); // Senin–Jumat
    for (const date of dates) {
      if (days.has(weekday(date)) && random.chance(0.45)) {
        sessions.push(make(a.id, date, random.pick([60, 75, 90, 90, 120])));
      }
    }
  });

  // 2) Duplikat persis: salinan sesi yang ada, disubmit 5–40 menit kemudian.
  const exactDuplicates: string[] = [];
  const normal = [...sessions];
  for (let i = 0; i < 10; i += 1) {
    const source = normal[Math.floor(((i + 0.5) / 10) * normal.length)];
    if (!source) continue;
    const dup = make(source.assignment_id, source.lesson_date, source.duration_minutes, {
      status: 'pending',
      material: source.learning_material,
      submittedOffsetMinutes: 0,
    });
    dup.submitted_at = addMinutes(source.submitted_at, 5 + i * 3);
    dup.updated_at = dup.submitted_at;
    sessions.push(dup);
    exactDuplicates.push(dup.id);
  }

  // 3) Duplikat lintas tutor: siswa & mapel sama, tanggal sama, assignment berbeda.
  const pairs: [string, string][] = [];
  for (const a of active) {
    for (const b of active) {
      if (a.id < b.id && a.student_id === b.student_id && a.subject_id === b.subject_id) pairs.push([a.id, b.id]);
    }
  }
  const crossTutorDuplicates: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    const [first, second] = pairs[i % pairs.length] ?? [];
    if (!first || !second) break;
    const candidates = sessions.filter((s) => s.assignment_id === first && s.lesson_date >= '2026-10-01');
    const source = candidates[Math.floor(candidates.length / 2) + i] ?? candidates[0];
    if (!source || sessions.some((s) => s.assignment_id === second && s.lesson_date === source.lesson_date)) continue;
    const dup = make(second, source.lesson_date, random.pick([60, 90]), { status: 'pending' });
    dup.submitted_at = addMinutes(source.submitted_at, 30);
    dup.updated_at = dup.submitted_at;
    sessions.push(dup);
    crossTutorDuplicates.push(dup.id);
  }

  // 4) Durasi tidak wajar (> ambang demo 180 menit) di Oktober; dua di antaranya diduplikasi.
  const durationOutliers: string[] = [];
  const octoberDates = dates.filter((d) => d >= '2026-10-05');
  for (let i = 0; i < 8; i += 1) {
    const a = active[(i * 3) % active.length];
    if (!a) continue;
    // Tanggal kosong pertama (tanpa sesi lain di assignment yang sama) mulai dari offset i.
    const date = [...octoberDates.slice((i * 5) % octoberDates.length), ...octoberDates].find(
      (d) => !sessions.some((s) => s.assignment_id === a.id && s.lesson_date === d),
    );
    if (!date) continue;
    const long = make(a.id, date, random.pick([200, 240, 270, 300]), { status: 'pending' });
    sessions.push(long);
    durationOutliers.push(long.id);
    if (i < 2) {
      const dup = make(a.id, date, long.duration_minutes, { status: 'pending', material: long.learning_material });
      dup.submitted_at = addMinutes(long.submitted_at, 10);
      dup.updated_at = dup.submitted_at;
      sessions.push(dup);
      exactDuplicates.push(dup.id);
      durationOutliers.push(dup.id);
    }
  }

  sessions.sort((x, y) => x.submitted_at.localeCompare(y.submitted_at) || x.id.localeCompare(y.id));
  return { sessions, triggers: { exactDuplicates, crossTutorDuplicates, durationOutliers } };
}
