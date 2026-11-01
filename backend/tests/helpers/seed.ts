import { eq } from 'drizzle-orm';
import {
  TEST_ONLY_CREDENTIALS,
  USER_IDS,
  fixtureAnomalyFlags,
  fixtureParentStudents,
  fixtureSessions,
  fixtureStudents,
  fixtureSubjects,
  fixtureTutors,
  fixtureUsers,
  type FixtureLessonSession,
} from '@mumtaz/contracts/fixtures';
import { digestParentAccessCode } from '../../src/auth/parent-access-code.js';
import { hashPassword } from '../../src/auth/password.js';
import { ensureBootstrapAdmin } from '../../src/db/bootstrap-admin.js';
import type { Database, Transaction } from '../../src/db/client.js';
import {
  anomalyFlags,
  lessonSessionSubjects,
  lessonSessions,
  parentStudents,
  students,
  subjects,
  tutors,
  users,
} from '../../src/db/schema.js';

export interface SeedOptions {
  adminPassword: string;
  tutorPassword: string;
  parentAccessCodePepper: string;
}

/** Memetakan ID admin fixture ke ID admin yang benar-benar ada di DB. */
type ReviewerMap = (id: string | null) => string | null;

/**
 * KHUSUS TEST (PGlite). Aplikasi production tidak memuat data sintetis.
 *
 * Master data sintetis (= `examples/seed-data.json`): akun, tutor, siswa, wali,
 * mapel, penugasan, tarif dari konfigurasi. Idempoten (`ON CONFLICT DO NOTHING`).
 */
async function seedMasterData(tx: Transaction, options: SeedOptions): Promise<ReviewerMap> {
  const admin = fixtureUsers.find((user) => user.id === USER_IDS.admin);
  if (!admin?.username) throw new Error('Fixture admin tidak ditemukan');
  await ensureBootstrapAdmin(tx, {
    id: admin.id,
    username: admin.username,
    password: options.adminPassword,
    fullName: admin.full_name,
  });
  // Admin bisa sudah dibuat lebih dulu oleh `db:bootstrap-admin` dengan ID acak:
  // metadata review fixture dipetakan ke ID admin yang sebenarnya.
  const [actualAdmin] = await tx.select({ id: users.id }).from(users).where(eq(users.username, admin.username));
  if (!actualAdmin) throw new Error('Admin bootstrap tidak ditemukan');

  const tutorHash = await hashPassword(options.tutorPassword);
  const codes: Record<string, string> = TEST_ONLY_CREDENTIALS.parentAccessCodes;
  await tx
    .insert(users)
    .values(
      fixtureUsers
        .filter((user) => user.role !== 'admin')
        .map((user) => {
          if (user.role === 'tutor') return { ...user, password_hash: tutorHash };
          const code = codes[user.id];
          if (!code) throw new Error(`Fixture kode akses untuk ${user.id} tidak ada`);
          return { ...user, parent_access_code_hash: digestParentAccessCode(code, options.parentAccessCodePepper) };
        }),
    )
    .onConflictDoNothing();

  await tx.insert(tutors).values(fixtureTutors).onConflictDoNothing();
  await tx.insert(students).values(fixtureStudents).onConflictDoNothing();
  await tx.insert(subjects).values(fixtureSubjects).onConflictDoNothing();
  await tx.insert(parentStudents).values(fixtureParentStudents).onConflictDoNothing();

  return (id) => (id === USER_IDS.admin ? actualAdmin.id : id);
}

async function insertSessions(tx: Transaction, sessions: FixtureLessonSession[], reviewer: ReviewerMap): Promise<void> {
  if (sessions.length === 0) return;
  await tx
    .insert(lessonSessions)
    .values(
      sessions.map(({ subject_ids: _subjects, ...session }) => ({
        ...session,
        reviewed_by_user_id: reviewer(session.reviewed_by_user_id),
        submitted_at: new Date(session.submitted_at),
        reviewed_at: session.reviewed_at ? new Date(session.reviewed_at) : null,
        updated_at: new Date(session.updated_at),
      })),
    )
    .onConflictDoNothing();
  await tx
    .insert(lessonSessionSubjects)
    .values(sessions.flatMap((session) => session.subject_ids.map((subject_id) => ({ lesson_session_id: session.id, subject_id }))))
    .onConflictDoNothing();
}

/**
 * Seed TEST: master data + 11 sesi fixture `s01–s11` + temuan dari fake detector.
 * Angka expected outcome (`@mumtaz/contracts/fixtures`) bergantung pada data ini.
 */
export async function seedSyntheticData(db: Database, options: SeedOptions): Promise<void> {
  await db.transaction(async (tx) => {
    const reviewer = await seedMasterData(tx, options);
    await insertSessions(tx, fixtureSessions, reviewer);
    await tx
      .insert(anomalyFlags)
      .values(
        fixtureAnomalyFlags.map((flag) => ({
          ...flag,
          reviewed_by_user_id: reviewer(flag.reviewed_by_user_id),
          reviewed_at: flag.reviewed_at ? new Date(flag.reviewed_at) : null,
          created_at: new Date(flag.created_at),
        })),
      )
      .onConflictDoNothing();
  });
}
