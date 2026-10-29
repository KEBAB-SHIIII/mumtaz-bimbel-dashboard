import { z } from 'zod';

export const uuidSchema = z.uuid();

/** Tanggal kalender `YYYY-MM-DD` yang benar-benar ada (mis. menolak 2026-02-30). */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD')
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number) as [number, number, number];
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }, 'Tanggal tidak valid');

export type IsoDate = z.infer<typeof isoDateSchema>;

/** Timestamp ISO 8601 dengan offset (timestamptz). */
export const timestampSchema = z.iso.datetime({ offset: true });

/** Nominal uang sebagai string desimal (decimal-safe); frontend tidak menghitung ulang. */
export const moneyStringSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Nominal harus angka desimal non-negatif, maksimal 2 digit desimal');

export const positiveMoneyStringSchema = moneyStringSchema.refine(
  (value) => Number(value) > 0,
  'Nominal harus lebih dari 0',
);

/** Teks wajib: di-trim dan tidak boleh kosong. */
export const requiredText = (max: number) => z.string().trim().min(1, 'Wajib diisi').max(max);

/** Teks opsional: string kosong/whitespace dinormalisasi menjadi `null`. */
export const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(max).nullable().optional(),
  );

// Pagination — docs/04 §4: default page=1, page_size=20, maksimum 100.
export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 100;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const paginatedSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number().int().min(1),
    page_size: z.number().int().min(1).max(PAGE_SIZE_MAX),
    total: z.number().int().min(0),
  });

export interface Paginated<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}
