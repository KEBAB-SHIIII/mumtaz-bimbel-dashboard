import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../db/client.js';
import { refreshRealData } from '../db/real-data-refresh.js';
import { safeErrorMessage } from '../lib/db-errors.js';
import { parseCsv } from '../services/import/real-data.js';

const DEFAULT_CSV = fileURLToPath(new URL('../../../docs/dataset/data-bimbel.csv', import.meta.url));
const USAGE = 'Pakai: npm run db:refresh-real-data -w backend -- [--file <csv>] [--out-dir <folder>] [--apply]';

function parseArgs(args: string[]) {
  const opts = { apply: false, file: DEFAULT_CSV, outDir: tmpdir() };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--apply') opts.apply = true;
    else if (arg === '--file' && args[i + 1]) opts.file = resolve(args[++i] as string);
    else if (arg === '--out-dir' && args[i + 1]) opts.outDir = resolve(args[++i] as string);
    else throw new Error(USAGE);
  }
  return opts;
}

/** Pembaruan data historis dari dataset DS revisi (lihat `refreshRealData`). Default preview. */
async function run() {
  const opts = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL wajib tersedia.');
  const records = parseCsv(await readFile(opts.file, 'utf8'));
  const stamp = Date.now();
  const database = createDatabase(process.env.DATABASE_URL);
  try {
    const backupPath = join(opts.outDir, `mumtaz-backup-before-refresh-${stamp}.json`);
    const result = await refreshRealData(database.db, records, opts.apply ? {
      apply: true,
      writeBackup: async (backup) => {
        await writeFile(backupPath, JSON.stringify(backup, null, 2), { mode: 0o600, flag: 'wx' });
        console.log(`Backup data lama: ${backupPath}`);
      },
    } : { apply: false });
    const reportPath = join(opts.outDir, `mumtaz-refresh-report-${stamp}.json`);
    await writeFile(reportPath, JSON.stringify({ diff: result.diff, issues: result.plan.issues }, null, 2), { mode: 0o600, flag: 'wx' });
    const { months, ...summary } = result.summary;
    console.log(JSON.stringify({ mode: opts.apply ? 'applied' : 'preview', blocked: result.blocked, diff: result.diff, ...summary,
      total: { gross: months.reduce((n, m) => n + m.gross, 0), adminFee: months.reduce((n, m) => n + m.adminFee, 0) } }, null, 2));
    console.log(`Laporan detail: ${reportPath}`);
    if (result.blocked) process.exitCode = 1;
  } finally {
    await database.close();
  }
}

run().catch((error: unknown) => {
  console.error('Pembaruan data DS gagal:', safeErrorMessage(error));
  process.exitCode = 1;
});
