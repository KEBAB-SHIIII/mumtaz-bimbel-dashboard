import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('recalculates complete approved snapshots across periods, preserves other data, and is idempotent', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE lesson_sessions (
      id integer PRIMARY KEY, status text, duration_minutes integer,
      rate_amount_snapshot numeric, admin_fee_snapshot numeric,
      updated_at timestamptz DEFAULT '2026-01-01'
    );
    INSERT INTO lesson_sessions (id, status, duration_minutes, rate_amount_snapshot, admin_fee_snapshot) VALUES
      (1, 'approved', 89, 60000, 10000),
      (2, 'approved', 90, 90000, 10000),
      (3, 'approved', 91, 90000, 20000),
      (4, 'approved', 150, 150000, 20000),
      (5, 'approved', 210, 210000, 30000),
      (6, 'pending', 90, 90000, 10000),
      (7, 'revision_requested', 90, 90000, 10000),
      (8, 'rejected', 90, 90000, 10000),
      (9, 'approved', 90, NULL, 10000),
      (10, 'approved', 90, 90000, NULL),
      (11, 'approved', 30, 60000, 10000),
      (12, 'approved', 60, 60000, 10000);
    `);
    const query = 'SELECT * FROM lesson_sessions ORDER BY id';
    const before = (await db.query<Record<string, unknown>>(query)).rows;
    const sql = readFileSync(new URL('../drizzle/0008_admin_fee_inclusive.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    const after = (await db.query<Record<string, unknown>>(query)).rows;
    expect(after.map((r) => r.admin_fee_snapshot === null ? null : Number(r.admin_fee_snapshot)))
      .toEqual([10000, 20000, 20000, 30000, 40000, 10000, 10000, 10000, 10000, null, 10000, 10000]);
    expect(after.map((r) => r.rate_amount_snapshot)).toEqual(before.map((r) => r.rate_amount_snapshot));
    for (const index of [0, 2, 5, 6, 7, 8, 9, 10, 11]) expect(after[index]).toEqual(before[index]);
    await db.exec(sql);
    expect((await db.query<Record<string, unknown>>(query)).rows).toEqual(after);
  } finally {
    await db.close();
  }
});
