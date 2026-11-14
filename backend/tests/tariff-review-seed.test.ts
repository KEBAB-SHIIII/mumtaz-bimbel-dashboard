import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { fixtureSessions } from '@mumtaz/contracts/fixtures';
import { createTestApp, type TestApp } from './helpers/test-app.js';
import { lessonSessions, lessonSessionSubjects, students } from '../src/db/schema.js';
import { SEED_PREFIX, seedTariffReview } from '../src/db/tariff-review-seed.js';

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => t.close());

const snapshot = () => t.database.db.select().from(lessonSessions).orderBy(asc(lessonSessions.id));
let fixtureSd = 0;
const toMin = (v: string | null) => Number(v?.slice(0, 2)) * 60 + Number(v?.slice(3, 5));

describe('seed Oktober–November', () => {
  it('preview tidak mengubah data; backup gagal membatalkan seluruh transaksi', async () => {
    const before = await snapshot();
    const sd = await t.database.db.select().from(students);
    fixtureSd = Math.min(10, sd.filter((s) => s.grade.endsWith(' SD') && s.is_active).length);
    const preview = await seedTariffReview(t.database.db, { apply: false });
    expect(preview).toMatchObject({ replacedSessions: 0, studentsAdded: 20 });
    expect(preview.months.map(({ period, sessions, students: s }) => ({ period, sessions, students: s }))).toEqual([
      { period: '2026-10', sessions: 100, students: { SD: 0, SMP: 10, SMA: 10 } },
      { period: '2026-11', sessions: (fixtureSd + 10) * 3, students: { SD: fixtureSd, SMP: 5, SMA: 5 } },
    ]);
    expect(await snapshot()).toEqual(before);
    await expect(seedTariffReview(t.database.db, { apply: true, writeBackup: async () => { throw new Error('backup gagal'); } })).rejects.toThrow('backup gagal');
    expect(await snapshot()).toEqual(before);
  });

  it('hanya menambah baris seed, nama murid tanpa label dummy, jadwal tidak bentrok, dan idempoten', async () => {
    const before = await snapshot();
    await seedTariffReview(t.database.db, { apply: true, writeBackup: async () => {} });
    const after = await snapshot();
    const real = after.filter((s) => !s.id.startsWith(SEED_PREFIX));
    expect(real).toEqual(before);
    expect(real).toHaveLength(fixtureSessions.length);
    const seeded = after.filter((s) => s.id.startsWith(SEED_PREFIX));
    expect(seeded).toHaveLength(100 + (fixtureSd + 10) * 3);

    const all = await t.database.db.select().from(students);
    expect(all.some((s) => s.full_name.includes('Dummy') || s.school_name.includes('Contoh'))).toBe(false);
    for (const s of seeded) {
      expect(s).toMatchObject({ status: 'approved', validity: 'valid', anomaly_analysis_status: 'completed' });
      expect(s.lesson_date >= '2026-10-01' && s.lesson_date <= '2026-11-12').toBe(true);
      expect(new Date(`${s.lesson_date}T00:00:00Z`).getUTCDay()).not.toBe(0);
      expect(toMin(s.end_time) - toMin(s.start_time)).toBe(s.duration_minutes);
      expect(toMin(s.start_time)).toBeLessThanOrEqual(20 * 60);
      expect(s.rate_amount_snapshot).not.toBeNull();
      const links = await t.database.db.select().from(lessonSessionSubjects).where(eq(lessonSessionSubjects.lesson_session_id, s.id));
      expect(links.length).toBeGreaterThanOrEqual(1);
      const clash = after.filter((o) => o.id !== s.id && o.lesson_date === s.lesson_date && o.start_time && (
        o.student_id === s.student_id || (o.tutor_id === s.tutor_id && toMin(o.start_time) < toMin(s.end_time) && toMin(o.end_time) > toMin(s.start_time))));
      expect(clash).toEqual([]);
    }

    const repeat = await seedTariffReview(t.database.db, { apply: true, writeBackup: async () => {} });
    expect(repeat).toMatchObject({ replacedSessions: seeded.length, studentsAdded: 0 });
    expect(await snapshot()).toEqual(after);
  });
});
