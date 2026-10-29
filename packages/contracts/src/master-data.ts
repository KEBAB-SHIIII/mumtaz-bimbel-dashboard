import { z } from 'zod';
import {
  isoDateSchema,
  paginationQuerySchema,
  positiveMoneyStringSchema,
  requiredText,
  timestampSchema,
  uuidSchema,
} from './common.js';
import { PASSWORD_MIN_LENGTH, usernameSchema } from './auth.js';
import { rateTypeSchema } from './enums.js';

// Batas panjang di file ini adalah guard teknis (VARCHAR), bukan aturan bisnis.
const NAME_MAX = 120;

export const masterDataListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
});
export type MasterDataListQuery = z.infer<typeof masterDataListQuerySchema>;

const timestamps = {
  created_at: timestampSchema,
  updated_at: timestampSchema,
};

const phoneSchema = z.string().trim().min(6).max(20).regex(/^[0-9+\-\s]+$/, 'Nomor telepon tidak valid');

// --- Tutor ---------------------------------------------------------------

export const tutorSchema = z.object({
  id: uuidSchema,
  user_id: uuidSchema,
  full_name: z.string(),
  username: z.string(),
  phone: z.string().nullable(),
  /** Status operasional `tutors.is_active`. */
  is_active: z.boolean(),
  /** Kemampuan login `users.is_active`. */
  login_active: z.boolean(),
  ...timestamps,
});
export type Tutor = z.infer<typeof tutorSchema>;

export const createTutorRequestSchema = z.strictObject({
  full_name: requiredText(NAME_MAX),
  username: usernameSchema,
  initial_password: z.string().min(PASSWORD_MIN_LENGTH).max(256),
  phone: phoneSchema.optional(),
});
export type CreateTutorRequest = z.infer<typeof createTutorRequestSchema>;

export const updateTutorRequestSchema = z.strictObject({
  full_name: requiredText(NAME_MAX).optional(),
  username: usernameSchema.optional(),
  phone: phoneSchema.nullable().optional(),
  is_active: z.boolean().optional(),
  login_active: z.boolean().optional(),
});
export type UpdateTutorRequest = z.infer<typeof updateTutorRequestSchema>;

// --- Student -------------------------------------------------------------

export const studentSchema = z.object({
  id: uuidSchema,
  full_name: z.string(),
  grade: z.string(),
  school_name: z.string(),
  is_active: z.boolean(),
  ...timestamps,
});
export type Student = z.infer<typeof studentSchema>;

export const createStudentRequestSchema = z.strictObject({
  full_name: requiredText(NAME_MAX),
  grade: requiredText(30),
  school_name: requiredText(NAME_MAX),
});
export type CreateStudentRequest = z.infer<typeof createStudentRequestSchema>;

export const updateStudentRequestSchema = z.strictObject({
  full_name: requiredText(NAME_MAX).optional(),
  grade: requiredText(30).optional(),
  school_name: requiredText(NAME_MAX).optional(),
  is_active: z.boolean().optional(),
});
export type UpdateStudentRequest = z.infer<typeof updateStudentRequestSchema>;

// --- Parent --------------------------------------------------------------

export const studentLinkSchema = z.strictObject({
  student_id: uuidSchema,
  relationship: z.string().trim().max(40).nullable().optional(),
});
export type StudentLink = z.infer<typeof studentLinkSchema>;

const studentLinksSchema = z
  .array(studentLinkSchema)
  .min(1, 'Minimal satu siswa terhubung')
  .refine(
    (links) => new Set(links.map((link) => link.student_id)).size === links.length,
    'Siswa tidak boleh terhubung ganda',
  );

export const parentSchema = z.object({
  id: uuidSchema,
  full_name: z.string(),
  email: z.string().nullable(),
  is_active: z.boolean(),
  students: z.array(
    z.object({
      student_id: uuidSchema,
      full_name: z.string(),
      relationship: z.string().nullable(),
    }),
  ),
  ...timestamps,
});
export type Parent = z.infer<typeof parentSchema>;

export const createParentRequestSchema = z.strictObject({
  full_name: requiredText(NAME_MAX),
  email: z.email().optional(),
  student_links: studentLinksSchema,
});
export type CreateParentRequest = z.infer<typeof createParentRequestSchema>;

export const updateParentRequestSchema = z.strictObject({
  full_name: requiredText(NAME_MAX).optional(),
  email: z.email().nullable().optional(),
  is_active: z.boolean().optional(),
  /** Bila dikirim, mengganti seluruh relasi dalam satu transaksi. */
  student_links: studentLinksSchema.optional(),
});
export type UpdateParentRequest = z.infer<typeof updateParentRequestSchema>;

