/** Kode SQLSTATE PostgreSQL yang dipetakan ke respons API. */
export const PG_UNIQUE_VIOLATION = '23505';
export const PG_FOREIGN_KEY_VIOLATION = '23503';
export const PG_CHECK_VIOLATION = '23514';
export const PG_EXCLUSION_VIOLATION = '23P01';

export interface PgErrorInfo {
  code: string;
  constraint: string | undefined;
}

/**
 * Cari error PostgreSQL di rantai `cause` (Drizzle membungkus error driver).
 * Berlaku untuk `pg` maupun PGlite.
 */
export function findPgError(error: unknown): PgErrorInfo | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current === 'object' && current !== null) {
      const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown };
      if (typeof candidate.code === 'string' && /^[0-9A-Z]{5}$/.test(candidate.code)) {
        return {
          code: candidate.code,
          constraint: typeof candidate.constraint === 'string' ? candidate.constraint : undefined,
        };
      }
      current = candidate.cause;
    } else {
      break;
    }
  }
  return undefined;
}

/**
 * Pesan error yang aman untuk log/CLI. Pesan Drizzle (`Failed query: ... params: ...`)
 * memuat parameter query — bisa berisi hash password/digest kode akses — sehingga
 * untuk error database hanya SQLSTATE, constraint, dan pesan utama driver yang dipakai.
 */
export function safeErrorMessage(error: unknown): string {
  const pg = findPgError(error);
  if (pg) {
    let current: unknown = error;
    let driverMessage = '';
    while (typeof current === 'object' && current !== null) {
      const candidate = current as { code?: unknown; message?: unknown; cause?: unknown };
      if (candidate.code === pg.code && typeof candidate.message === 'string') {
        driverMessage = candidate.message;
        break;
      }
      current = candidate.cause;
    }
    return `PostgreSQL ${pg.code}${pg.constraint ? ` [${pg.constraint}]` : ''}${driverMessage ? `: ${driverMessage}` : ''}`;
  }
  if (error instanceof Error) {
    return error.message.startsWith('Failed query') ? `${error.name}: query gagal` : error.message.slice(0, 500);
  }
  return 'Unknown error';
}

export function isPgError(error: unknown, code: string, constraint?: string): boolean {
  const info = findPgError(error);
  return info?.code === code && (constraint === undefined || info.constraint === constraint);
}
