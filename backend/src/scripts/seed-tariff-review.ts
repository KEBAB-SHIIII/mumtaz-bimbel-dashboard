import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase } from '../db/client.js';
import { seedTariffReview } from '../db/tariff-review-seed.js';
import { safeErrorMessage } from '../lib/db-errors.js';

async function run() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--apply')) throw new Error('Gunakan tanpa argumen untuk preview atau --apply untuk mengganti data seed Oktober–November 2026.');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL wajib tersedia.');
  const database = createDatabase(process.env.DATABASE_URL);
  const apply = args.includes('--apply');
  const backupPath = join(tmpdir(), `mumtaz-tariff-review-${Date.now()}.json`);
  try {
    const summary = await seedTariffReview(database.db, apply ? {
      apply: true,
      writeBackup: async (backup) => {
        await writeFile(backupPath, JSON.stringify(backup, null, 2), { mode: 0o600, flag: 'wx' });
        console.log(`Backup tersimpan: ${backupPath}`);
      },
    } : { apply: false });
    console.log(JSON.stringify({ mode: apply ? 'applied' : 'preview', ...summary }, null, 2));
  } finally {
    await database.close();
  }
}

run().catch((error: unknown) => {
  console.error('Seed tarif gagal:', safeErrorMessage(error));
  process.exitCode = 1;
});
