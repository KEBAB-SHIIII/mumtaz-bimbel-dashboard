import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTemporaryPassword, hashPassword } from '../auth/password.js';
import { createDatabase } from '../db/client.js';
import { importRealData } from '../db/real-data-import.js';
import { safeErrorMessage } from '../lib/db-errors.js';
import { parseCsv } from '../services/import/real-data.js';

const DEFAULT_CSV = fileURLToPath(new URL('../../../docs/dataset/data-bimbel.csv', import.meta.url));
const USAGE = 'Pakai: npm run db:import-real-data -w backend -- [--file <csv>] [--out-dir <folder>] [--apply]';

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

async function run() {
  const opts = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL wajib tersedia.');
  const records = parseCsv(await readFile(opts.file, 'utf8'));
  const stamp = Date.now();
  const reportPath = join(opts.outDir, `mumtaz-import-report-${stamp}.json`);

  const database = createDatabase(process.env.DATABASE_URL);
  try {
    const backupPath = join(opts.outDir, `mumtaz-backup-before-import-${stamp}.json`);
    const result = await importRealData(database.db, records, opts.apply ? {
      apply: true, hashPassword, generatePassword: generateTemporaryPassword,
      writeBackup: async (backup) => {
        await writeFile(backupPath, JSON.stringify(backup, null, 2), { mode: 0o600, flag: 'wx' });
        console.log(`Backup data lama: ${backupPath}`);
      },
    } : { apply: false });
    const { plan } = result;
    await writeFile(reportPath, JSON.stringify({ kept: result.kept, issues: plan.issues, tutors: plan.tutors.map(({ name, username, sessions }) => ({ name, username, sessions })),
      students: plan.students.map(({ name, school, grade, history, sessions }) => ({ name, school, grade, history, sessions })) }, null, 2), { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ mode: opts.apply ? 'applied' : 'preview', blocked: result.blocked, kept: result.kept, existing: result.existing, ...result.summary }, null, 2));
    console.log(`Laporan detail: ${reportPath}`);
    if (result.credentials.length) {
      // Password sementara hanya ditulis ke file privat di luar repo, tidak dicetak ke terminal.
      const credentialsPath = join(opts.outDir, `mumtaz-tutor-credentials-${stamp}.csv`);
      const csv = ['nama,username,password_sementara', ...result.credentials.map((c) => `"${c.name}",${c.username},${c.temporaryPassword}`)].join('\n');
      await writeFile(credentialsPath, `${csv}\n`, { mode: 0o600, flag: 'wx' });
      console.log(`Akun tutor (${result.credentials.length}) dan password sementara: ${credentialsPath}`);
    }
    if (result.blocked) process.exitCode = 1;
  } finally {
    await database.close();
  }
}

run().catch((error: unknown) => {
  console.error('Impor data asli gagal:', safeErrorMessage(error));
  process.exitCode = 1;
});
