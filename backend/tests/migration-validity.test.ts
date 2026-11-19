import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const drizzleDir = fileURLToPath(new URL('../drizzle/', import.meta.url));

async function applyMigration(client: PGlite, name: string): Promise<void> {
  const sql = readFileSync(`${drizzleDir}${name}.sql`, 'utf8');
  for (const statement of sql.split('--> statement-breakpoint')) {
    if (statement.trim()) await client.exec(statement);
  }
}

const ID = {
  tutorUser: '00000000-0000-4000-8000-000000000001',
  tutor: '00000000-0000-4000-8002-000000000001',
  student: '00000000-0000-4000-8003-000000000001',
  subject: '00000000-0000-4000-8004-000000000001',
};
const session = (n: number) => `00000000-0000-4000-8000-0000000000a${n}`;

/**
 * Migration 0005–0006 (revisi PM: validitas, jam, multi-mapel) pada database BERISI: mapel tunggal
 * lama pindah ke `lesson_session_subjects`, status lama dipetakan ke label validitas, sesi lama
 * tanpa jam tetap sah, dan snapshot historis utuh.
 */
describe('migration 0005–0006: validitas, jam, dan multi-mapel', () => {
  let client: PGlite;

  beforeAll(async () => {
    client = new PGlite({ extensions: { btree_gist } });
    for (const name of [
      '0000_init',
      '0001_overlap_constraints',
      '0002_export_run_lock',
      '0003_session_direct_refs',
      '0004_drop_assignments_rates',
    ]) {
      await applyMigration(client, name);
    }

    const insertSession = (n: number, status: string, extra = '') => `
      INSERT INTO lesson_sessions (id, client_submission_id, tutor_id, student_id, subject_id, lesson_date, duration_minutes,
        learning_material, status${extra ? ', rate_amount_snapshot' : ''}${status === 'pending' ? '' : ', reviewed_by_user_id, reviewed_at, admin_note'})
      VALUES ('${session(n)}', gen_random_uuid(), '${ID.tutor}', '${ID.student}', '${ID.subject}', '2026-10-0${n}', 60, 'Materi', '${status}'
        ${extra}${status === 'pending' ? '' : `, '${ID.tutorUser}', now(), 'Catatan'`});`;
    await client.exec(`
      INSERT INTO users (id, full_name, username, password_hash, role) VALUES ('${ID.tutorUser}', 'Farhan', 'farhan', 'hash', 'tutor');
      INSERT INTO tutors (id, user_id) VALUES ('${ID.tutor}', '${ID.tutorUser}');
      INSERT INTO students (id, full_name, grade, school_name) VALUES ('${ID.student}', 'Aisyah', '3 SD', 'SD Harapan Bangsa');
      INSERT INTO subjects (id, name) VALUES ('${ID.subject}', 'Matematika');
      ${insertSession(1, 'approved', ', 50000')}
      ${insertSession(2, 'pending')}
      ${insertSession(3, 'revision_requested')}
      ${insertSession(4, 'rejected')}
    `);

    await applyMigration(client, '0005_session_validity_multi_subject');
    await applyMigration(client, '0006_drop_session_subject_id');
  });
  afterAll(() => client.close());

  it('mapel tunggal lama pindah ke tabel relasi; kolom subject_id hilang', async () => {
    const { rows } = await client.query<{ lesson_session_id: string; subject_id: string }>(
      'SELECT lesson_session_id, subject_id FROM lesson_session_subjects ORDER BY lesson_session_id',
    );
    expect(rows).toEqual([1, 2, 3, 4].map((n) => ({ lesson_session_id: session(n), subject_id: ID.subject })));
    const { rows: columns } = await client.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'lesson_sessions'",
    );
    expect(columns.map((column) => column.column_name)).not.toContain('subject_id');
  });

  it('status lama → validitas; sesi lama tanpa jam; snapshot historis utuh', async () => {
    const { rows } = await client.query<{ status: string; validity: string | null; start_time: string | null; rate_amount_snapshot: string | null }>(
      'SELECT status, validity, start_time, rate_amount_snapshot FROM lesson_sessions ORDER BY lesson_date',
    );
    expect(rows.map((row) => [row.status, row.validity, row.start_time])).toEqual([
      ['approved', 'valid', null],
      ['pending', null, null],
      ['revision_requested', 'needs_revision', null],
      ['rejected', 'rejected', null],
    ]);
    expect(Number(rows[0]?.rate_amount_snapshot)).toBe(50000);
  });

  it('constraint baru: jam selesai harus setelah jam mulai; keputusan AI boleh tanpa reviewer', async () => {
    await expect(client.exec(`UPDATE lesson_sessions SET start_time = '17:00', end_time = '16:00' WHERE id = '${session(2)}'`)).rejects.toThrow(
      /time_range_check/,
    );
    await expect(client.exec(`UPDATE lesson_sessions SET start_time = '16:00', end_time = NULL WHERE id = '${session(2)}'`)).rejects.toThrow(
      /time_range_check/,
    );
    await client.exec(
      `UPDATE lesson_sessions SET status = 'rejected', validity = 'rejected', reviewed_at = now(), reviewed_by_user_id = NULL WHERE id = '${session(2)}'`,
    );
    await expect(client.exec(`UPDATE lesson_sessions SET validity = 'approved' WHERE id = '${session(2)}'`)).rejects.toThrow(/validity_check/);
  });
});
