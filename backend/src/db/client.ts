import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type Database = ReturnType<typeof createDatabase>['db'];

/**
 * Membuat pool `pg` + Drizzle untuk Neon (pooled `DATABASE_URL`).
 * Pool bersifat lazy: koneksi baru dibuka saat query pertama, sehingga
 * unit test yang tidak menyentuh DB tidak membutuhkan credential live.
 */
export function createDatabase(connectionString: string) {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  const db = drizzle({ client: pool, schema });
  return { db, pool };
}
