import { asc, count, eq } from 'drizzle-orm';
import type {
  CreateTutorRateRequest,
  Paginated,
  RateListQuery,
  RateType,
  TutorRate,
  UpdateTutorRateRequest,
} from '@mumtaz/contracts';
import { tutorAssignments, tutorRates } from '../../db/schema.js';
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

/** Periode tarif yang overlap untuk assignment sama ditolak exclusion constraint (409). */
export async function createRate(ctx: ServiceContext, input: CreateTutorRateRequest): Promise<TutorRate> {
  const [assignment] = await ctx.db
    .select({ id: tutorAssignments.id })
    .from(tutorAssignments)
    .where(eq(tutorAssignments.id, input.assignment_id))
    .limit(1);
  if (!assignment) {
    throw validationFailed([{ field: 'assignment_id', message: 'Penugasan tidak ditemukan' }]);
  }
  const [row] = await ctx.db
    .insert(tutorRates)
    .values({ ...input, effective_to: input.effective_to ?? null })
    .returning();
  if (!row) throw new Error('Insert tarif gagal');
  return toRate(row);
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
