import { and, asc, count, eq, gte, isNull, lte } from 'drizzle-orm';
import type {
  CreateTutorRateRequest,
  Paginated,
  RateListQuery,
  RateType,
  TutorRate,
  TutorRateCreated,
  UpdateTutorRateRequest,
} from '@mumtaz/contracts';
import { lessonSessions, tutorAssignments, tutorRates } from '../../db/schema.js';
import { iso, money } from '../../lib/format.js';
import { notFound, validationFailed } from '../../lib/http-error.js';
import { pageOffset, paginated } from '../../lib/pagination.js';
import type { ServiceContext } from '../context.js';

type RateRow = typeof tutorRates.$inferSelect;

function toRate(row: RateRow): TutorRate {
  return {
    ...row,
    rate_type: row.rate_type as RateType,
    rate_amount: money(row.rate_amount),
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

export async function listRates(ctx: ServiceContext, query: RateListQuery): Promise<Paginated<TutorRate>> {
  const where = query.assignment_id ? eq(tutorRates.assignment_id, query.assignment_id) : undefined;
  const [rows, [total]] = await Promise.all([
    ctx.db
      .select()
      .from(tutorRates)
      .where(where)
      .orderBy(asc(tutorRates.assignment_id), asc(tutorRates.effective_from))
      .limit(query.page_size)
      .offset(pageOffset(query)),
    ctx.db.select({ value: count() }).from(tutorRates).where(where),
  ]);
  return paginated(rows.map(toRate), query, total?.value ?? 0);
}

export async function getRate(ctx: ServiceContext, id: string): Promise<TutorRate> {
  const [row] = await ctx.db.select().from(tutorRates).where(eq(tutorRates.id, id)).limit(1);
  if (!row) throw notFound('Tarif');
  return toRate(row);
}

/**
 * Membuat tarif. Periode yang overlap untuk assignment sama ditolak exclusion constraint (409).
 *
 * Worst case yang ditangani: sesi yang di-approve SEBELUM tarifnya ada menyimpan snapshot
 * kosong dan tidak akan pernah masuk honor. Dalam transaksi yang sama, sesi approved milik
 * assignment ini yang snapshot-nya masih kosong dan `lesson_date`-nya dalam masa berlaku
 * tarif diisi snapshot dari tarif baru. Snapshot yang sudah terisi TIDAK pernah ditimpa,
 * sehingga histori honor yang sudah dihitung tetap konsisten.
 */
export async function createRate(ctx: ServiceContext, input: CreateTutorRateRequest): Promise<TutorRateCreated> {
  const [assignment] = await ctx.db
    .select({ id: tutorAssignments.id })
    .from(tutorAssignments)
    .where(eq(tutorAssignments.id, input.assignment_id))
    .limit(1);
  if (!assignment) {
    throw validationFailed([{ field: 'assignment_id', message: 'Penugasan tidak ditemukan' }]);
  }
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(tutorRates)
      .values({ ...input, effective_to: input.effective_to ?? null })
      .returning();
    if (!row) throw new Error('Insert tarif gagal');

    const backfilled = await tx
      .update(lessonSessions)
      .set({
        rate_type_snapshot: row.rate_type,
        rate_amount_snapshot: row.rate_amount,
        rate_is_demo_snapshot: row.is_demo_assumption,
        updated_at: ctx.now(),
      })
      .where(
        and(
          eq(lessonSessions.assignment_id, row.assignment_id),
          eq(lessonSessions.status, 'approved'),
          isNull(lessonSessions.rate_amount_snapshot),
          gte(lessonSessions.lesson_date, row.effective_from),
          row.effective_to ? lte(lessonSessions.lesson_date, row.effective_to) : undefined,
        ),
      )
      .returning({ id: lessonSessions.id });

    return { ...toRate(row), applied_to_approved_sessions: backfilled.length };
  });
}

/**
 * Hanya `effective_to` (menutup periode). Nominal/jenis/tanggal mulai tidak diubah:
 * buat record tarif baru agar histori snapshot tetap konsisten.
 */
export async function updateRate(ctx: ServiceContext, id: string, input: UpdateTutorRateRequest): Promise<TutorRate> {
  const current = await getRate(ctx, id);
  if (input.effective_to && input.effective_to < current.effective_from) {
    throw validationFailed([{ field: 'effective_to', message: 'effective_to tidak boleh sebelum effective_from' }]);
  }
  const [row] = await ctx.db
    .update(tutorRates)
    .set({ ...input, updated_at: ctx.now() })
    .where(eq(tutorRates.id, id))
    .returning();
  if (!row) throw notFound('Tarif');
  return toRate(row);
}
