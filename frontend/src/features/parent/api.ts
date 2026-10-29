import { z } from 'zod';
import { parentDashboardSummarySchema, parentProgressResponseSchema, parentStudentSchema } from '@mumtaz/contracts';
import { apiClient } from '../../lib/api-client';

export async function fetchParentStudents() {
  const { data } = await apiClient.get<unknown>('/parent/me/students');
  return z.object({ items: z.array(parentStudentSchema) }).parse(data).items;
}

export async function fetchParentDashboard(studentId: string, period: string) {
  const { data } = await apiClient.get<unknown>('/parent/dashboard/summary', { params: { student_id: studentId, period } });
  return parentDashboardSummarySchema.parse(data);
}

/** Schema strict: respons yang memuat field internal (admin_note, honor, anomali) akan ditolak. */
export async function fetchParentProgress(studentId: string, period: string) {
  const { data } = await apiClient.get<unknown>(`/parent/students/${encodeURIComponent(studentId)}/progress`, { params: { period } });
  return parentProgressResponseSchema.parse(data);
}
