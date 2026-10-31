import {
  fixtureStudents,
  fixtureSubjects,
  fixtureTutors,
  fixtureUsers,
} from './master-data.js';
import type { FixtureLessonSession } from './sessions.js';

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw new Error(`Fixture tidak konsisten: ${what} tidak ditemukan`);
  }
  return value;
}

/** Join sesi fixture ke master data (setara join langsung sesi → tutor/siswa/mapel). */
export function resolveFixtureSession(session: FixtureLessonSession) {
  const tutor = must(fixtureTutors.find((t) => t.id === session.tutor_id), `tutor ${session.tutor_id}`);
  const tutorUser = must(fixtureUsers.find((u) => u.id === tutor.user_id), `user ${tutor.user_id}`);
  const student = must(fixtureStudents.find((s) => s.id === session.student_id), `student ${session.student_id}`);
  const subject = must(fixtureSubjects.find((s) => s.id === session.subject_id), `subject ${session.subject_id}`);
  return { session, tutor, tutorUser, student, subject };
}
