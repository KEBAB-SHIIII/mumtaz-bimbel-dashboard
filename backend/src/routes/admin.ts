import { Router } from 'express';
import {
  adminAttendanceListQuerySchema,
  adminCreateAttendanceRequestSchema,
  adminUpdateAttendanceRequestSchema,
  createParentRequestSchema,
  createStudentRequestSchema,
  createSubjectRequestSchema,
  createTutorRequestSchema,
  idParamSchema,
  masterDataListQuerySchema,
  periodQuerySchema,
  billingQuerySchema,
  invoiceQuerySchema,
  setValidityRequestSchema,
  sheetExportHistoryQuerySchema,
  sheetExportRequestSchema,
  updateParentRequestSchema,
  updateStudentRequestSchema,
  updateSubjectRequestSchema,
  updateTutorRequestSchema,
} from '@mumtaz/contracts';
import { authOf, requireRole } from '../auth/middleware.js';
import { parseInput } from '../lib/validation.js';
import {
  adminCreateAttendance,
  adminUpdateAttendance,
  deleteAttendance,
  getAdminAttendanceDetail,
  listAdminAttendance,
  listAdminAttendanceOptions,
  setAttendanceValidity,
} from '../services/attendance/attendance-service.js';
import type { AnomalyQueue } from '../services/anomaly/anomaly-worker.js';
import type { ServiceContext } from '../services/context.js';
import { getAdminDashboardSummary } from '../services/dashboard-service.js';
import * as parents from '../services/master-data/parents.js';
import * as students from '../services/master-data/students.js';
import * as subjects from '../services/master-data/subjects.js';
import * as tutors from '../services/master-data/tutors.js';
import { getPayrollPreview } from '../services/payroll-service.js';
import { getBilling, getStudentBilling } from '../services/billing/billing-service.js';
import { invoiceFileName, renderInvoicePdf } from '../services/billing/invoice-pdf.js';
import { exportAttendanceToSheets, listExportHistory, type ExportDeps } from '../services/exports/attendance-export-service.js';

const idOf = (params: unknown) => parseInput(idParamSchema, params).id;

