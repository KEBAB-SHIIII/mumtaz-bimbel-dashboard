import type { SubmitAttendanceRequest } from '../attendance.js';
import { ASSIGNMENT_IDS, UNKNOWN_ID } from './ids.js';

/** Submit valid oleh Tutor A (assignment miliknya, aktif). */
export const validSubmitRequest: SubmitAttendanceRequest = {
  client_submission_id: '00000000-0000-4000-9000-000000000100',
  assignment_id: ASSIGNMENT_IDS.tutorAMurid1Matematika,
  lesson_date: '2026-10-20',
  duration_minutes: 90,
  learning_material: 'Persamaan linear satu variabel',
  learning_notes: 'Siswa memahami persamaan sederhana, masih perlu latihan soal cerita.',
  next_focus: 'Latihan soal cerita bertahap.',
};

/** Ditolak oleh schema Zod (bentuk/format) → `422 VALIDATION_FAILED`. */
export const schemaInvalidSubmitCases: { name: string; field: string; body: unknown }[] = [
  { name: 'durasi desimal', field: 'duration_minutes', body: { ...validSubmitRequest, duration_minutes: 1.5 } },
  { name: 'durasi nol', field: 'duration_minutes', body: { ...validSubmitRequest, duration_minutes: 0 } },
  { name: 'durasi negatif', field: 'duration_minutes', body: { ...validSubmitRequest, duration_minutes: -30 } },
  { name: 'durasi string', field: 'duration_minutes', body: { ...validSubmitRequest, duration_minutes: '90 menit' } },
  { name: 'tanggal tidak ada', field: 'lesson_date', body: { ...validSubmitRequest, lesson_date: '2026-02-30' } },
  { name: 'format tanggal DD/MM/YYYY', field: 'lesson_date', body: { ...validSubmitRequest, lesson_date: '20/10/2026' } },
  { name: 'materi kosong (O-09)', field: 'learning_material', body: { ...validSubmitRequest, learning_material: '   ' } },
  { name: 'assignment bukan UUID', field: 'assignment_id', body: { ...validSubmitRequest, assignment_id: 'abc' } },
  { name: 'tanpa client_submission_id', field: 'client_submission_id', body: { ...validSubmitRequest, client_submission_id: undefined } },
  { name: 'tutor_id dari body ditolak', field: 'tutor_id', body: { ...validSubmitRequest, tutor_id: UNKNOWN_ID } },
  { name: 'status dari body ditolak', field: 'status', body: { ...validSubmitRequest, status: 'approved' } },
];

/**
 * Lolos schema, tetapi harus ditolak oleh aturan domain backend
 * (assignment/tanggal); dipakai test API Phase 03/06.
 */
export const domainInvalidSubmitCases = {
  /** Tutor A memakai assignment milik Tutor B. */
  assignmentOfOtherTutor: { ...validSubmitRequest, client_submission_id: '00000000-0000-4000-9000-000000000101', assignment_id: ASSIGNMENT_IDS.tutorBMurid3Ipa },
  /** Assignment nonaktif (Tutor B). */
  inactiveAssignment: { ...validSubmitRequest, client_submission_id: '00000000-0000-4000-9000-000000000102', assignment_id: ASSIGNMENT_IDS.tutorBMurid2MatematikaInactive },
  /** Assignment tidak ada. */
  unknownAssignment: { ...validSubmitRequest, client_submission_id: '00000000-0000-4000-9000-000000000103', assignment_id: UNKNOWN_ID },
  /** Sebelum `start_date` assignment (2026-09-01). */
  beforeAssignmentStart: { ...validSubmitRequest, client_submission_id: '00000000-0000-4000-9000-000000000104', lesson_date: '2026-08-31' },
} satisfies Record<string, SubmitAttendanceRequest>;
