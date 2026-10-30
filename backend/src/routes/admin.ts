import { Router } from 'express';
import {
  adminAttendanceListQuerySchema,
  anomalyReviewRequestSchema,
  assignmentListQuerySchema,
  createParentRequestSchema,
  createStudentRequestSchema,
  createSubjectRequestSchema,
  createTutorAssignmentRequestSchema,
  createTutorRateRequestSchema,
  createTutorRequestSchema,
  idParamSchema,
  masterDataListQuerySchema,
  periodQuerySchema,
  rateListQuerySchema,
  recapQuerySchema,
  sessionDecisionRequestSchema,
  updateParentRequestSchema,
  updateStudentRequestSchema,
  updateSubjectRequestSchema,
  updateTutorAssignmentRequestSchema,
  updateTutorRateRequestSchema,
  updateTutorRequestSchema,
} from '@mumtaz/contracts';
import { authOf, requireRole } from '../auth/middleware.js';
import { parseInput } from '../lib/validation.js';
import {
  decideAttendance,
  getAdminAttendanceDetail,
  listAdminAttendance,
} from '../services/attendance/attendance-service.js';
import { reviewFinding } from '../services/anomaly/anomaly-review.js';
import type { ServiceContext } from '../services/context.js';
import { getAdminDashboardSummary } from '../services/dashboard-service.js';
import * as assignments from '../services/master-data/assignments.js';
import * as parents from '../services/master-data/parents.js';
import * as rates from '../services/master-data/rates.js';
import * as students from '../services/master-data/students.js';
import * as subjects from '../services/master-data/subjects.js';
import * as tutors from '../services/master-data/tutors.js';
import { getPayrollPreview } from '../services/payroll-service.js';
import { getRecap } from '../services/recap-service.js';

const idOf = (params: unknown) => parseInput(idParamSchema, params).id;

/** Semua route `/admin/*` — role Admin saja (role guard di level router). */
export function adminRouter(ctx: ServiceContext) {
  const router = Router();
  router.use('/admin', requireRole('admin'));

  // --- Dashboard, rekap, honor --------------------------------------------
  router.get('/admin/dashboard/summary', async (req, res) => {
    const { period } = parseInput(periodQuerySchema, req.query);
    res.json(await getAdminDashboardSummary(ctx, period));
  });

  router.get('/admin/recap', async (req, res) => {
    res.json(await getRecap(ctx, parseInput(recapQuerySchema, req.query)));
  });

  router.get('/admin/payroll/preview', async (req, res) => {
    const { period } = parseInput(periodQuerySchema, req.query);
    res.json(await getPayrollPreview(ctx, period));
  });

  // --- Absensi -------------------------------------------------------------
  router.get('/admin/attendance', async (req, res) => {
    res.json(await listAdminAttendance(ctx, parseInput(adminAttendanceListQuerySchema, req.query)));
  });

  router.get('/admin/attendance/:id', async (req, res) => {
    res.json(await getAdminAttendanceDetail(ctx, idOf(req.params)));
  });

  router.patch('/admin/attendance/:id/decision', async (req, res) => {
    const input = parseInput(sessionDecisionRequestSchema, req.body);
    res.json(await decideAttendance(ctx, authOf(req).userId, idOf(req.params), input));
  });

  /** Review temuan anomali — terpisah dari keputusan sesi; status sesi tidak berubah. */
  router.patch('/admin/anomalies/:id/review', async (req, res) => {
    const input = parseInput(anomalyReviewRequestSchema, req.body);
    res.json(await reviewFinding(ctx, authOf(req).userId, idOf(req.params), input));
  });

  // --- Master Data: tanpa DELETE; gunakan soft deactivation (`is_active`) ----
  router.get('/admin/tutors', async (req, res) => {
    res.json(await tutors.listTutors(ctx, parseInput(masterDataListQuerySchema, req.query)));
  });
  router.post('/admin/tutors', async (req, res) => {
    res.status(201).json(await tutors.createTutor(ctx, parseInput(createTutorRequestSchema, req.body)));
  });
  router.get('/admin/tutors/:id', async (req, res) => {
    res.json(await tutors.getTutor(ctx, idOf(req.params)));
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

  router.get('/admin/tutor-assignments', async (req, res) => {
    res.json(await assignments.listAssignments(ctx, parseInput(assignmentListQuerySchema, req.query)));
  });
  router.post('/admin/tutor-assignments', async (req, res) => {
    const input = parseInput(createTutorAssignmentRequestSchema, req.body);
    res.status(201).json(await assignments.createAssignment(ctx, input));
  });
  router.get('/admin/tutor-assignments/:id', async (req, res) => {
    res.json(await assignments.getAssignment(ctx, idOf(req.params)));
  });
  router.patch('/admin/tutor-assignments/:id', async (req, res) => {
    const input = parseInput(updateTutorAssignmentRequestSchema, req.body);
    res.json(await assignments.updateAssignment(ctx, idOf(req.params), input));
  });

  router.get('/admin/tutor-rates', async (req, res) => {
    res.json(await rates.listRates(ctx, parseInput(rateListQuerySchema, req.query)));
  });
  router.post('/admin/tutor-rates', async (req, res) => {
    res.status(201).json(await rates.createRate(ctx, parseInput(createTutorRateRequestSchema, req.body)));
  });
  router.get('/admin/tutor-rates/:id', async (req, res) => {
    res.json(await rates.getRate(ctx, idOf(req.params)));
  });
  router.patch('/admin/tutor-rates/:id', async (req, res) => {
    res.json(await rates.updateRate(ctx, idOf(req.params), parseInput(updateTutorRateRequestSchema, req.body)));
  });

  return router;
}
