import { asc, count, eq, ilike } from 'drizzle-orm';
import type {
  CreateSubjectRequest,
  MasterDataListQuery,
  Paginated,
  Subject,
  UpdateSubjectRequest,
} from '@mumtaz/contracts';
import { subjects } from '../../db/schema.js';
import { iso } from '../../lib/format.js';
import { notFound } from '../../lib/http-error.js';
import { likePattern, pageOffset, paginated } from '../../lib/pagination.js';
import type { ServiceContext } from '../context.js';

type SubjectRow = typeof subjects.$inferSelect;

function toSubject(row: SubjectRow): Subject {
  return { ...row, created_at: iso(row.created_at), updated_at: iso(row.updated_at) };
}

export async function listSubjects(ctx: ServiceContext, query: MasterDataListQuery): Promise<Paginated<Subject>> {
  const where = query.search ? ilike(subjects.name, likePattern(query.search)) : undefined;
  const [rows, [total]] = await Promise.all([
    ctx.db
      .select()
      .from(subjects)
      .where(where)
      .orderBy(asc(subjects.name), asc(subjects.id))
      .limit(query.page_size)
      .offset(pageOffset(query)),
    ctx.db.select({ value: count() }).from(subjects).where(where),
  ]);
  return paginated(rows.map(toSubject), query, total?.value ?? 0);
}

export async function getSubject(ctx: ServiceContext, id: string): Promise<Subject> {
  const [row] = await ctx.db.select().from(subjects).where(eq(subjects.id, id)).limit(1);
  if (!row) throw notFound('Mata pelajaran');
  return toSubject(row);
}

export async function createSubject(ctx: ServiceContext, input: CreateSubjectRequest): Promise<Subject> {
  const [row] = await ctx.db.insert(subjects).values(input).returning();
  if (!row) throw new Error('Insert mata pelajaran gagal');
  return toSubject(row);
}

export async function updateSubject(ctx: ServiceContext, id: string, input: UpdateSubjectRequest): Promise<Subject> {
  const [row] = await ctx.db
    .update(subjects)
    .set({ ...input, updated_at: ctx.now() })
    .where(eq(subjects.id, id))
    .returning();
  if (!row) throw notFound('Mata pelajaran');
  return toSubject(row);
}
