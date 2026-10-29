import {
  fixtureAssignments,
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

/** Join sesi fixture ke master data (setara join assignment → tutor/siswa/mapel). */
export function resolveFixtureSession(session: FixtureLessonSession) {
  const assignment = must(fixtureAssignments.find((a) => a.id === session.assignment_id), `assignment ${session.assignment_id}`);
  const tutor = must(fixtureTutors.find((t) => t.id === assignment.tutor_id), `tutor ${assignment.tutor_id}`);
  const tutorUser = must(fixtureUsers.find((u) => u.id === tutor.user_id), `user ${tutor.user_id}`);
  const student = must(fixtureStudents.find((s) => s.id === assignment.student_id), `student ${assignment.student_id}`);
  const subject = must(fixtureSubjects.find((s) => s.id === assignment.subject_id), `subject ${assignment.subject_id}`);
  return { session, assignment, tutor, tutorUser, student, subject };
}