/**
 * Respons create/rotate: kode mentah dikembalikan SEKALI saja.
 * Response GET/PATCH parent tidak pernah memuat kode atau digest.
 */
export const parentAccessCodeIssuedSchema = z.object({
  parent: parentSchema,
  access_code: z.string().min(1),
});
export type ParentAccessCodeIssued = z.infer<typeof parentAccessCodeIssuedSchema>;

// --- Subject -------------------------------------------------------------

export const subjectSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  is_active: z.boolean(),
  ...timestamps,
});
export type Subject = z.infer<typeof subjectSchema>;

export const createSubjectRequestSchema = z.strictObject({ name: requiredText(NAME_MAX) });
export type CreateSubjectRequest = z.infer<typeof createSubjectRequestSchema>;

export const updateSubjectRequestSchema = z.strictObject({
  name: requiredText(NAME_MAX).optional(),
  is_active: z.boolean().optional(),
});
export type UpdateSubjectRequest = z.infer<typeof updateSubjectRequestSchema>;

// --- Tutor assignment ----------------------------------------------------

export const tutorAssignmentSchema = z.object({
  id: uuidSchema,
  tutor_id: uuidSchema,
  tutor_name: z.string(),
  student_id: uuidSchema,
  student_name: z.string(),
  subject_id: uuidSchema,
  subject_name: z.string(),
  start_date: isoDateSchema,
  end_date: isoDateSchema.nullable(),
  is_active: z.boolean(),
  ...timestamps,
});
export type TutorAssignment = z.infer<typeof tutorAssignmentSchema>;

export const createTutorAssignmentRequestSchema = z
  .strictObject({
    tutor_id: uuidSchema,
    student_id: uuidSchema,
    subject_id: uuidSchema,
    start_date: isoDateSchema,
    end_date: isoDateSchema.optional(),
  })
  .refine((body) => !body.end_date || body.end_date >= body.start_date, {
    path: ['end_date'],
    message: 'end_date tidak boleh sebelum start_date',
  });
export type CreateTutorAssignmentRequest = z.infer<typeof createTutorAssignmentRequestSchema>;

/** Tuple tutor/siswa/mapel immutable; hanya end_date & is_active. */
export const updateTutorAssignmentRequestSchema = z.strictObject({
  end_date: isoDateSchema.nullable().optional(),
  is_active: z.boolean().optional(),
});
export type UpdateTutorAssignmentRequest = z.infer<typeof updateTutorAssignmentRequestSchema>;

/** `GET /tutor/me/assignments` — opsi Form Absensi + auto-fill kelas/sekolah. */
export const tutorAssignmentOptionSchema = z.object({
  assignment_id: uuidSchema,
  student: z.object({
    id: uuidSchema,
    full_name: z.string(),
    grade: z.string(),
    school_name: z.string(),
  }),
  subject: z.object({ id: uuidSchema, name: z.string() }),
  start_date: isoDateSchema,
  end_date: isoDateSchema.nullable(),
});
export type TutorAssignmentOption = z.infer<typeof tutorAssignmentOptionSchema>;

// --- Tutor rate ----------------------------------------------------------

export const tutorRateSchema = z.object({
  id: uuidSchema,
  assignment_id: uuidSchema,
  rate_type: rateTypeSchema,
  rate_amount: z.string(),
  is_demo_assumption: z.boolean(),
  effective_from: isoDateSchema,
  effective_to: isoDateSchema.nullable(),
  ...timestamps,
});
export type TutorRate = z.infer<typeof tutorRateSchema>;

export const createTutorRateRequestSchema = z
  .strictObject({
    assignment_id: uuidSchema,
    rate_type: rateTypeSchema,
    rate_amount: positiveMoneyStringSchema,
    is_demo_assumption: z.boolean(),
    effective_from: isoDateSchema,
    effective_to: isoDateSchema.optional(),
  })
  .refine((body) => !body.effective_to || body.effective_to >= body.effective_from, {
    path: ['effective_to'],
    message: 'effective_to tidak boleh sebelum effective_from',
  });
export type CreateTutorRateRequest = z.infer<typeof createTutorRateRequestSchema>;

/** Tarif yang sudah dipakai tidak diubah nominal/jenis/mulai berlakunya; tutup periode. */
export const updateTutorRateRequestSchema = z.strictObject({
  effective_to: isoDateSchema.nullable().optional(),
});
export type UpdateTutorRateRequest = z.infer<typeof updateTutorRateRequestSchema>;
