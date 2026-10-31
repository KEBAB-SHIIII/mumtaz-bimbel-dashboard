import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const drizzleDir = fileURLToPath(new URL('../drizzle/', import.meta.url));

/** Jalankan satu file migration drizzle statement demi statement (pemisah `--> statement-breakpoint`). */
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
  assignment: '00000000-0000-4000-8005-000000000001',
  approved: '00000000-0000-4000-8000-0000000000a1',
  pending: '00000000-0000-4000-8000-0000000000a2',
};

/**
 * Migration 0003–0004 (hapus penugasan & tarif) pada database BERISI: setiap sesi harus
 * mempertahankan tutor/murid/mapel dari penugasan lamanya, dan snapshot tarif historis utuh.
 */
describe('migration 0003–0004: sesi merujuk tutor/murid/mapel langsung', () => {
  let client: PGlite;

  beforeAll(async () => {
    client = new PGlite({ extensions: { btree_gist } });
    for (const name of ['0000_init', '0001_overlap_constraints', '0002_export_run_lock']) await applyMigration(client, name);

    await client.exec(`
      INSERT INTO users (id, full_name, username, password_hash, role) VALUES ('${ID.tutorUser}', 'Farhan', 'farhan', 'hash', 'tutor');
      INSERT INTO tutors (id, user_id) VALUES ('${ID.tutor}', '${ID.tutorUser}');
      INSERT INTO students (id, full_name, grade, school_name) VALUES ('${ID.student}', 'Aisyah', '3 SD', 'SD Harapan Bangsa');
      INSERT INTO subjects (id, name) VALUES ('${ID.subject}', 'Matematika');
      INSERT INTO tutor_assignments (id, tutor_id, student_id, subject_id, start_date) VALUES ('${ID.assignment}', '${ID.tutor}', '${ID.student}', '${ID.subject}', '2026-09-01');
      INSERT INTO tutor_rates (assignment_id, rate_type, rate_amount, is_demo_assumption, effective_from) VALUES ('${ID.assignment}', 'per_session', 50000, false, '2026-09-01');
      INSERT INTO lesson_sessions (id, client_submission_id, assignment_id, lesson_date, duration_minutes, learning_material, status,
        rate_type_snapshot, rate_amount_snapshot, rate_is_demo_snapshot, reviewed_by_user_id, reviewed_at)
        VALUES ('${ID.approved}', '00000000-0000-4000-9000-0000000000a1', '${ID.assignment}', '2026-10-01', 90, 'Perkalian', 'approved',
        'per_session', 50000, false, '${ID.tutorUser}', now());
      INSERT INTO lesson_sessions (id, client_submission_id, assignment_id, lesson_date, duration_minutes, learning_material)
        VALUES ('${ID.pending}', '00000000-0000-4000-9000-0000000000a2', '${ID.assignment}', '2026-10-02', 60, 'Pembagian');
    `);

    await applyMigration(client, '0003_session_direct_refs');
    await applyMigration(client, '0004_drop_assignments_rates');
  });
  afterAll(() => client.close());

  it('semua sesi dipertahankan dan mewarisi tutor/murid/mapel dari penugasan lama', async () => {
    const { rows } = await client.query<{ id: string; tutor_id: string; student_id: string; subject_id: string }>(
      'SELECT id, tutor_id, student_id, subject_id FROM lesson_sessions ORDER BY lesson_date',
    );
    expect(rows).toEqual([
      { id: ID.approved, tutor_id: ID.tutor, student_id: ID.student, subject_id: ID.subject },
      { id: ID.pending, tutor_id: ID.tutor, student_id: ID.student, subject_id: ID.subject },
    ]);
  });

  it('snapshot honor historis utuh; kolom tipe/demo dan penugasan/tarif sudah hilang', async () => {
    const { rows } = await client.query<{ rate_amount_snapshot: string | null }>(
      'SELECT rate_amount_snapshot FROM lesson_sessions ORDER BY lesson_date',
    );
    expect(rows.map((row) => (row.rate_amount_snapshot === null ? null : Number(row.rate_amount_snapshot)))).toEqual([50000, null]);

    const { rows: columns } = await client.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'lesson_sessions'",
    );
    const names = columns.map((column) => column.column_name);
    expect(names).toEqual(expect.arrayContaining(['tutor_id', 'student_id', 'subject_id', 'rate_amount_snapshot']));
    expect(names).not.toEqual(expect.arrayContaining(['assignment_id']));
    expect(names).not.toEqual(expect.arrayContaining(['rate_type_snapshot']));
    expect(names).not.toEqual(expect.arrayContaining(['rate_is_demo_snapshot']));

    const { rows: tables } = await client.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_name IN ('tutor_assignments', 'tutor_rates')",
    );
    expect(tables).toEqual([]);
  });

  it('kolom baru wajib terisi dan FK menolak murid yang tidak ada', async () => {
    await expect(
      client.exec(
        `INSERT INTO lesson_sessions (client_submission_id, tutor_id, student_id, subject_id, lesson_date, duration_minutes, learning_material)
         VALUES (gen_random_uuid(), '${ID.tutor}', gen_random_uuid(), '${ID.subject}', '2026-10-03', 60, 'x')`,
      ),
    ).rejects.toThrow(/foreign key/i);
    await expect(
      client.exec(
        `INSERT INTO lesson_sessions (client_submission_id, tutor_id, subject_id, lesson_date, duration_minutes, learning_material)
         VALUES (gen_random_uuid(), '${ID.tutor}', '${ID.subject}', '2026-10-03', 60, 'x')`,
      ),
    ).rejects.toThrow(/null value/i);
  });
});
