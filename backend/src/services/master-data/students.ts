import { asc, count, eq, ilike, or, sql } from 'drizzle-orm';
import type {
  CreateStudentRequest,
  MasterDataListQuery,
  Paginated,
  Student,
  UpdateStudentRequest,
} from '@mumtaz/contracts';
import { students, studentGradeHistory } from '../../db/schema.js';
import { iso } from '../../lib/format.js';
import { notFound, validationFailed } from '../../lib/http-error.js';
import { likePattern, pageOffset, paginated } from '../../lib/pagination.js';
import { BASELINE_DATE, currentGrade } from './grade-history.js';
import { todayInBusinessTimeZone } from '@mumtaz/contracts';
import type { ServiceContext } from '../context.js';

type StudentRow = typeof students.$inferSelect;
function studentColumns(ctx: ServiceContext) {
  const today = todayInBusinessTimeZone(ctx.now());
  return { id:students.id, full_name:students.full_name, grade:currentGrade(ctx.now()), school_name:students.school_name,
    registration_source:students.registration_source, is_active:students.is_active, created_at:students.created_at, updated_at:students.updated_at,
    scheduled_grade:sql<Student['scheduled_grade']>`(select json_build_object('grade', gh.grade, 'effective_from', gh.effective_from) from student_grade_history gh where gh.student_id = ${sql.raw('"students"."id"')} and gh.effective_from > ${today}::date order by gh.effective_from limit 1)` };
}

function toStudent(row: StudentRow & { scheduled_grade?: Student['scheduled_grade'] }): Student {
  return { ...row, created_at: iso(row.created_at), updated_at: iso(row.updated_at) };
}

export async function listStudents(ctx: ServiceContext, query: MasterDataListQuery): Promise<Paginated<Student>> {
  const where = query.search
    ? or(ilike(students.full_name, likePattern(query.search)), ilike(students.school_name, likePattern(query.search)))
    : undefined;
  const [rows, [total]] = await Promise.all([
    ctx.db
      .select({ ...studentColumns(ctx) })
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
  const [row] = await ctx.db.select(studentColumns(ctx)).from(students).where(eq(students.id, id)).limit(1);
  if (!row) throw notFound('Siswa');
  return toStudent(row);
}

export async function createStudent(ctx: ServiceContext, input: CreateStudentRequest): Promise<Student> {
  return ctx.db.transaction(async tx => {
    const [row] = await tx.insert(students).values(input).returning();
    if (!row) throw new Error('Insert siswa gagal');
    await tx.insert(studentGradeHistory).values({ student_id:row.id, grade:row.grade, effective_from:BASELINE_DATE, reason:'Kelas saat pendaftaran' });
    return toStudent(row);
  });
}

/** Menonaktifkan siswa mencegah sesi baru; histori tidak dihapus. */
export async function updateStudent(ctx: ServiceContext, id: string, input: UpdateStudentRequest): Promise<Student> {
  if (input.grade !== undefined) throw validationFailed([{ field:'grade', message:'Gunakan Ubah kelas agar tanggal berlaku dan riwayat tercatat.' }]);
  const [row] = await ctx.db
    .update(students)
    .set({ ...input, updated_at: ctx.now() })
    .where(eq(students.id, id))
    .returning();
  if (!row) throw notFound('Siswa');
  return getStudent(ctx, id);
}
