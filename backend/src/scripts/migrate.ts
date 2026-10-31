import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { parseEnv } from '../config/env.js';
import { createDatabase } from '../db/client.js';
import { safeErrorMessage } from '../lib/db-errors.js';

/** Folder migration SQL; sama dari `src/scripts` (tsx) maupun `dist/scripts` (production). */
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

/**
 * Migration runtime tanpa `drizzle-kit` (devDependency) — untuk image/deploy production.
 * Memakai tabel histori yang sama dengan `drizzle-kit migrate` sehingga keduanya bisa dipakai
 * bergantian. Koneksi direct (`DATABASE_MIGRATION_URL`) diutamakan atas pooled.
 */
async function run() {
  const env = parseEnv(process.env);
  const database = createDatabase(env.DATABASE_MIGRATION_URL ?? env.DATABASE_URL);
  try {
    await migrate(database.db as Parameters<typeof migrate>[0], { migrationsFolder: MIGRATIONS_FOLDER });
    console.log('Migration selesai.');
  } finally {
    await database.close();
  }
}

run().catch((error: unknown) => {
  console.error('Migration gagal:', safeErrorMessage(error));
  process.exit(1);
});
