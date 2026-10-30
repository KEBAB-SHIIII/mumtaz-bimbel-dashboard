import 'dotenv/config';
import { parseEnv } from '../config/env.js';
import { createDatabase } from '../db/client.js';
import { seedDevDataset } from '../db/seed.js';
import { safeErrorMessage } from '../lib/db-errors.js';

/**
 * Seed SINTETIS development (`db:seed`) atau reset total + seed (`db:reset-dev -- --yes`).
 * Ditolak di production. Reset menghapus semua data di database tujuan `DATABASE_URL`
 * (schema/migration tetap) — pastikan itu branch Neon development.
 */
async function run() {
  const env = parseEnv(process.env);
  const reset = process.argv.includes('--reset');
  if (env.NODE_ENV === 'production') {
    throw new Error('Seed/reset sintetis tidak boleh dijalankan di production');
  }
  if (reset && !process.argv.includes('--yes')) {
    throw new Error('Reset menghapus SEMUA data. Jalankan ulang dengan: npm run db:reset-dev -w backend -- --yes');
  }
  if (!env.BOOTSTRAP_ADMIN_PASSWORD || !env.SEED_TUTOR_PASSWORD) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD dan SEED_TUTOR_PASSWORD wajib diisi untuk seed development');
  }

  const database = createDatabase(env.DATABASE_URL);
  try {
    const { sessions } = await seedDevDataset(database.db, {
      reset,
      adminPassword: env.BOOTSTRAP_ADMIN_PASSWORD,
      tutorPassword: env.SEED_TUTOR_PASSWORD,
      parentAccessCodePepper: env.PARENT_ACCESS_CODE_PEPPER,
    });
    console.log(
      reset
        ? `Reset selesai: semua data lama dihapus, lalu master data + ${sessions} sesi dataset dev diisi.`
        : `Seed sintetis selesai: master data + ${sessions} sesi dataset dev (data yang sudah ada dilewati).`,
    );
  } finally {
    await database.close();
  }
}

run().catch((error: unknown) => {
  console.error('Seed gagal:', safeErrorMessage(error));
  process.exit(1);
});
