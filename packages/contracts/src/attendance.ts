import { z } from 'zod';
import {
  isoDateSchema,
  optionalText,
  paginationQuerySchema,
  requiredText,
  timestampSchema,
  uuidSchema,
} from './common.js';
import { anomalyFindingSchema } from './anomaly.js';
import {
  anomalyAnalysisStatusSchema,
  anomalyReviewStatusSchema,
  findingTypeSchema,
  sessionDecisionSchema,
  sessionStatusSchema,
} from './enums.js';
import { periodSchema } from './period.js';

/**
 * Batas atas TEKNIS durasi (24 jam) untuk mencegah nilai absurd/overflow.
 * Ini bukan batas bisnis; batas hard-rejection UMKM masih terbuka (O-12).
 */
export const DURATION_MINUTES_TECHNICAL_MAX = 24 * 60;

// Guard panjang teknis; `learning_material` adalah VARCHAR di ERD.
const MATERIAL_MAX = 255;
const NOTES_MAX = 5000;

const durationMinutesSchema = z
  .number('Durasi harus berupa angka menit')
  .int('Durasi harus bilangan bulat menit')
  .positive('Durasi harus lebih dari 0')
  .max(DURATION_MINUTES_TECHNICAL_MAX);

/**
 * Field editable sesi oleh Tutor. Validasi bentuk saja; aturan domain
 * (assignment milik tutor & aktif, tanggal tidak di masa depan menurut
 * Asia/Jakarta — O-14) diperiksa backend.
 */
const editableSessionFields = {
  assignment_id: uuidSchema,
  lesson_date: isoDateSchema,
  duration_minutes: durationMinutesSchema,
  /** Working default O-09: wajib. */
  learning_material: requiredText(MATERIAL_MAX),
  /** O-13: opsional. */
  learning_notes: optionalText(NOTES_MAX),
  next_focus: optionalText(NOTES_MAX),
};

/** `POST /tutor/attendance`. `tutor_id`/status/tarif tidak diterima dari body. */
export const submitAttendanceRequestSchema = z.strictObject({
  client_submission_id: uuidSchema,
  ...editableSessionFields,
});
export type SubmitAttendanceRequest = z.infer<typeof submitAttendanceRequestSchema>;

/** `PATCH /tutor/me/attendance/:id` — hanya saat `revision_requested`. */
export const reviseAttendanceRequestSchema = z.strictObject(editableSessionFields);
export type ReviseAttendanceRequest = z.infer<typeof reviseAttendanceRequestSchema>;

/** `PATCH /admin/attendance/:id/decision`. Alasan wajib untuk revisi/penolakan. */
export const sessionDecisionRequestSchema = z.discriminatedUnion('decision', [
  z.strictObject({
    decision: z.literal(sessionDecisionSchema.enum.approved),
    admin_note: optionalText(NOTES_MAX),
  }),
  z.strictObject({
    decision: z.literal(sessionDecisionSchema.enum.revision_requested),
    admin_note: requiredText(NOTES_MAX),
  }),
  z.strictObject({
    decision: z.literal(sessionDecisionSchema.enum.rejected),
    admin_note: requiredText(NOTES_MAX),
  }),
]);
export type SessionDecisionRequest = z.infer<typeof sessionDecisionRequestSchema>;

/** Delapan kolom inti yang juga menjadi dasar ekspor. */
const sessionCoreFields = {
  id: uuidSchema,
  assignment_id: uuidSchema,
  tutor_id: uuidSchema,
  tutor_name: z.string(),
  student_id: uuidSchema,
  student_name: z.string(),
  grade: z.string(),
  school_name: z.string(),
  subject_id: uuidSchema,
  subject_name: z.string(),
  lesson_date: isoDateSchema,
  duration_minutes: z.number().int(),
};

/**
 * Respons submit `201`. Submit baru selalu `pending`; retry idempoten dengan
 * payload identik mengembalikan sesi yang sama beserta status terkininya.
 */
export const submitAttendanceResponseSchema = z.object({
  session: z.object({
    id: uuidSchema,
    client_submission_id: uuidSchema,
    status: sessionStatusSchema,
    anomaly_analysis_status: anomalyAnalysisStatusSchema,
    submitted_at: timestampSchema,
  }),
});
export type SubmitAttendanceResponse = z.infer<typeof submitAttendanceResponseSchema>;