/** Semua route `/admin/*` — role Admin saja (role guard di level router). */
export function adminRouter(ctx: ServiceContext, exportDeps: ExportDeps, anomalyQueue: AnomalyQueue) {
  const router = Router();
  router.use('/admin', requireRole('admin'));

  // --- Dashboard, penagihan, honor --------------------------------------------
  router.get('/admin/dashboard/summary', async (req, res) => {
    const { period } = parseInput(periodQuerySchema, req.query);
    res.json(await getAdminDashboardSummary(ctx, period));
  });

  /** Penagihan Orang Tua: sesi yang dihitung per murid + total tagihan (menggantikan Rekap). */
  router.get('/admin/billing', async (req, res) => {
    res.json(await getBilling(ctx, parseInput(billingQuerySchema, req.query)));
  });

  /** Invoice PDF satu murid untuk satu periode. */
  router.get('/admin/billing/:id/invoice.pdf', async (req, res) => {
    const { period } = parseInput(invoiceQuerySchema, req.query);
    const student = await getStudentBilling(ctx, idOf(req.params), period);
    const pdf = await renderInvoicePdf({ period, student, now: ctx.now() });
    res
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${invoiceFileName(period, student.student_name)}"`,
        'Cache-Control': 'no-store',
      })
      .send(pdf);
  });

  router.get('/admin/payroll/preview', async (req, res) => {
    const { period } = parseInput(periodQuerySchema, req.query);
    res.json(await getPayrollPreview(ctx, period));
  });

  // --- Ekspor Google Sheets (on-demand Admin; tidak pernah dari submit Tutor) ---
  router.post('/admin/reports/google-sheets/attendance', async (req, res) => {
    const input = parseInput(sheetExportRequestSchema, req.body);
    res.json(await exportAttendanceToSheets(ctx, exportDeps, authOf(req).userId, input));
  });

  router.get('/admin/reports/google-sheets/attendance/history', async (req, res) => {
    res.json(await listExportHistory(ctx, parseInput(sheetExportHistoryQuerySchema, req.query)));
  });

  // --- Absensi -------------------------------------------------------------
  router.get('/admin/attendance', async (req, res) => {
    res.json(await listAdminAttendance(ctx, parseInput(adminAttendanceListQuerySchema, req.query)));
  });

  router.get('/admin/attendance/:id', async (req, res) => {
    res.json(await getAdminAttendanceDetail(ctx, idOf(req.params)));
  });

  router.get('/admin/attendance-options', async (_req, res) => {
    res.json(await listAdminAttendanceOptions(ctx));
  });

  /** CRUD penuh Admin (revisi PM): koreksi bila AI salah label atau data keliru. */
  router.post('/admin/attendance', async (req, res) => {
    const session = await adminCreateAttendance(ctx, parseInput(adminCreateAttendanceRequestSchema, req.body));
    // Sesi catatan Admin divalidasi AI seperti submit Tutor.
    anomalyQueue.enqueue(session.id);
    res.status(201).json(session);
  });

  router.put('/admin/attendance/:id', async (req, res) => {
    const input = parseInput(adminUpdateAttendanceRequestSchema, req.body);
    res.json(await adminUpdateAttendance(ctx, idOf(req.params), input));
  });

  router.delete('/admin/attendance/:id', async (req, res) => {
    await deleteAttendance(ctx, idOf(req.params));
    res.status(204).end();
  });

  /** Koreksi label validitas AI / pilih status approval sesi Perlu revisi. */
  router.patch('/admin/attendance/:id/validity', async (req, res) => {
    const input = parseInput(setValidityRequestSchema, req.body);
    res.json(await setAttendanceValidity(ctx, authOf(req).userId, idOf(req.params), input));
  });

  // --- Master Data: tanpa DELETE; gunakan soft deactivation (`is_active`) ----
  router.get('/admin/tutors', async (req, res) => {
    res.json(await tutors.listTutors(ctx, parseInput(masterDataListQuerySchema, req.query)));
  });
  router.post('/admin/tutors', async (req, res) => {
    const issued = await tutors.createTutor(ctx, parseInput(createTutorRequestSchema, req.body));
    // Password sementara hanya ada di respons ini; jangan di-cache.
    res.status(201).set('Cache-Control', 'no-store').json(issued);
  });
  router.get('/admin/tutors/:id', async (req, res) => {
    res.json(await tutors.getTutor(ctx, idOf(req.params)));
  });
  router.post('/admin/tutors/:id/reset-password', async (req, res) => {
    const issued = await tutors.resetTutorPassword(ctx, idOf(req.params));
    res.set('Cache-Control', 'no-store').json(issued);
  });
  router.patch('/admin/tutors/:id', async (req, res) => {
    res.json(await tutors.updateTutor(ctx, idOf(req.params), parseInput(updateTutorRequestSchema, req.body)));
  });

  router.get('/admin/students', async (req, res) => {
    res.json(await students.listStudents(ctx, parseInput(masterDataListQuerySchema, req.query)));
  });
  router.post('/admin/students', async (req, res) => {
    res.status(201).json(await students.createStudent(ctx, parseInput(createStudentRequestSchema, req.body)));
  });
  router.get('/admin/students/:id', async (req, res) => {
    res.json(await students.getStudent(ctx, idOf(req.params)));
  });
  router.patch('/admin/students/:id', async (req, res) => {
    res.json(await students.updateStudent(ctx, idOf(req.params), parseInput(updateStudentRequestSchema, req.body)));
  });

  router.get('/admin/parents', async (req, res) => {
    res.json(await parents.listParents(ctx, parseInput(masterDataListQuerySchema, req.query)));
  });
  router.post('/admin/parents', async (req, res) => {
    const issued = await parents.createParent(ctx, parseInput(createParentRequestSchema, req.body));
    // Kode mentah hanya ada di respons ini; jangan di-cache.
    res.status(201).set('Cache-Control', 'no-store').json(issued);
  });
  router.get('/admin/parents/:id', async (req, res) => {
    res.json(await parents.getParent(ctx, idOf(req.params)));
  });
  router.patch('/admin/parents/:id', async (req, res) => {
    res.json(await parents.updateParent(ctx, idOf(req.params), parseInput(updateParentRequestSchema, req.body)));
  });
  router.post('/admin/parents/:id/rotate-access-code', async (req, res) => {
    const issued = await parents.rotateParentAccessCode(ctx, idOf(req.params));
    res.set('Cache-Control', 'no-store').json(issued);
  });

  router.get('/admin/subjects', async (req, res) => {
    res.json(await subjects.listSubjects(ctx, parseInput(masterDataListQuerySchema, req.query)));
  });
  router.post('/admin/subjects', async (req, res) => {
    res.status(201).json(await subjects.createSubject(ctx, parseInput(createSubjectRequestSchema, req.body)));
  });
  router.get('/admin/subjects/:id', async (req, res) => {
    res.json(await subjects.getSubject(ctx, idOf(req.params)));
  });
  router.patch('/admin/subjects/:id', async (req, res) => {
    res.json(await subjects.updateSubject(ctx, idOf(req.params), parseInput(updateSubjectRequestSchema, req.body)));
  });

  return router;
}
