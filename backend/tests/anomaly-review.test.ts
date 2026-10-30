import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anomalyFindingSchema } from '@mumtaz/contracts';
import { ASSIGNMENT_IDS, FINDING_IDS, SESSION_IDS, USER_IDS } from '@mumtaz/contracts/fixtures';
import { lessonSessions } from '../src/db/schema.js';
import { as, createTestApp, type TestApp, type TestClient } from './helpers/test-app.js';

let t: TestApp;
let admin: TestClient;

beforeAll(async () => {
  t = await createTestApp();
  admin = await as.admin(t.app);
});
afterAll(() => t.close());

describe('PATCH /admin/anomalies/:id/review', () => {
  it('mencatat review Admin tanpa mengubah status sesi', async () => {
    const before = (await t.database.db.select().from(lessonSessions).where(eq(lessonSessions.id, SESSION_IDS.s10)))[0];
    const res = await admin.patch(`/admin/anomalies/${FINDING_IDS.outlierS10}/review`, {
      review_status: 'false_positive',
      review_note: 'Sesi persiapan ujian memang 4 jam.',
    });
    expect(res.status).toBe(200);
    expect(anomalyFindingSchema.parse(res.body)).toMatchObject({
      review_status: 'false_positive',
      reviewed_by_user_id: USER_IDS.admin,
      review_note: 'Sesi persiapan ujian memang 4 jam.',
      reviewed_at: '2026-11-15T03:00:00.000Z',
    });
    const after = (await t.database.db.select().from(lessonSessions).where(eq(lessonSessions.id, SESSION_IDS.s10)))[0];
    expect(after?.status).toBe(before?.status);
    expect(after?.status).toBe('pending');
  });

  it('review_note wajib; superseded/pending_review tidak boleh dikirim Admin → 422', async () => {
    const path = `/admin/anomalies/${FINDING_IDS.duplicateS09}/review`;
    expect((await admin.patch(path, { review_status: 'confirmed_anomaly' })).status).toBe(422);
    expect((await admin.patch(path, { review_status: 'superseded', review_note: 'x' })).status).toBe(422);
    expect((await admin.patch(path, { review_status: 'pending_review', review_note: 'x' })).status).toBe(422);
  });

  it('temuan superseded (payload lama setelah revisi) → 409', async () => {
    // Admin minta revisi s09 → Tutor merevisi → finding duplikasi menjadi superseded.
    await admin
      .patch(`/admin/attendance/${SESSION_IDS.s09}/decision`, { decision: 'revision_requested', admin_note: 'Cek tanggal' })
      .expect(200);
    const tutor = await as.tutorA(t.app);
    await tutor
      .patch(`/tutor/me/attendance/${SESSION_IDS.s09}`, {
        assignment_id: ASSIGNMENT_IDS.tutorAMurid2BahasaInggris,
        lesson_date: '2026-10-11',
        duration_minutes: 60,
        learning_material: 'Numbers 1–100',
      })
      .expect(200);

    const res = await admin.patch(`/admin/anomalies/${FINDING_IDS.duplicateS09}/review`, { review_status: 'resolved', review_note: 'x' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SESSION_STATE_CONFLICT');
  });

  it('temuan tidak ada → 404; selain Admin → 403', async () => {
    expect((await admin.patch('/admin/anomalies/00000000-0000-4000-8fff-000000000001/review', { review_status: 'resolved', review_note: 'x' })).status).toBe(404);
    const tutor = await as.tutorA(t.app);
    expect((await tutor.patch(`/admin/anomalies/${FINDING_IDS.outlierS10}/review`, { review_status: 'resolved', review_note: 'x' })).status).toBe(403);
  });
});
