import { eq } from 'drizzle-orm';
import {
  TEST_ONLY_CREDENTIALS,
  USER_IDS,
  fixtureAnomalyFlags,
  fixtureAssignments,
  fixtureParentStudents,
  fixtureRates,
  fixtureSessions,
  fixtureStudents,
  fixtureSubjects,
  fixtureTutors,
  fixtureUsers,
} from '@mumtaz/contracts/fixtures';
import { digestParentAccessCode } from '../auth/parent-access-code.js';
import { hashPassword } from '../auth/password.js';
import { ensureBootstrapAdmin } from './bootstrap-admin.js';
import type { Database } from './client.js';
import {
  anomalyFlags,
  lessonSessions,
  parentStudents,
  students,
  subjects,
  tutorAssignments,
  tutorRates,
  tutors,
  users,
} from './schema.js';

export interface SeedOptions {
  adminPassword: string;
  tutorPassword: string;
  parentAccessCodePepper: string;
}

/**
 * Seed SINTETIS (data fixture = `examples/seed-data.json` + sesi/finding contoh).
 * Idempoten: baris dengan ID yang sama dilewati (`ON CONFLICT DO NOTHING`), tidak
 * pernah menimpa/menghapus data. Hanya untuk development/test — skrip CLI menolak production.
 */
export async function seedSyntheticData(db: Database, options: SeedOptions): Promise<void> {
  const tutorHash = await hashPassword(options.tutorPassword);

  await db.transaction(async (tx) => {
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
    const reviewer = (id: string | null) => (id === USER_IDS.admin ? actualAdmin.id : id);

    await tx
      .insert(users)
      .values(
        fixtureUsers
          .filter((user) => user.role !== 'admin')
          .map((user) => {
            if (user.role === 'tutor') {
              return { ...user, password_hash: tutorHash };
            }
            const codes: Record<string, string> = TEST_ONLY_CREDENTIALS.parentAccessCodes;
            const code = codes[user.id];
            if (!code) throw new Error(`Fixture kode akses untuk ${user.id} tidak ada`);
            return {
              ...user,
              parent_access_code_hash: digestParentAccessCode(code, options.parentAccessCodePepper),
            };
          }),
      )
      .onConflictDoNothing();

    await tx.insert(tutors).values(fixtureTutors).onConflictDoNothing();
    await tx.insert(students).values(fixtureStudents).onConflictDoNothing();
    await tx.insert(subjects).values(fixtureSubjects).onConflictDoNothing();
    await tx.insert(parentStudents).values(fixtureParentStudents).onConflictDoNothing();
    await tx.insert(tutorAssignments).values(fixtureAssignments).onConflictDoNothing();
    await tx.insert(tutorRates).values(fixtureRates).onConflictDoNothing();
    await tx
      .insert(lessonSessions)
      .values(
        fixtureSessions.map((session) => ({
          ...session,
          reviewed_by_user_id: reviewer(session.reviewed_by_user_id),
          submitted_at: new Date(session.submitted_at),
          reviewed_at: session.reviewed_at ? new Date(session.reviewed_at) : null,
          updated_at: new Date(session.updated_at),
        })),
      )
      .onConflictDoNothing();
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
