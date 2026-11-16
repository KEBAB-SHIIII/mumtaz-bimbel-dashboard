import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminDashboardSummarySchema,
  parentDashboardSummarySchema,
  payrollPreviewResponseSchema,
  tutorPayrollResponseSchema,
  billingResponseSchema,
  tutorDashboardSummarySchema,
} from '@mumtaz/contracts';
import { EXPECTED_PAYROLL_2026_10, STUDENT_IDS, SUBJECT_IDS, TUTOR_IDS, SESSION_IDS } from '@mumtaz/contracts/fixtures';
import { invoiceFileName, invoiceNumber } from '../src/services/billing/invoice-pdf.js';
import { as, createTestApp, type TestApp, type TestClient } from './helpers/test-app.js';

let t: TestApp;
let admin: TestClient;

beforeAll(async () => {
  t = await createTestApp();
  admin = await as.admin(t.app);
});
afterAll(() => t.close());

describe('Payroll preview (estimasi honor)', () => {
  it('Oktober 2026 sesuai fixture tarif owner: kotor, potongan berdasarkan durasi, bersih tutor', async () => {
    const res = await admin.get('/admin/payroll/preview?period=2026-10').expect(200);
    const body = payrollPreviewResponseSchema.parse(res.body);

    expect(body.totals).toEqual(EXPECTED_PAYROLL_2026_10.totals);
    expect(body.warnings).toEqual([]);

    for (const expected of EXPECTED_PAYROLL_2026_10.tutors) {
      const actual = body.tutors.find((tutor) => tutor.tutor_id === expected.tutor_id);
      expect(actual).toMatchObject({
        counted_sessions: expected.counted_sessions,
        not_counted_sessions: expected.not_counted_sessions,
        gross_amount: expected.gross_amount,
        admin_fee_amount: expected.admin_fee_amount,
        net_amount: expected.net_amount,
      });
      // Traceable ke sesi: tarif per sesi = kotor; bersih = kotor − potongan.
      const counted = actual?.sessions.filter((line) => line.counted) ?? [];
      expect(counted.map((line) => line.session_id).sort()).toEqual([...expected.approved_session_ids].sort());
      expect(counted.map((line) => [line.gross_amount, line.admin_fee, line.net_amount])).toEqual(
        expected.tutor_id === TUTOR_IDS.tutorA
          ? [['90000', '20000', '70000'], ['80000', '10000', '70000'], ['90000', '20000', '70000']]
          : [['80000', '10000', '70000']],
      );
    }
  });

  it('periode memakai lesson_date: s05 (31 Okt, disubmit Nov) masuk Oktober, s06 masuk November', async () => {
    const nov = payrollPreviewResponseSchema.parse((await admin.get('/admin/payroll/preview?period=2026-11').expect(200)).body);
    expect(nov.totals.gross_amount).toBe('90000');
    expect(nov.tutors[0]?.sessions.filter((line) => line.counted).map((line) => line.session_id)).toEqual([SESSION_IDS.s06]);
  });

  it('periode tanpa sesi → nol', async () => {
    const body = payrollPreviewResponseSchema.parse((await admin.get('/admin/payroll/preview?period=2027-01').expect(200)).body);
    expect(body).toMatchObject({ tutors: [], totals: { gross_amount: '0', admin_fee_amount: '0', net_amount: '0' } });
  });

  it('Honor Saya: tutor hanya melihat miliknya dan HANYA pendapatan bersih (tanpa tarif kotor/potongan)', async () => {
    const tutorB = await as.tutorB(t.app);
    const res = await tutorB.get('/tutor/me/payroll?period=2026-10').expect(200);
    const body = tutorPayrollResponseSchema.parse(res.body);
    expect(body).toMatchObject({ counted_sessions: 1, not_counted_sessions: 3, net_amount: '70000' });
    expect(body.sessions.find((line) => line.counted)?.net_amount).toBe('70000');
    expect(JSON.stringify(res.body)).not.toMatch(/gross|admin_fee|80000|tutor_name/);
    const summary = tutorDashboardSummarySchema.parse((await tutorB.get('/tutor/dashboard/summary?period=2026-10').expect(200)).body);
    expect(summary.honor.estimated_amount).toBe('70000');
    expect((await tutorB.get('/admin/payroll/preview?period=2026-10')).status).toBe(403);
  });

  it('periode tidak valid → 422', async () => {
    expect((await admin.get('/admin/payroll/preview?period=2026-13')).status).toBe(422);
    expect((await admin.get('/admin/payroll/preview')).status).toBe(422);
  });

  it('sesi Valid mengunci tarif per jenjang; mengubah kelas murid kemudian tidak mengubah sesi lama', async () => {
    const tutorB = await as.tutorB(t.app);
    const submitAt = async (n: number, lessonDate: string) => {
      const res = await tutorB
        .post('/tutor/attendance', {
          client_submission_id: `00000000-0000-4000-9000-00000000030${n}`,
          student_id: STUDENT_IDS.murid1,
          subject_ids: [SUBJECT_IDS.ipa],
          lesson_date: lessonDate,
          start_time: '16:00',
          end_time: '17:00',
          learning_material: 'Sesi tanpa penugasan (tutor memilih sendiri)',
        })
        .expect(201);
      await admin.patch(`/admin/attendance/${res.body.session.id as string}/validity`, { validity: 'valid' }).expect(200);
    };

    // Aisyah 3 SD, 60 menit → Rp60.000.
    await submitAt(0, '2026-11-10');
    const body = payrollPreviewResponseSchema.parse((await admin.get('/admin/payroll/preview?period=2026-11').expect(200)).body);
    expect(body.tutors.find((tutor) => tutor.tutor_id === TUTOR_IDS.tutorB)).toMatchObject({
      counted_sessions: 1,
      approved_sessions_without_rate: 0,
      net_amount: '50000',
    });
    expect(body.warnings).toEqual([]);

    // Naik kelas ke 4 SD: sesi lama tetap Rp60.000, sesi baru Rp80.000.
    const change = {grade:'4 SD',effective_from:'2026-11-11',reason:'Kenaikan kelas'};
    const preview = await admin.post(`/admin/students/${STUDENT_IDS.murid1}/grade-history/preview`,change).expect(200);
    await admin.post(`/admin/students/${STUDENT_IDS.murid1}/grade-history`,{...change,preview_token:preview.body.preview_token}).expect(200);
    try {
      await submitAt(1, '2026-11-11');
      const after = payrollPreviewResponseSchema.parse((await admin.get('/admin/payroll/preview?period=2026-11').expect(200)).body);
      const lines = after.tutors.find((tutor) => tutor.tutor_id === TUTOR_IDS.tutorB)?.sessions.map((line) => line.gross_amount);
      expect(lines).toEqual(['60000', '80000']);
    } finally {
      const reset={grade:'3 SD',effective_from:'2026-11-12',reason:'Reset test'};
      const review=await admin.post(`/admin/students/${STUDENT_IDS.murid1}/grade-history/preview`,reset).expect(200);
      await admin.post(`/admin/students/${STUDENT_IDS.murid1}/grade-history`,{...reset,preview_token:review.body.preview_token}).expect(200);
    }
  });

  it('total dapat ditelusuri: Σ per sesi = total tutor; sesi tidak dihitung tanpa nominal', async () => {
    const body = payrollPreviewResponseSchema.parse((await admin.get('/admin/payroll/preview?period=2026-10').expect(200)).body);
    for (const tutor of body.tutors) {
      const counted = tutor.sessions.filter((line) => line.counted);
      expect(counted.every((line) => line.status === 'approved' && line.gross_amount !== null)).toBe(true);
      expect(tutor.sessions.filter((line) => !line.counted).every((line) => line.gross_amount === null && line.net_amount === null)).toBe(true);
      const sum = (key: 'gross_amount' | 'admin_fee' | 'net_amount') => counted.reduce((total, line) => total + Number(line[key]), 0);
      expect([sum('gross_amount'), sum('admin_fee'), sum('net_amount')]).toEqual([
        Number(tutor.gross_amount),
        Number(tutor.admin_fee_amount),
        Number(tutor.net_amount),
      ]);
      expect(tutor.sessions.length).toBe(tutor.counted_sessions + tutor.not_counted_sessions);
      const dates = tutor.sessions.map((line) => line.lesson_date);
      expect(dates).toEqual([...dates].sort());
    }
    const farhan = body.tutors.find((tutor) => tutor.tutor_id === TUTOR_IDS.tutorA);
    expect(farhan?.sessions.find((line) => line.session_id === SESSION_IDS.s02)).toMatchObject({
      status: 'pending',
      validity: null,
      counted: false,
      gross_amount: null,
      net_amount: null,
    });
  });
});

