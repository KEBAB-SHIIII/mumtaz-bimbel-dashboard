import { and, asc, count, eq, ilike, inArray, sql } from 'drizzle-orm';
import type {
  CreateParentRequest,
  MasterDataListQuery,
  Paginated,
  Parent,
  ParentAccessCodeIssued,
  StudentLink,
  UpdateParentRequest,
} from '@mumtaz/contracts';
import { digestParentAccessCode, generateParentAccessCode } from '../../auth/parent-access-code.js';
import type { DbOrTx } from '../../db/client.js';
import { parentStudents, students, users } from '../../db/schema.js';
import { iso } from '../../lib/format.js';
import { notFound, validationFailed } from '../../lib/http-error.js';
import { likePattern, pageOffset, paginated } from '../../lib/pagination.js';
import type { ServiceContext } from '../context.js';

const parentColumns = {
  id: users.id,
  full_name: users.full_name,
  email: users.email,
  is_active: users.is_active,
  created_at: users.created_at,
  updated_at: users.updated_at,
};

type ParentRow = {
  id: string;
  full_name: string;
  email: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

/** Response parent tidak pernah memuat kode akses maupun digest-nya. */
async function withStudents(db: DbOrTx, rows: ParentRow[]): Promise<Parent[]> {
  if (rows.length === 0) return [];
  const links = await db
    .select({
      parent_user_id: parentStudents.parent_user_id,
      student_id: parentStudents.student_id,
      full_name: students.full_name,
      relationship: parentStudents.relationship,
    })
    .from(parentStudents)
    .innerJoin(students, eq(students.id, parentStudents.student_id))
    .where(inArray(parentStudents.parent_user_id, rows.map((row) => row.id)))
    .orderBy(asc(students.full_name));

  return rows.map((row) => ({
    ...row,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
    students: links
      .filter((link) => link.parent_user_id === row.id)
      .map(({ student_id, full_name, relationship }) => ({ student_id, full_name, relationship })),
  }));
}

export async function listParents(ctx: ServiceContext, query: MasterDataListQuery): Promise<Paginated<Parent>> {
  const where = and(
    eq(users.role, 'parent'),
    query.search ? ilike(users.full_name, likePattern(query.search)) : undefined,
  );
  const [rows, [total]] = await Promise.all([
    ctx.db
      .select(parentColumns)
      .from(users)
      .where(where)
      .orderBy(asc(users.full_name), asc(users.id))
      .limit(query.page_size)
      .offset(pageOffset(query)),
    ctx.db.select({ value: count() }).from(users).where(where),
  ]);
  return paginated(await withStudents(ctx.db, rows), query, total?.value ?? 0);
}

async function findParent(db: DbOrTx, id: string): Promise<Parent> {
  const rows = await db
    .select(parentColumns)
    .from(users)
    .where(and(eq(users.id, id), eq(users.role, 'parent')))
    .limit(1);
  const [parent] = await withStudents(db, rows);
  if (!parent) throw notFound('Orang tua/wali');
  return parent;
}

export function getParent(ctx: ServiceContext, id: string): Promise<Parent> {
  return findParent(ctx.db, id);
}

async function replaceLinks(db: DbOrTx, parentUserId: string, links: StudentLink[]): Promise<void> {
  const ids = links.map((link) => link.student_id);
  const existing = await db.select({ id: students.id }).from(students).where(inArray(students.id, ids));
  const missing = ids.filter((id) => !existing.some((row) => row.id === id));
  if (missing.length > 0) {
    throw validationFailed(missing.map(() => ({ field: 'student_links', message: 'Siswa tidak ditemukan' })));
  }
  await db.delete(parentStudents).where(eq(parentStudents.parent_user_id, parentUserId));
  await db.insert(parentStudents).values(
    links.map((link) => ({
      parent_user_id: parentUserId,
      student_id: link.student_id,
      relationship: link.relationship ?? null,
    })),
  );
}

/**
 * Membuat akun parent + relasi siswa dalam satu transaksi.
 * Kode akses mentah dikembalikan SEKALI; DB hanya menyimpan digest HMAC.
 */
export async function createParent(ctx: ServiceContext, input: CreateParentRequest): Promise<ParentAccessCodeIssued> {
  const accessCode = generateParentAccessCode();
  const parent = await ctx.db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        full_name: input.full_name,
        email: input.email ?? null,
        role: 'parent',
        parent_access_code_hash: digestParentAccessCode(accessCode, ctx.parentAccessCodePepper),
      })
      .returning({ id: users.id });
    if (!user) throw new Error('Insert parent gagal');
    await replaceLinks(tx, user.id, input.student_links);
    return findParent(tx, user.id);
  });
  return { parent, access_code: accessCode };
}

export async function updateParent(ctx: ServiceContext, id: string, input: UpdateParentRequest): Promise<Parent> {
  return ctx.db.transaction(async (tx) => {
    const current = await findParent(tx, id);
    const patch: Partial<typeof users.$inferInsert> = {};
    if (input.full_name !== undefined) patch.full_name = input.full_name;
    if (input.email !== undefined) patch.email = input.email;
    if (input.is_active !== undefined) patch.is_active = input.is_active;

    await tx
      .update(users)
      .set({
        ...patch,
        ...(input.is_active === false && current.is_active
          ? { credential_version: sql`${users.credential_version} + 1` }
          : {}),
        updated_at: ctx.now(),
      })
      .where(eq(users.id, id));

    if (input.student_links) {
      await replaceLinks(tx, id, input.student_links);
    }
    return findParent(tx, id);
  });
}

/** Rotasi: kode lama langsung tidak berlaku dan session parent yang aktif dicabut. */
export async function rotateParentAccessCode(ctx: ServiceContext, id: string): Promise<ParentAccessCodeIssued> {
  const accessCode = generateParentAccessCode();
  const parent = await ctx.db.transaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({
        parent_access_code_hash: digestParentAccessCode(accessCode, ctx.parentAccessCodePepper),
        credential_version: sql`${users.credential_version} + 1`,
        updated_at: ctx.now(),
      })
      .where(and(eq(users.id, id), eq(users.role, 'parent')))
      .returning({ id: users.id });
    if (!updated) throw notFound('Orang tua/wali');
    return findParent(tx, id);
  });
  return { parent, access_code: accessCode };
}
