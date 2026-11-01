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
  approvalStatusSchema,
  findingTypeSchema,
  sessionStatusSchema,
  sessionValiditySchema,
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

/** Jam les "HH:MM" (24 jam, WIB). */
export const lessonTimeSchema = z
  .string('Jam wajib diisi')
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam HH:MM (00:00–23:59)');

/** Durasi menit dari jam mulai ke jam selesai pada hari yang sama; `null` bila selesai ≤ mulai. */
export function durationBetween(startTime: string, endTime: string): number | null {
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const minutes = toMinutes(endTime) - toMinutes(startTime);
  return minutes > 0 ? minutes : null;
}

/** Maksimal mapel per sesi (revisi PM: tutor bisa mengajar beberapa mapel dalam 1 sesi; tarif tetap per sesi). */
export const MAX_SUBJECTS_PER_SESSION = 3;

const subjectIdsSchema = z
  .array(uuidSchema, 'Pilih minimal 1 mata pelajaran')
  .min(1, 'Pilih minimal 1 mata pelajaran')
  .max(MAX_SUBJECTS_PER_SESSION, `Maksimal ${MAX_SUBJECTS_PER_SESSION} mata pelajaran per sesi`)
  .refine((ids) => new Set(ids).size === ids.length, 'Mata pelajaran tidak boleh dobel');

/**
 * Field editable sesi (Tutor & Admin). Validasi bentuk saja; aturan domain
 * (murid & mata pelajaran aktif, tanggal tidak di masa depan menurut
 * Asia/Jakarta — O-14) diperiksa backend. Durasi tidak dikirim: backend menghitungnya
 * dari jam mulai–selesai.
 */
const editableSessionFields = {
  student_id: uuidSchema,
  subject_ids: subjectIdsSchema,
  lesson_date: isoDateSchema,
  start_time: lessonTimeSchema,
  end_time: lessonTimeSchema,
  /** Working default O-09: wajib. */
  learning_material: requiredText(MATERIAL_MAX),
  /** O-13: opsional. */
  learning_notes: optionalText(NOTES_MAX),
  next_focus: optionalText(NOTES_MAX),
};

const timeRangeIssue = (value: { start_time: string; end_time: string }, ctx: z.core.$RefinementCtx) => {
  if (durationBetween(value.start_time, value.end_time) === null) {
    ctx.addIssue({ code: 'custom', path: ['end_time'], message: 'Jam selesai harus setelah jam mulai' });
  }
};

/** `POST /tutor/attendance`. `tutor_id`/status/tarif tidak diterima dari body. */
export const submitAttendanceRequestSchema = z
  .strictObject({ client_submission_id: uuidSchema, ...editableSessionFields })
  .superRefine(timeRangeIssue);
export type SubmitAttendanceRequest = z.infer<typeof submitAttendanceRequestSchema>;

/** `PATCH /tutor/me/attendance/:id` — hanya saat Perlu revisi dengan approval menunggu. */
export const reviseAttendanceRequestSchema = z.strictObject(editableSessionFields).superRefine(timeRangeIssue);
export type ReviseAttendanceRequest = z.infer<typeof reviseAttendanceRequestSchema>;

/** `POST /admin/attendance` — Admin mencatat sesi atas nama tutor (CRUD penuh, revisi PM). */
export const adminCreateAttendanceRequestSchema = z
  .strictObject({ tutor_id: uuidSchema, ...editableSessionFields })
  .superRefine(timeRangeIssue);
export type AdminCreateAttendanceRequest = z.infer<typeof adminCreateAttendanceRequestSchema>;

/** `PUT /admin/attendance/:id` — Admin mengubah data sesi apa pun (koreksi salah label/data). */
export const adminUpdateAttendanceRequestSchema = adminCreateAttendanceRequestSchema;
export type AdminUpdateAttendanceRequest = AdminCreateAttendanceRequest;

/**
 * `PATCH /admin/attendance/:id/validity` — Admin mengoreksi label validitas AI atau memilih
 * status approval sesi Perlu revisi. Catatan Admin opsional (ditampilkan ke Tutor).
 */
export const setValidityRequestSchema = z.discriminatedUnion('validity', [
  z.strictObject({ validity: z.literal(sessionValiditySchema.enum.valid), admin_note: optionalText(NOTES_MAX) }),
  z.strictObject({
    validity: z.literal(sessionValiditySchema.enum.needs_revision),
    approval: approvalStatusSchema,
    admin_note: optionalText(NOTES_MAX),
  }),
  z.strictObject({ validity: z.literal(sessionValiditySchema.enum.rejected), admin_note: optionalText(NOTES_MAX) }),
]);
export type SetValidityRequest = z.infer<typeof setValidityRequestSchema>;

/** Delapan kolom inti yang juga menjadi dasar ekspor. */
const sessionCoreFields = {
  id: uuidSchema,
  tutor_id: uuidSchema,
  tutor_name: z.string(),
  student_id: uuidSchema,
  student_name: z.string(),
  grade: z.string(),
  school_name: z.string(),
  subject_ids: z.array(uuidSchema),
  /** Nama mapel digabung koma (urut abjad), mis. "IPA, Matematika". */
  subject_name: z.string(),
  lesson_date: isoDateSchema,
  /** `null` untuk sesi lama sebelum jam dicatat. */
  start_time: lessonTimeSchema.nullable(),
  end_time: lessonTimeSchema.nullable(),
  duration_minutes: z.number().int(),
};

/** Validitas + approval yang ditampilkan ke Admin dan Tutor. */
const validityFields = {
  /** `null` = belum divalidasi (AI belum selesai/gagal; Admin dapat menetapkan manual). */
  validity: sessionValiditySchema.nullable(),
  /** Hanya untuk `needs_revision`; selain itu `null`. */
  approval_status: approvalStatusSchema.nullable(),
  /** Penjelasan singkat label validitas (dari AI atau Admin). */
  validity_reason: z.string().nullable(),
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
  ...validityFields,
  /** Pesan Admin; relevan agar Tutor tahu apa yang perlu direvisi. */
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
  ...validityFields,
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
  ...validityFields,
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
  /** `unvalidated` = belum ada label validitas. */
  validity: z.union([sessionValiditySchema, z.literal('unvalidated')]).optional(),
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