describe('Penagihan Orang Tua', () => {
  it('per murid: hanya sesi yang dihitung, tarif per sesi (snapshot), subtotal & total tagihan', async () => {
    const body = billingResponseSchema.parse((await admin.get('/admin/billing?period=2026-10').expect(200)).body);
    expect(body.students.map((student) => [student.student_name, student.sessions, student.total_amount])).toEqual([
      ['Aisyah', 2, '180000'],
      ['Bima', 1, '80000'],
      ['Citra', 1, '80000'],
    ]);
    expect(body).toMatchObject({ total_sessions: 4, total_amount: '340000', warnings: [] });
    const aisyah = body.students[0];
    expect(aisyah).toMatchObject({ grade: '3 SD', school_name: 'SD Harapan Bangsa', parent_names: ['Sari'] });
    expect(aisyah?.lines.map((line) => [line.lesson_date, line.amount])).toEqual([
      ['2026-10-01', '90000'],
      ['2026-10-31', '90000'],
    ]);
    // Total tagihan = omzet kotor di dashboard.
    const dashboard = adminDashboardSummarySchema.parse((await admin.get('/admin/dashboard/summary?period=2026-10').expect(200)).body);
    expect(dashboard.gross_revenue).toBe(body.total_amount);
  });

  it('filter satu murid; murid tanpa sesi dihitung → daftar kosong', async () => {
    const one = billingResponseSchema.parse((await admin.get(`/admin/billing?period=2026-10&student_id=${STUDENT_IDS.murid2}`).expect(200)).body);
    expect(one.students.map((student) => student.student_name)).toEqual(['Bima']);
    const none = billingResponseSchema.parse((await admin.get(`/admin/billing?period=2026-10&student_id=${STUDENT_IDS.lutfi}`).expect(200)).body);
    expect(none).toMatchObject({ students: [], total_sessions: 0, total_amount: '0' });
  });

  it('invoice PDF satu murid: application/pdf, nama file, tanpa cache; murid tanpa tagihan → 404', async () => {
    const res = await admin.get(`/admin/billing/${STUDENT_IDS.murid1}/invoice.pdf?period=2026-10`).buffer(true).parse((response, callback) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => callback(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="Tagihan Aisyah - Oktober 2026.pdf"');
    expect(res.headers['cache-control']).toBe('no-store');
    const pdf = res.body as Buffer;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1500);

    expect((await admin.get(`/admin/billing/${STUDENT_IDS.lutfi}/invoice.pdf?period=2026-10`)).status).toBe(404);
    expect((await admin.get(`/admin/billing/${STUDENT_IDS.murid1}/invoice.pdf`)).status).toBe(422);
  });

  it('nomor invoice & nama file deterministik', () => {
    expect(invoiceNumber('2026-10', '00000000-0000-4000-8003-00000000ab12')).toBe('INV-202610-00AB12');
    expect(invoiceFileName('2026-10', 'Siti Nur Aisyah')).toBe('Tagihan Siti Nur Aisyah - Oktober 2026.pdf');
  });
});

describe('Ringkasan dashboard', () => {
  it('Admin: empat metrik — tutor aktif, siswa bersesi, total sesi, omzet kotor per jenjang', async () => {
    const body = adminDashboardSummarySchema.parse((await admin.get('/admin/dashboard/summary?period=2026-10').expect(200)).body);
    // Omzet = Σ tarif terkunci (snapshot) sesi approved: 2 × Rp90.000 (SD 1–3, 90 menit) + 2 × Rp80.000 (SD 4–6, 60 menit).
    expect(body).toMatchObject({
      period: '2026-10',
      active_tutors: 6,
      students_with_sessions: 3,
      total_sessions: 9,
      gross_revenue: '340000',
    });
    // Grafik pendapatan: 6 bulan s.d. Oktober dari snapshot sesi yang dihitung.
    expect(body.revenue_by_month.map((month) => month.period)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(body.revenue_by_month.at(-1)).toEqual({ period: '2026-10', gross_revenue: '340000', tutor_salary: '280000', net_revenue: '60000' });
    expect(body.revenue_by_month[0]).toEqual({ period: '2026-05', gross_revenue: '0', tutor_salary: '0', net_revenue: '0' });
  });

  it('Tutor: hanya data miliknya', async () => {
    const tutorA = await as.tutorA(t.app);
    const body = tutorDashboardSummarySchema.parse((await tutorA.get('/tutor/dashboard/summary?period=2026-10').expect(200)).body);
    expect(body.status_counts).toEqual({ pending: 2, approved: 3, revision_requested: 0, rejected: 0 });
    // Bersih Farhan: 2 × (Rp90.000 − Rp20.000) + (Rp80.000 − Rp10.000).
    expect(body.honor.estimated_amount).toBe('210000');
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
