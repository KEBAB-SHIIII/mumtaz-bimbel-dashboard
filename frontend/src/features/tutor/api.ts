import { z } from 'zod';
import {
  paginatedSchema,
  payrollPreviewResponseSchema,
  submitAttendanceResponseSchema,
  tutorAssignmentOptionSchema,
  tutorDashboardSummarySchema,
  tutorSessionSchema,
  type ReviseAttendanceRequest,
  type SessionStatus,
  type SubmitAttendanceRequest,
} from '@mumtaz/contracts';
import { apiClient } from '../../lib/api-client';

// Identitas tutor tidak pernah dikirim: backend mengambilnya dari session.

export async function fetchTutorDashboard(period: string) {
  const { data } = await apiClient.get<unknown>('/tutor/dashboard/summary', { params: { period } });
  return tutorDashboardSummarySchema.parse(data);
}

export async function fetchTutorAssignments() {
  const { data } = await apiClient.get<unknown>('/tutor/me/assignments');
  return z.object({ items: z.array(tutorAssignmentOptionSchema) }).parse(data).items;
}

export async function submitAttendance(input: SubmitAttendanceRequest) {
  const { data } = await apiClient.post<unknown>('/tutor/attendance', input);
  return submitAttendanceResponseSchema.parse(data).session;
}

export interface TutorAttendanceFilters {
  period: string;
  status?: SessionStatus | undefined;
  student_id?: string | undefined;
  page: number;
  page_size: number;
}

export async function fetchTutorAttendance(filters: TutorAttendanceFilters) {
  const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined));
  const { data } = await apiClient.get<unknown>('/tutor/me/attendance', { params });
  return paginatedSchema(tutorSessionSchema).parse(data);
}

/** `PATCH /tutor/me/attendance/:id` — hanya sesi milik sendiri berstatus `revision_requested`. */
export async function reviseAttendance(id: string, input: ReviseAttendanceRequest) {
  const { data } = await apiClient.patch<unknown>(`/tutor/me/attendance/${encodeURIComponent(id)}`, input);
  return z.object({ session: tutorSessionSchema }).parse(data).session;
}

export async function fetchTutorPayroll(period: string) {
  const { data } = await apiClient.get<unknown>('/tutor/me/payroll', { params: { period } });
  return payrollPreviewResponseSchema.parse(data);
}
