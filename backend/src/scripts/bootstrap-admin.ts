import 'dotenv/config';
import { parseEnv } from '../config/env.js';
import { ensureBootstrapAdmin } from '../db/bootstrap-admin.js';
import { createDatabase } from '../db/client.js';
import { safeErrorMessage } from '../lib/db-errors.js';

/** `npm run db:bootstrap-admin -w backend` — membuat Admin awal dari env (idempoten). */
async function run() {
  const env = parseEnv(process.env);
  if (!env.BOOTSTRAP_ADMIN_USERNAME || !env.BOOTSTRAP_ADMIN_PASSWORD) {
    throw new Error('BOOTSTRAP_ADMIN_USERNAME dan BOOTSTRAP_ADMIN_PASSWORD wajib diisi');
  }
  const database = createDatabase(env.DATABASE_URL);
  try {
    const result = await ensureBootstrapAdmin(database.db, {
      username: env.BOOTSTRAP_ADMIN_USERNAME,
      password: env.BOOTSTRAP_ADMIN_PASSWORD,
    });
    console.log(
      result === 'created'
        ? `Admin "${env.BOOTSTRAP_ADMIN_USERNAME}" dibuat.`
        : `Admin "${env.BOOTSTRAP_ADMIN_USERNAME}" sudah ada; password tidak diubah.`,
    );
  } finally {
    await database.close();
  }
}

run().catch((error: unknown) => {
  console.error('Bootstrap admin gagal:', safeErrorMessage(error));
  process.exit(1);
});
