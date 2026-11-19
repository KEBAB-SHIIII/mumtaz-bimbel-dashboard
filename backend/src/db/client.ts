import { drizzle } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import pg from 'pg';
import * as schema from './schema.js';

export type Schema = typeof schema;

/**
 * Tipe database yang driver-agnostic: runtime memakai `pg` (Neon), test memakai
 * PGlite (PostgreSQL in-process). Service hanya bergantung pada tipe ini.
 */
export type Database = PgDatabase<PgQueryResultHKT, Schema>;
export type Transaction = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
export type DbOrTx = Database | Transaction;

/** Antarmuka minimal yang dibutuhkan `connect-pg-simple`. */
export interface SessionStorePool {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface DatabaseHandle {
  db: Database;
  sessionPool: SessionStorePool;
  close(): Promise<void>;
}

/**
 * Pool `pg` + Drizzle untuk Neon (pooled `DATABASE_URL`).
 * Pool bersifat lazy: koneksi dibuka saat query pertama.
 */
export function createDatabase(connectionString: string): DatabaseHandle {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on('error', (error) => {
    // Error idle client (mis. Neon menutup koneksi); jangan crash proses.
    console.error('[db] idle client error', error.message);
  });
  const db = drizzle({ client: pool, schema });
  return {
    db,
    sessionPool: pool,
    close: () => pool.end(),
  };
}