/** Riwayat Mengajar Tutor. Tanpa finding anomali (default: tidak ditampilkan ke Tutor). */
export const tutorSessionSchema = z.object({
  ...sessionCoreFields,
  learning_material: z.string(),
  learning_notes: z.string().nullable(),
  next_focus: z.string().nullable(),
  status: sessionStatusSchema,
  /** Alasan Admin; relevan agar Tutor tahu apa yang perlu direvisi. */
  admin_note: z.string().nullable(),
  submitted_at: timestampSchema,
  reviewed_at: timestampSchema.nullable(),
});
export type TutorSession = z.infer<typeof tutorSessionSchema>;

export const findingSummarySchema = z.object({
  id: uuidSchema,
  finding_type: findingTypeSchema,
  review_status: anomalyReviewStatusSchema,
});

/** Item `GET /admin/attendance`. */
export const adminAttendanceListItemSchema = z.object({
  ...sessionCoreFields,
  status: sessionStatusSchema,
  anomaly_analysis_status: anomalyAnalysisStatusSchema,
  findings: z.array(findingSummarySchema),
  submitted_at: timestampSchema,
});
export type AdminAttendanceListItem = z.infer<typeof adminAttendanceListItemSchema>;

/**
 * `GET /admin/attendance/:id`. Baseline hanya menyimpan keputusan review
 * terakhir untuk payload saat ini, bukan audit history penuh.
 */
export const adminAttendanceDetailSchema = z.object({
  ...sessionCoreFields,
  client_submission_id: uuidSchema,
  learning_material: z.string(),
  learning_notes: z.string().nullable(),
  next_focus: z.string().nullable(),
  status: sessionStatusSchema,
  anomaly_analysis_status: anomalyAnalysisStatusSchema,
  findings: z.array(anomalyFindingSchema),
  submitted_at: timestampSchema,
  updated_at: timestampSchema,
  last_review: z.object({
    reviewed_by_user_id: uuidSchema.nullable(),
    reviewed_at: timestampSchema.nullable(),
    admin_note: z.string().nullable(),
  }),
});
export type AdminAttendanceDetail = z.infer<typeof adminAttendanceDetailSchema>;

export const adminAttendanceListQuerySchema = paginationQuerySchema.extend({
  period: periodSchema,
  tutor_id: uuidSchema.optional(),
  student_id: uuidSchema.optional(),
  subject_id: uuidSchema.optional(),
  status: sessionStatusSchema.optional(),
  anomaly_status: anomalyAnalysisStatusSchema.optional(),
  search: z.string().trim().max(100).optional(),
});
export type AdminAttendanceListQuery = z.infer<typeof adminAttendanceListQuerySchema>;

export const tutorAttendanceListQuerySchema = paginationQuerySchema.extend({
  period: periodSchema,
  status: sessionStatusSchema.optional(),
  /** Filter siswa (docs/15 §3.3); tetap dibatasi ke sesi milik tutor login. */
  student_id: uuidSchema.optional(),
});
export type TutorAttendanceListQuery = z.infer<typeof tutorAttendanceListQuerySchema>;

/**
 * Progress Anak: whitelist field yang boleh tampil ke Orang Tua.
 * `strictObject` memastikan tidak ada admin_note/anomali/honor yang bocor.
 */
export const parentProgressItemSchema = z.strictObject({
  id: uuidSchema,
  lesson_date: isoDateSchema,
  tutor_name: z.string(),
  subject_name: z.string(),
  duration_minutes: z.number().int(),
  learning_material: z.string(),
  learning_notes: z.string().nullable(),
  next_focus: z.string().nullable(),
});
export type ParentProgressItem = z.infer<typeof parentProgressItemSchema>;

export const parentProgressResponseSchema = z.strictObject({
  student: z.strictObject({
    id: uuidSchema,
    full_name: z.string(),
    grade: z.string(),
    school_name: z.string(),
  }),
  period: periodSchema,
  sessions: z.array(parentProgressItemSchema),
});
export type ParentProgressResponse = z.infer<typeof parentProgressResponseSchema>;

export const parentStudentSchema = z.strictObject({
  id: uuidSchema,
  full_name: z.string(),
  grade: z.string(),
  school_name: z.string(),
  relationship: z.string().nullable(),
});
export type ParentStudent = z.infer<typeof parentStudentSchema>;
