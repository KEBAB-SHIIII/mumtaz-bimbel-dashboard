import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminDashboardSummarySchema,
  parentDashboardSummarySchema,
  payrollPreviewResponseSchema,
  recapResponseSchema,
  tutorDashboardSummarySchema,
} from '@mumtaz/contracts';
import { EXPECTED_PAYROLL_2026_10, STUDENT_IDS, SUBJECT_IDS, TUTOR_IDS, SESSION_IDS } from '@mumtaz/contracts/fixtures';
import { as, createTestApp, type TestApp, type TestClient } from './helpers/test-app.js';

let t: TestApp;
let admin: TestClient;

beforeAll(async () => {
  t = await createTestApp();
  admin = await as.admin(t.app);
});
afterAll(() => t.close());

describe('Payroll preview (estimasi honor)', () => {
  it('Oktober 2026 sesuai expected outcome fixture: hanya approved × tarif tunggal Rp50.000', async () => {
    const res = await admin.get('/admin/payroll/preview?period=2026-10').expect(200);
    const body = payrollPreviewResponseSchema.parse(res.body);

    expect(body.total_estimated_amount).toBe(EXPECTED_PAYROLL_2026_10.total_estimated_amount);
    expect(body.warnings).toEqual([]);

    for (const expected of EXPECTED_PAYROLL_2026_10.tutors) {
      const actual = body.tutors.find((tutor) => tutor.tutor_id === expected.tutor_id);
      expect(actual).toMatchObject({
        approved_sessions: expected.approved_sessions,
        pending_sessions: expected.pending_sessions,
        revision_requested_sessions: expected.revision_requested_sessions,
        rejected_sessions: expected.rejected_sessions,
        estimated_amount: expected.estimated_amount,
      });
      // Traceable ke sesi.
      expect(actual?.rate_lines.flatMap((line) => line.session_ids).sort()).toEqual(
        [...expected.approved_session_ids].sort(),
      );
    }
  });

  it('periode memakai lesson_date: s05 (31 Okt, disubmit Nov) masuk Oktober, s06 masuk November', async () => {
    const nov = payrollPreviewResponseSchema.parse((await admin.get('/admin/payroll/preview?period=2026-11').expect(200)).body);
    expect(nov.total_estimated_amount).toBe('50000');
    expect(nov.tutors[0]?.rate_lines[0]?.session_ids).toEqual([SESSION_IDS.s06]);
  });

  it('periode tanpa sesi → nol', async () => {
    const body = payrollPreviewResponseSchema.parse((await admin.get('/admin/payroll/preview?period=2027-01').expect(200)).body);
    expect(body).toMatchObject({ tutors: [], total_estimated_amount: '0' });
  });

  it('tutor hanya melihat honor miliknya', async () => {
    const tutorB = await as.tutorB(t.app);
    const body = payrollPreviewResponseSchema.parse((await tutorB.get('/tutor/me/payroll?period=2026-10').expect(200)).body);
    expect(body.tutors.map((tutor) => tutor.tutor_id)).toEqual([TUTOR_IDS.tutorB]);
    expect(body.total_estimated_amount).toBe('50000');
  });

  it('periode tidak valid → 422', async () => {
    expect((await admin.get('/admin/payroll/preview?period=2026-13')).status).toBe(422);
    expect((await admin.get('/admin/payroll/preview')).status).toBe(422);
  });

  it('approve mengunci tarif tunggal konfigurasi; mengganti HONOR_RATE_PER_SESSION tidak mengubah sesi lama', async () => {
    const tutorB = await as.tutorB(t.app);
    const submit = await tutorB
      .post('/tutor/attendance', {
        client_submission_id: '00000000-0000-4000-9000-000000000300',
        student_id: STUDENT_IDS.murid1,
        subject_id: SUBJECT_IDS.ipa,
        lesson_date: '2026-11-10',
        duration_minutes: 60,
        learning_material: 'Sesi tanpa penugasan (tutor memilih sendiri)',
      })
      .expect(201);
    await admin.patch(`/admin/attendance/${submit.body.session.id as string}/decision`, { decision: 'approved' }).expect(200);

    const body = payrollPreviewResponseSchema.parse((await admin.get('/admin/payroll/preview?period=2026-11').expect(200)).body);
    expect(body.tutors.find((tutor) => tutor.tutor_id === TUTOR_IDS.tutorB)).toMatchObject({
      approved_sessions: 1,
      approved_sessions_without_rate: 0,
      estimated_amount: '50000',
    });
    expect(body.total_estimated_amount).toBe('100000');
    expect(body.warnings).toEqual([]);

    // Konfigurasi tarif diganti (app kedua, database sama): sesi lama tetap Rp50.000, sesi baru Rp65.000.
    const raised = await createTestApp({ seed: false, env: { HONOR_RATE_PER_SESSION: '65000' }, database: t.database });
    const adminRaised = await as.admin(raised.app);
    const tutorBRaised = await as.tutorB(raised.app);
    const second = await tutorBRaised
      .post('/tutor/attendance', {
        client_submission_id: '00000000-0000-4000-9000-000000000301',
        student_id: STUDENT_IDS.murid1,
        subject_id: SUBJECT_IDS.ipa,
        lesson_date: '2026-11-11',
        duration_minutes: 60,
        learning_material: 'Sesi setelah tarif konfigurasi naik',
      })
      .expect(201);
    await adminRaised.patch(`/admin/attendance/${second.body.session.id as string}/decision`, { decision: 'approved' }).expect(200);
    const after = payrollPreviewResponseSchema.parse((await adminRaised.get('/admin/payroll/preview?period=2026-11').expect(200)).body);
    const lines = after.tutors.find((tutor) => tutor.tutor_id === TUTOR_IDS.tutorB)?.sessions.map((line) => line.rate_amount);
    expect(lines).toEqual(['50000', '65000']);
    expect(after.total_estimated_amount).toBe('165000');
  });

  it('total dapat ditelusuri: Σ nilai sesi yang dihitung = estimasi; sesi lain tampil tanpa nominal', async () => {
    const body = payrollPreviewResponseSchema.parse((await admin.get('/admin/payroll/preview?period=2026-10').expect(200)).body);
    for (const tutor of body.tutors) {
      const counted = tutor.sessions.filter((line) => line.counted);
      expect(counted.every((line) => line.status === 'approved' && line.amount !== null)).toBe(true);
      expect(tutor.sessions.filter((line) => !line.counted).every((line) => line.amount === null)).toBe(true);
      expect(counted.reduce((sum, line) => sum + Number(line.amount), 0)).toBe(Number(tutor.estimated_amount));
      expect(tutor.sessions.length).toBe(
        tutor.approved_sessions + tutor.pending_sessions + tutor.revision_requested_sessions + tutor.rejected_sessions,
      );
      const dates = tutor.sessions.map((line) => line.lesson_date);
      expect(dates).toEqual([...dates].sort());
    }
    const farhan = body.tutors.find((tutor) => tutor.tutor_id === TUTOR_IDS.tutorA);
    expect(farhan?.sessions.find((line) => line.session_id === SESSION_IDS.s02)).toMatchObject({
      status: 'pending',
      counted: false,
      rate_amount: null,
      amount: null,
    });
  });
});

