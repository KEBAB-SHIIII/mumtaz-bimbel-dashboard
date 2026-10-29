import { describe, expect, it } from 'vitest';
import { STUDENT_IDS, TEST_ONLY_CREDENTIALS } from '@mumtaz/contracts/fixtures';
import { useDemoBackend } from '../../test/render';
import { toApiError } from '../../lib/api-error';
import * as admin from '../admin/api';
import { fetchSession, login, logout, parentAccess } from '../auth/api';
import * as parent from '../parent/api';
import * as tutor from '../tutor/api';

/**
 * Fake API adapter wajib berbentuk sama dengan kontrak: setiap feature API
 * function mem-parse respons dengan schema `@mumtaz/contracts` (melempar bila tidak sesuai).
 */
describe('fake API adapter mengikuti kontrak (data sintetis)', () => {
  it('Admin: semua endpoint baca lolos schema kontrak', async () => {
    useDemoBackend();
    expect(await fetchSession()).toBeNull();
    await login({ username: 'admin.demo', password: TEST_ONLY_CREDENTIALS.adminPassword });

    const dashboard = await admin.fetchAdminDashboard('2026-10');
    expect(dashboard.total_sessions).toBe(9);
    const list = await admin.fetchAdminAttendance({ period: '2026-10', page: 1, page_size: 20 });
    expect(list.total).toBe(9);
    const first = list.items[0];
    if (!first) throw new Error('list kosong');
    await admin.fetchAdminAttendanceDetail(first.id);
    await admin.fetchRecap('2026-10', 'tutor');
    const payroll = await admin.fetchPayrollPreview('2026-10');
    expect(payroll.total_estimated_amount).toBe('200000');
    expect(payroll.demo_label).toBe('Simulasi — bukan tarif resmi UMKM');
    for (const entity of ['tutors', 'students', 'parents', 'subjects', 'tutor-assignments', 'tutor-rates'] as const) {
      await admin.fetchMasterData(entity, { page: 1, page_size: 20 });
    }
  });

  it('Tutor: endpoint milik sendiri lolos schema; submit idempoten', async () => {
    useDemoBackend();
    await login({ username: 'tutor-a.demo', password: TEST_ONLY_CREDENTIALS.tutorPassword });
    await tutor.fetchTutorDashboard('2026-10');
    const assignments = await tutor.fetchTutorAssignments();
    expect(assignments).toHaveLength(2);
    const history = await tutor.fetchTutorAttendance({ period: '2026-10', page: 1, page_size: 20 });
    expect(history.items.every((item) => item.tutor_name === 'Tutor Demo A')).toBe(true);
    await tutor.fetchTutorPayroll('2026-10');

    const body = {
      client_submission_id: '00000000-0000-4000-9000-000000000500',
      assignment_id: assignments[0]?.assignment_id ?? '',
      lesson_date: '2026-10-20',
      duration_minutes: 90,
      learning_material: 'Materi demo',
    };
    const created = await tutor.submitAttendance(body);
    expect(created.status).toBe('pending');
    expect((await tutor.submitAttendance(body)).id).toBe(created.id);
  });

  it('Orang Tua: hanya anak terhubung; anak lain → 403', async () => {
    useDemoBackend();
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
    useDemoBackend();
    await login({ username: 'tutor-a.demo', password: TEST_ONLY_CREDENTIALS.tutorPassword });
    const forbidden = await admin.fetchAdminDashboard('2026-10').catch((e: unknown) => e);
    expect(toApiError(forbidden).status).toBe(403);

    await logout();
    const unauthenticated = await tutor.fetchTutorDashboard('2026-10').catch((e: unknown) => e);
    expect(toApiError(unauthenticated).status).toBe(401);
  });
});
