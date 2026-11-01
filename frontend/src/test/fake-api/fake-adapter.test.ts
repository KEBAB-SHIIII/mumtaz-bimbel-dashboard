import { describe, expect, it } from 'vitest';
import { STUDENT_IDS, TEST_ONLY_CREDENTIALS } from '@mumtaz/contracts/fixtures';
import { useFakeBackend } from '../render';
import { toApiError } from '../../lib/api-error';
import * as admin from '../../features/admin/api';
import { fetchSession, login, logout, parentAccess } from '../../features/auth/api';
import * as parent from '../../features/parent/api';
import * as tutor from '../../features/tutor/api';

/**
 * Fake API adapter wajib berbentuk sama dengan kontrak: setiap feature API
 * function mem-parse respons dengan schema `@mumtaz/contracts` (melempar bila tidak sesuai).
 */
describe('fake API adapter mengikuti kontrak (data sintetis)', () => {
  it('Admin: semua endpoint baca lolos schema kontrak', async () => {
    useFakeBackend();
    expect(await fetchSession()).toBeNull();
    await login({ username: 'admin.demo', password: TEST_ONLY_CREDENTIALS.adminPassword });

    const dashboard = await admin.fetchAdminDashboard('2026-10');
    expect(dashboard.total_sessions).toBe(9);
    const list = await admin.fetchAdminAttendance({ period: '2026-10', page: 1, page_size: 20 });
    expect(list.total).toBe(9);
    const first = list.items[0];
    if (!first) throw new Error('list kosong');
    await admin.fetchAdminAttendanceDetail(first.id);
    const payroll = await admin.fetchPayrollPreview('2026-10');
    expect(payroll.totals).toEqual({ gross_amount: '200000', admin_fee_amount: '40000', net_amount: '160000' });
    // Total dapat ditelusuri ke rincian sesi.
    const counted = payroll.tutors.flatMap((t) => t.sessions).filter((line) => line.counted);
    expect(counted.reduce((sum, line) => sum + Number(line.net_amount), 0)).toBe(160000);
    const billing = await admin.fetchBilling('2026-10');
    expect(billing).toMatchObject({ total_sessions: 4, total_amount: '200000' });
    for (const entity of ['tutors', 'students', 'parents', 'subjects'] as const) {
      await admin.fetchMasterData(entity, { page: 1, page_size: 20 });
    }
    const exported = await admin.exportAttendanceToSheets({ period: '2026-10', confirm_empty_replace: false });
    expect(exported).toMatchObject({ sheet_title: 'Absensi 2026-10', records_exported: 9, status: 'succeeded' });
    expect((await admin.fetchExportHistory({ page_size: 10 })).items).toHaveLength(1);
  });

  it('Tutor: endpoint milik sendiri lolos schema; submit idempoten', async () => {
    useFakeBackend();
    await login({ username: 'farhan', password: TEST_ONLY_CREDENTIALS.tutorPassword });
    await tutor.fetchTutorDashboard('2026-10');
    const options = await tutor.fetchAttendanceOptions();
    expect(options.students).toHaveLength(12);
    expect(options.subjects).toHaveLength(4);
    const history = await tutor.fetchTutorAttendance({ period: '2026-10', page: 1, page_size: 20 });
    expect(history.items.every((item) => item.tutor_name === 'Farhan')).toBe(true);
    await tutor.fetchTutorPayroll('2026-10');

    const body = {
      client_submission_id: '00000000-0000-4000-9000-000000000500',
      student_id: options.students[0]?.id ?? '',
      subject_ids: [options.subjects[0]?.id ?? ''],
      lesson_date: '2026-10-20',
      start_time: '16:00',
      end_time: '17:30',
      learning_material: 'Materi demo',
    };
    const created = await tutor.submitAttendance(body);
    expect(created.status).toBe('pending');
    expect((await tutor.submitAttendance(body)).id).toBe(created.id);
  });

  it('Orang Tua: hanya anak terhubung; anak lain → 403', async () => {
    useFakeBackend();
    await parentAccess({ access_code: 'MUMTAZ-DEMO-PARENT-ACCESS-ONLY' });
    const students = await parent.fetchParentStudents();
    expect(students.map((s) => s.id)).toEqual([STUDENT_IDS.murid1]);
    await parent.fetchParentDashboard(STUDENT_IDS.murid1, '2026-10');
    const progress = await parent.fetchParentProgress(STUDENT_IDS.murid1, '2026-10');
    expect(progress.sessions.length).toBeGreaterThan(0);

    const denied = await parent.fetchParentProgress(STUDENT_IDS.murid3, '2026-10').catch((e: unknown) => e);
    expect(toApiError(denied)).toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it('meniru role guard dan CSRF backend', async () => {
    useFakeBackend();
    await login({ username: 'farhan', password: TEST_ONLY_CREDENTIALS.tutorPassword });
    const forbidden = await admin.fetchAdminDashboard('2026-10').catch((e: unknown) => e);
    expect(toApiError(forbidden).status).toBe(403);

    await logout();
    const unauthenticated = await tutor.fetchTutorDashboard('2026-10').catch((e: unknown) => e);
    expect(toApiError(unauthenticated).status).toBe(401);
  });
});
