import type { z } from 'zod';
import { validationFailed, type ErrorDetail } from './http-error.js';

function toDetails(error: z.ZodError): ErrorDetail[] {
  return error.issues.flatMap((issue) => {
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({ field: key, message: 'Field tidak dikenal' }));
    }
    return [{ field: issue.path.map(String).join('.') || '(body)', message: issue.message }];
  });
}

/** Validasi input dengan schema kontrak; gagal → `422 VALIDATION_FAILED` per field. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw validationFailed(toDetails(result.error));
  }
  return result.data;
}
