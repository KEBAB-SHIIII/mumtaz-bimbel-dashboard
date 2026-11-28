import { z } from 'zod';
import {
  generateMonthlySummaryResponseSchema,
  generateSessionSummaryResponseSchema,
  parentDashboardSummarySchema,
  parentLearningSummariesResponseSchema,
  parentProgressResponseSchema,
  parentStudentSchema,
} from '@mumtaz/contracts';
import { apiClient } from '../../lib/api-client';

/** Timeout khusus generate AI (> batas 30 detik di backend). */
const LEARNING_SUMMARY_TIMEOUT_MS = 35_000;

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

export async function fetchParentSummaries(studentId: string, period: string) {
  const { data } = await apiClient.get<unknown>(
    `/parent/students/${encodeURIComponent(studentId)}/summaries`,
    { params: { period } },
  );
  return parentLearningSummariesResponseSchema.parse(data);
}

export async function generateMonthlySummary(studentId: string, period: string) {
  const { data } = await apiClient.post<unknown>(
    `/parent/students/${encodeURIComponent(studentId)}/summaries/monthly`,
    { period },
    { timeout: LEARNING_SUMMARY_TIMEOUT_MS },
  );
  return generateMonthlySummaryResponseSchema.parse(data);
}

export async function generateSessionSummary(studentId: string, sessionId: string) {
  const { data } = await apiClient.post<unknown>(
    `/parent/students/${encodeURIComponent(studentId)}/sessions/${encodeURIComponent(sessionId)}/summary`,
    {},
    { timeout: LEARNING_SUMMARY_TIMEOUT_MS },
  );
  return generateSessionSummaryResponseSchema.parse(data);
}
