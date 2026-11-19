import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';
import { toApiError } from './api-error';

/** Input kosong dari form HTML → `undefined` agar field opsional lolos schema kontrak. */
export function stripEmpty<T extends Record<string, unknown>>(values: T): Partial<T> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== '' && value !== undefined)) as Partial<T>;
}

/**
 * Validasi nilai form dengan schema kontrak (sama dengan backend). Error ditampilkan
 * di dekat field; mengembalikan payload siap kirim atau `null` bila tidak valid.
 */
export function validateWith<F extends FieldValues, S extends z.ZodType>(form: UseFormReturn<F>, schema: S, payload: unknown): z.output<S> | null {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;
  for (const issue of result.error.issues) {
    const field = issue.code === 'unrecognized_keys' ? issue.keys[0] : issue.path.map(String).join('.');
    if (field) form.setError(field as Path<F>, { message: issue.message });
  }
  return null;
}

/** Error 409/422 dari server dengan `details[].field` → error di field terkait. */
export function applyServerErrors<F extends FieldValues>(form: UseFormReturn<F>, error: unknown, fields: readonly string[]): boolean {
  const { details } = toApiError(error);
  let applied = false;
  for (const detail of details) {
    if (fields.includes(detail.field)) {
      form.setError(detail.field as Path<F>, { message: detail.message });
      applied = true;
    }
  }
  return applied;
}

/** Apakah error server sudah tertampil di field (agar tidak diulang sebagai alert umum). */
export function hasFieldErrors(error: unknown, fields: readonly string[]): boolean {
  return toApiError(error).details.some((detail) => fields.includes(detail.field));
}
