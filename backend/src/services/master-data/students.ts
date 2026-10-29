import { asc, count, eq, ilike, or } from 'drizzle-orm';
import type {
  CreateStudentRequest,
  MasterDataListQuery,
  Paginated,
  Student,
  UpdateStudentRequest,
} from '@mumtaz/contracts';
import { students } from '../../db/schema.js';
import { iso } from '../../lib/format.js';
import { notFound } from '../../lib/http-error.js';
import { likePattern, pageOffset, paginated } from '../../lib/pagination.js';
import type { ServiceContext } from '../context.js';

type StudentRow = typeof students.$inferSelect;

function toStudent(row: StudentRow): Student {
  return { ...row, created_at: iso(row.created_at), updated_at: iso(row.updated_at) };
}

export async function listStudents(ctx: ServiceContext, query: MasterDataListQuery): Promise<Paginated<Student>> {
  const where = query.search
    ? or(ilike(students.full_name, likePattern(query.search)), ilike(students.school_name, likePattern(query.search)))
    : undefined;
  const [rows, [total]] = await Promise.all([
    ctx.db
      .select()
      .from(students)
      .where(where)
      .orderBy(asc(students.full_name), asc(students.id))
      .limit(query.page_size)
      .offset(pageOffset(query)),
    ctx.db.select({ value: count() }).from(students).where(where),
  ]);
  return paginated(rows.map(toStudent), query, total?.value ?? 0);
}

export async function getStudent(ctx: ServiceContext, id: string): Promise<Student> {
  const [row] = await ctx.db.select().from(students).where(eq(students.id, id)).limit(1);
  if (!row) throw notFound('Siswa');
  return toStudent(row);
}

export async function createStudent(ctx: ServiceContext, input: CreateStudentRequest): Promise<Student> {
  const [row] = await ctx.db.insert(students).values(input).returning();
  if (!row) throw new Error('Insert siswa gagal');
  return toStudent(row);
}

/** Menonaktifkan siswa mencegah assignment/sesi baru; histori tidak dihapus. */
export async function updateStudent(ctx: ServiceContext, id: string, input: UpdateStudentRequest): Promise<Student> {
  const [row] = await ctx.db
    .update(students)
    .set({ ...input, updated_at: ctx.now() })
    .where(eq(students.id, id))
    .returning();
  if (!row) throw notFound('Siswa');
  return toStudent(row);
}
