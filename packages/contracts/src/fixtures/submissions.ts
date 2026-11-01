import type { SubmitAttendanceRequest } from '../attendance.js';
import { STUDENT_IDS, SUBJECT_IDS, UNKNOWN_ID } from './ids.js';

/** Submit valid oleh Tutor (murid & mapel aktif dipilih Tutor sendiri). */
export const validSubmitRequest: SubmitAttendanceRequest = {
  client_submission_id: '00000000-0000-4000-9000-000000000100',
  student_id: STUDENT_IDS.murid1,
  subject_ids: [SUBJECT_IDS.matematika],
  lesson_date: '2026-10-20',
  start_time: '16:00',
  end_time: '17:30',
  learning_material: 'Persamaan linear satu variabel',
  learning_notes: 'Siswa memahami persamaan sederhana, masih perlu latihan soal cerita.',
  next_focus: 'Latihan soal cerita bertahap.',
};

/** Ditolak oleh schema Zod (bentuk/format) → `422 VALIDATION_FAILED`. */
export const schemaInvalidSubmitCases: { name: string; field: string; body: unknown }[] = [
  { name: 'jam selesai sebelum jam mulai', field: 'end_time', body: { ...validSubmitRequest, start_time: '17:00', end_time: '16:00' } },
  { name: 'jam selesai sama dengan jam mulai', field: 'end_time', body: { ...validSubmitRequest, end_time: '16:00' } },
  { name: 'format jam salah', field: 'start_time', body: { ...validSubmitRequest, start_time: '4 sore' } },
  { name: 'durasi dari body ditolak (dihitung backend)', field: 'duration_minutes', body: { ...validSubmitRequest, duration_minutes: 90 } },
  { name: 'tanggal tidak ada', field: 'lesson_date', body: { ...validSubmitRequest, lesson_date: '2026-02-30' } },
  { name: 'format tanggal DD/MM/YYYY', field: 'lesson_date', body: { ...validSubmitRequest, lesson_date: '20/10/2026' } },
  { name: 'materi kosong (O-09)', field: 'learning_material', body: { ...validSubmitRequest, learning_material: '   ' } },
  { name: 'murid bukan UUID', field: 'student_id', body: { ...validSubmitRequest, student_id: 'abc' } },
  { name: 'mapel bukan UUID', field: 'subject_ids', body: { ...validSubmitRequest, subject_ids: ['abc'] } },
  { name: 'tanpa mapel', field: 'subject_ids', body: { ...validSubmitRequest, subject_ids: [] } },
  { name: 'mapel dobel', field: 'subject_ids', body: { ...validSubmitRequest, subject_ids: [SUBJECT_IDS.matematika, SUBJECT_IDS.matematika] } },
  { name: 'subject_id tunggal lama ditolak', field: 'subject_id', body: { ...validSubmitRequest, subject_id: SUBJECT_IDS.matematika } },
  { name: 'assignment_id lama ditolak', field: 'assignment_id', body: { ...validSubmitRequest, assignment_id: UNKNOWN_ID } },
  { name: 'tanpa client_submission_id', field: 'client_submission_id', body: { ...validSubmitRequest, client_submission_id: undefined } },
  { name: 'tutor_id dari body ditolak', field: 'tutor_id', body: { ...validSubmitRequest, tutor_id: UNKNOWN_ID } },
  { name: 'status dari body ditolak', field: 'status', body: { ...validSubmitRequest, status: 'approved' } },
];

/**
 * Lolos schema, tetapi harus ditolak oleh aturan domain backend (murid/mapel tidak aktif atau
 * tidak ada); dipakai test API. Kasus "nonaktif" dibuat test dengan menonaktifkan master data.
 */
export const domainInvalidSubmitCases = {
  /** Murid tidak ada. */
  unknownStudent: { ...validSubmitRequest, client_submission_id: '00000000-0000-4000-9000-000000000101', student_id: UNKNOWN_ID },
  /** Mata pelajaran tidak ada. */
  unknownSubject: { ...validSubmitRequest, client_submission_id: '00000000-0000-4000-9000-000000000102', subject_ids: [UNKNOWN_ID] },
} satisfies Record<string, SubmitAttendanceRequest>;
