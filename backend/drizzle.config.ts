import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// Migration memakai koneksi direct/unpooled bila tersedia (docs/11 §1).
// Review hasil `db:generate` sebelum `db:migrate`; jangan migrate ke DB UMKM tanpa izin.
const url = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error('DATABASE_MIGRATION_URL atau DATABASE_URL belum diset.');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
