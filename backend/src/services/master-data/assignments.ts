import { alias } from 'drizzle-orm/pg-core';
import { and, asc, count, eq, ilike, or, type SQL } from 'drizzle-orm';
import type {
  AssignmentListQuery,
  CreateTutorAssignmentRequest,
  Paginated,
  TutorAssignment,
  UpdateTutorAssignmentRequest,
} from '@mumtaz/contracts';
import { students, subjects, tutorAssignments, tutors, users } from '../../db/schema.js';
import { iso } from '../../lib/format.js';
import { notFound, validationFailed, type ErrorDetail } from '../../lib/http-error.js';
import { likePattern, pageOffset, paginated } from '../../lib/pagination.js';
import type { ServiceContext } from '../context.js';

const tutorUser = alias(users, 'tutor_user');

const assignmentColumns = {
  id: tutorAssignments.id,
  tutor_id: tutorAssignments.tutor_id,
  tutor_name: tutorUser.full_name,
  student_id: tutorAssignments.student_id,
  student_name: students.full_name,
  subject_id: tutorAssignments.subject_id,
  subject_name: subjects.name,
  start_date: tutorAssignments.start_date,
  end_date: tutorAssignments.end_date,
  is_active: tutorAssignments.is_active,
  created_at: tutorAssignments.created_at,
  updated_at: tutorAssignments.updated_at,
};

function baseQuery(ctx: ServiceContext) {
  return ctx.db
    .select(assignmentColumns)
    .from(tutorAssignments)
    .innerJoin(tutors, eq(tutors.id, tutorAssignments.tutor_id))
    .innerJoin(tutorUser, eq(tutorUser.id, tutors.user_id))
    .innerJoin(students, eq(students.id, tutorAssignments.student_id))
    .innerJoin(subjects, eq(subjects.id, tutorAssignments.subject_id));
}

type AssignmentRow = Awaited<ReturnType<ReturnType<typeof baseQuery>['execute']>>[number];

function toAssignment(row: AssignmentRow): TutorAssignment {
  return { ...row, created_at: iso(row.created_at), updated_at: iso(row.updated_at) };
}

export async function listAssignments(
  ctx: ServiceContext,
  query: AssignmentListQuery,
): Promise<Paginated<TutorAssignment>> {
  const filters: (SQL | undefined)[] = [
    query.tutor_id ? eq(tutorAssignments.tutor_id, query.tutor_id) : undefined,
    query.student_id ? eq(tutorAssignments.student_id, query.student_id) : undefined,
    query.subject_id ? eq(tutorAssignments.subject_id, query.subject_id) : undefined,
    query.is_active !== undefined ? eq(tutorAssignments.is_active, query.is_active) : undefined,
    query.search
      ? or(
          ilike(tutorUser.full_name, likePattern(query.search)),
          ilike(students.full_name, likePattern(query.search)),
          ilike(subjects.name, likePattern(query.search)),
        )
      : undefined,
  ];
  const where = and(...filters);

  const [rows, [total]] = await Promise.all([
    baseQuery(ctx)
      .where(where)
      .orderBy(asc(tutorUser.full_name), asc(students.full_name), asc(subjects.name), asc(tutorAssignments.id))
      .limit(query.page_size)
      .offset(pageOffset(query)),
    ctx.db
      .select({ value: count() })
      .from(tutorAssignments)
      .innerJoin(tutors, eq(tutors.id, tutorAssignments.tutor_id))
      .innerJoin(tutorUser, eq(tutorUser.id, tutors.user_id))
      .innerJoin(students, eq(students.id, tutorAssignments.student_id))
      .innerJoin(subjects, eq(subjects.id, tutorAssignments.subject_id))
      .where(where),
  ]);
  return paginated(rows.map(toAssignment), query, total?.value ?? 0);
}

export async function getAssignment(ctx: ServiceContext, id: string): Promise<TutorAssignment> {
  const [row] = await baseQuery(ctx).where(eq(tutorAssignments.id, id)).limit(1);
  if (!row) throw notFound('Penugasan');
  return toAssignment(row);
}

/** Tutor, siswa, dan mapel harus ada dan aktif; overlap ditolak oleh exclusion constraint (409). */
export async function createAssignment(
  ctx: ServiceContext,
  input: CreateTutorAssignmentRequest,
): Promise<TutorAssignment> {
  const [[tutor], [student], [subject]] = await Promise.all([
    ctx.db.select({ is_active: tutors.is_active }).from(tutors).where(eq(tutors.id, input.tutor_id)).limit(1),
    ctx.db.select({ is_active: students.is_active }).from(students).where(eq(students.id, input.student_id)).limit(1),
    ctx.db.select({ is_active: subjects.is_active }).from(subjects).where(eq(subjects.id, input.subject_id)).limit(1),
  ]);

  const details: ErrorDetail[] = [];
  if (!tutor?.is_active) details.push({ field: 'tutor_id', message: 'Tutor tidak ditemukan atau nonaktif' });
  if (!student?.is_active) details.push({ field: 'student_id', message: 'Siswa tidak ditemukan atau nonaktif' });
  if (!subject?.is_active) details.push({ field: 'subject_id', message: 'Mata pelajaran tidak ditemukan atau nonaktif' });
  if (details.length > 0) throw validationFailed(details);

  const [row] = await ctx.db
    .insert(tutorAssignments)
    .values({ ...input, end_date: input.end_date ?? null })
    .returning({ id: tutorAssignments.id });
  if (!row) throw new Error('Insert penugasan gagal');
  return getAssignment(ctx, row.id);
}

/** Tuple tutor/siswa/mapel immutable: hanya `end_date` dan `is_active`. */
export async function updateAssignment(
  ctx: ServiceContext,
  id: string,
  input: UpdateTutorAssignmentRequest,
): Promise<TutorAssignment> {
  const current = await getAssignment(ctx, id);
  if (input.end_date && input.end_date < current.start_date) {
    throw validationFailed([{ field: 'end_date', message: 'end_date tidak boleh sebelum start_date' }]);
  }
  await ctx.db
    .update(tutorAssignments)
    .set({ ...input, updated_at: ctx.now() })
    .where(eq(tutorAssignments.id, id));
  return getAssignment(ctx, id);
}
