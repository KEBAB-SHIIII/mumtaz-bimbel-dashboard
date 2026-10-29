import 'dotenv/config';
import { parseEnv } from '../config/env.js';
import { createDatabase } from '../db/client.js';
import { seedSyntheticData } from '../db/seed.js';
import { safeErrorMessage } from '../lib/db-errors.js';

/**
 * `npm run db:seed -w backend` — seed SINTETIS untuk development.
 * Ditolak di production; idempoten dan tidak pernah menghapus/menimpa data.
 */
async function run() {
  const env = parseEnv(process.env);
  if (env.NODE_ENV === 'production') {
    throw new Error('Seed sintetis tidak boleh dijalankan di production');
  }
  if (!env.BOOTSTRAP_ADMIN_PASSWORD || !env.SEED_TUTOR_PASSWORD) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD dan SEED_TUTOR_PASSWORD wajib diisi untuk seed development');
  }

  const database = createDatabase(env.DATABASE_URL);
  try {
    await seedSyntheticData(database.db, {
      adminPassword: env.BOOTSTRAP_ADMIN_PASSWORD,
      tutorPassword: env.SEED_TUTOR_PASSWORD,
      parentAccessCodePepper: env.PARENT_ACCESS_CODE_PEPPER,
    });
    console.log('Seed sintetis selesai (data yang sudah ada dilewati).');
  } finally {
    await database.close();
  }
}

run().catch((error: unknown) => {
  console.error('Seed gagal:', safeErrorMessage(error));
  process.exit(1);
});
