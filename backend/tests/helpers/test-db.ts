import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { DatabaseHandle, SessionStorePool } from '../../src/db/client.js';
import * as schema from '../../src/db/schema.js';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** Samakan serialisasi parameter objek dengan `pg` (JSON.stringify untuk kolom json). */
function serializeParam(value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !(value instanceof Date) && !ArrayBuffer.isView(value)) {
    return JSON.stringify(value);
  }
  return value;
}

/**
 * Database PostgreSQL in-process (PGlite) dengan migration yang SAMA seperti Neon.
 * Offline, tanpa credential live; satu instance per file test.
 */
export async function createTestDatabase(): Promise<DatabaseHandle> {
  const client = new PGlite({ extensions: { btree_gist } });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder });

  const sessionPool: SessionStorePool = {
    query: async (text, params = []) => client.query(text, params.map(serializeParam)),
  };

  return { db, sessionPool, close: () => client.close() };
}