describe('Rekap bulanan', () => {
  it('group_by=tutor: jumlah per status & durasi approved', async () => {
    const body = recapResponseSchema.parse((await admin.get('/admin/recap?period=2026-10&group_by=tutor').expect(200)).body);
    const tutorB = body.groups.find((group) => group.key_id === TUTOR_IDS.tutorB);
    expect(tutorB).toMatchObject({
      key_label: 'Noreen',
      total_sessions: 4,
      approved_sessions: 1,
      pending_sessions: 1,
      revision_requested_sessions: 1,
      rejected_sessions: 1,
      approved_duration_minutes: 60,
    });
    expect(body.groups.reduce((sum, group) => sum + group.total_sessions, 0)).toBe(9);
    // Total periode dari backend = jumlah semua grup.
    expect(body.totals).toEqual({
      total_sessions: 9,
      approved_sessions: 4,
      pending_sessions: 3,
      revision_requested_sessions: 1,
      rejected_sessions: 1,
      approved_duration_minutes: 300,
    });
  });

  it('group_by=subject dan default group_by=tutor', async () => {
    const subject = recapResponseSchema.parse((await admin.get('/admin/recap?period=2026-10&group_by=subject').expect(200)).body);
    expect(subject.groups.map((group) => group.key_label)).toEqual(['Bahasa Inggris', 'IPA', 'Matematika']);
    const fallback = recapResponseSchema.parse((await admin.get('/admin/recap?period=2026-10').expect(200)).body);
    expect(fallback.group_by).toBe('tutor');
  });
});

describe('Ringkasan dashboard', () => {
  it('Admin: status, finding pending review, honor tarif tunggal', async () => {
    const body = adminDashboardSummarySchema.parse((await admin.get('/admin/dashboard/summary?period=2026-10').expect(200)).body);
    expect(body).toMatchObject({
      active_tutors: 6,
      active_students: 12,
      total_sessions: 9,
      status_counts: { pending: 3, approved: 4, revision_requested: 1, rejected: 1 },
      anomaly_findings_pending_review: 2,
      honor: { estimated_amount: '200000' },
    });
  });

  it('Tutor: hanya data miliknya', async () => {
    const tutorA = await as.tutorA(t.app);
    const body = tutorDashboardSummarySchema.parse((await tutorA.get('/tutor/dashboard/summary?period=2026-10').expect(200)).body);
    expect(body.status_counts).toEqual({ pending: 2, approved: 3, revision_requested: 0, rejected: 0 });
    expect(body.honor.estimated_amount).toBe('150000');
  });

  it('Orang Tua: hanya approved anak terhubung, tanpa honor', async () => {
    const parent = await as.parentA(t.app);
    const res = await parent.get(`/parent/dashboard/summary?student_id=${STUDENT_IDS.murid1}&period=2026-10`).expect(200);
    expect(parentDashboardSummarySchema.parse(res.body)).toEqual({
      period: '2026-10',
      student_id: STUDENT_IDS.murid1,
      approved_sessions: 2,
      approved_duration_minutes: 180,
      subjects: ['Matematika'],
    });
    expect(JSON.stringify(res.body)).not.toMatch(/amount|honor|rate/);
  });
});
