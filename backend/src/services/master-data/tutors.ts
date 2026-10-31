import { and, asc, count, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import type {
  CreateTutorRequest,
  MasterDataListQuery,
  Paginated,
  Tutor,
  TutorCredentialIssued,
  UpdateTutorRequest,
} from '@mumtaz/contracts';
import { generateTemporaryPassword, hashPassword } from '../../auth/password.js';
import { tutors, users } from '../../db/schema.js';
import { iso } from '../../lib/format.js';
import { notFound } from '../../lib/http-error.js';
import { likePattern, pageOffset, paginated } from '../../lib/pagination.js';
import type { ServiceContext } from '../context.js';

const tutorColumns = {
  id: tutors.id,
  user_id: tutors.user_id,
  full_name: users.full_name,
  username: users.username,
  phone: tutors.phone,
  is_active: tutors.is_active,
  login_active: users.is_active,
  created_at: tutors.created_at,
  updated_at: tutors.updated_at,
};

type TutorRow = {
  id: string;
  user_id: string;
  full_name: string;
  username: string | null;
  phone: string | null;
  is_active: boolean;
  login_active: boolean;
  created_at: Date;
  updated_at: Date;
};

function toTutor(row: TutorRow): Tutor {
  return {
    ...row,
    username: row.username ?? '',
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

export async function listTutors(ctx: ServiceContext, query: MasterDataListQuery): Promise<Paginated<Tutor>> {
  const filters: SQL[] = [];
  if (query.search) {
    const pattern = likePattern(query.search);
    const match = or(ilike(users.full_name, pattern), ilike(users.username, pattern));
    if (match) filters.push(match);
  }
  const where = filters.length ? and(...filters) : undefined;

  const [rows, [total]] = await Promise.all([
    ctx.db
      .select(tutorColumns)
      .from(tutors)
      .innerJoin(users, eq(users.id, tutors.user_id))
      .where(where)
      .orderBy(asc(users.full_name), asc(tutors.id))
      .limit(query.page_size)
      .offset(pageOffset(query)),
    ctx.db.select({ value: count() }).from(tutors).innerJoin(users, eq(users.id, tutors.user_id)).where(where),
  ]);
  return paginated(rows.map(toTutor), query, total?.value ?? 0);
}

export async function getTutor(ctx: ServiceContext, id: string): Promise<Tutor> {
  const [row] = await ctx.db
    .select(tutorColumns)
    .from(tutors)
    .innerJoin(users, eq(users.id, tutors.user_id))
    .where(eq(tutors.id, id))
    .limit(1);
  if (!row) throw notFound('Tutor');
  return toTutor(row);
}

/**
 * Satu transaksi: `users` role tutor + `tutors`. Password sementara dibuat sistem (acak) dan
 * dikembalikan SEKALI; hanya hash-nya yang disimpan.
 */
export async function createTutor(ctx: ServiceContext, input: CreateTutorRequest): Promise<TutorCredentialIssued> {
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const tutorId = await ctx.db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        full_name: input.full_name,
        username: input.username,
        password_hash: passwordHash,
        role: 'tutor',
      })
      .returning({ id: users.id });
    if (!user) throw new Error('Insert user gagal');
    const [tutor] = await tx
      .insert(tutors)
      .values({ user_id: user.id, phone: input.phone ?? null })
      .returning({ id: tutors.id });
    if (!tutor) throw new Error('Insert tutor gagal');
    return tutor.id;
  });
  return { tutor: await getTutor(ctx, tutorId), temporary_password: temporaryPassword };
}

/** Reset password (mis. Tutor lupa): password lama tidak berlaku dan semua session Tutor dicabut. */
export async function resetTutorPassword(ctx: ServiceContext, id: string): Promise<TutorCredentialIssued> {
  const current = await getTutor(ctx, id);
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  await ctx.db
    .update(users)
    .set({
      password_hash: passwordHash,
      credential_version: sql`${users.credential_version} + 1`,
      updated_at: ctx.now(),
    })
    .where(eq(users.id, current.user_id));
  return { tutor: await getTutor(ctx, id), temporary_password: temporaryPassword };
}

export async function updateTutor(ctx: ServiceContext, id: string, input: UpdateTutorRequest): Promise<Tutor> {
  const current = await getTutor(ctx, id);
  const now = ctx.now();

  await ctx.db.transaction(async (tx) => {
    const userPatch: Partial<typeof users.$inferInsert> = {};
    if (input.full_name !== undefined) userPatch.full_name = input.full_name;
    if (input.username !== undefined) userPatch.username = input.username;
    if (input.login_active !== undefined) userPatch.is_active = input.login_active;
    if (Object.keys(userPatch).length > 0) {
      await tx
        .update(users)
        .set({
          ...userPatch,
          // Menonaktifkan login langsung mencabut semua session aktif.
          ...(input.login_active === false && current.login_active
            ? { credential_version: sql`${users.credential_version} + 1` }
            : {}),
          updated_at: now,
        })
        .where(eq(users.id, current.user_id));
    }

    const tutorPatch: Partial<typeof tutors.$inferInsert> = {};
    if (input.phone !== undefined) tutorPatch.phone = input.phone;
    if (input.is_active !== undefined) tutorPatch.is_active = input.is_active;
    await tx
      .update(tutors)
      .set({ ...tutorPatch, updated_at: now })
      .where(eq(tutors.id, id));
  });

  return getTutor(ctx, id);
}
