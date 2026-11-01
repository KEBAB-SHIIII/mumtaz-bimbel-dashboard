import type { z } from 'zod';
import {
  adminAttendanceDetailSchema,
  adminAttendanceListItemSchema,
  adminAttendanceOptionsSchema,
  adminDashboardSummarySchema,
  paginatedSchema,
  parentAccessCodeIssuedSchema,
  parentSchema,
  payrollPreviewResponseSchema,
  billingResponseSchema,
  sheetExportResponseSchema,
  sheetExportRunSchema,
  studentSchema,
  subjectSchema,
  tutorCredentialIssuedSchema,
  tutorSchema,
  type AdminAttendanceListQuery,
  type AdminCreateAttendanceRequest,
  type AdminUpdateAttendanceRequest,
  type Paginated,
  type SetValidityRequest,
  type SheetExportRequest,
} from '@mumtaz/contracts';
import { apiClient } from '../../lib/api-client';

type QueryParams = Record<string, string | number | boolean | undefined>;

/** Buang parameter kosong agar URL bersih dan query key stabil. */
function compact(params: QueryParams): QueryParams {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== ''));
}

async function get<S extends z.ZodType>(schema: S, url: string, params?: QueryParams): Promise<z.output<S>> {
  const { data } = await apiClient.get<unknown>(url, params ? { params: compact(params) } : undefined);
  return schema.parse(data);
}

// --- Dashboard, penagihan, honor -------------------------------------------------

export const fetchAdminDashboard = (period: string) =>
  get(adminDashboardSummarySchema, '/admin/dashboard/summary', { period });

export const fetchBilling = (period: string, studentId?: string) =>
  get(billingResponseSchema, '/admin/billing', { period, student_id: studentId });

/** Unduh invoice PDF satu murid (Axios + cookie session); nama file dari header server. */
export async function downloadInvoice(studentId: string, period: string): Promise<{ blob: Blob; fileName: string }> {
  const response = await apiClient.get<Blob>(`/admin/billing/${encodeURIComponent(studentId)}/invoice.pdf`, {
    params: { period },
    responseType: 'blob',
  });
  const disposition = String(response.headers['content-disposition'] ?? '');
  const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `tagihan-${period}.pdf`;
  return { blob: response.data, fileName };
}

export const fetchPayrollPreview = (period: string) =>
  get(payrollPreviewResponseSchema, '/admin/payroll/preview', { period });

// --- Data Absensi ----------------------------------------------------------------

export type AttendanceFilters = Partial<Omit<AdminAttendanceListQuery, 'period'>> & { period: string };

export const fetchAdminAttendance = (filters: AttendanceFilters) =>
  get(paginatedSchema(adminAttendanceListItemSchema), '/admin/attendance', filters);

export const fetchAdminAttendanceDetail = (id: string) =>
  get(adminAttendanceDetailSchema, `/admin/attendance/${encodeURIComponent(id)}`);

export const fetchAdminAttendanceOptions = () => get(adminAttendanceOptionsSchema, '/admin/attendance-options');

/** Koreksi label validitas AI / pilih status approval sesi Perlu revisi. */
export async function setAttendanceValidity(id: string, input: SetValidityRequest) {
  const { data } = await apiClient.patch<unknown>(`/admin/attendance/${encodeURIComponent(id)}/validity`, input);
  return adminAttendanceDetailSchema.parse(data);
}

export async function createAttendance(input: AdminCreateAttendanceRequest) {
  const { data } = await apiClient.post<unknown>('/admin/attendance', input);
  return adminAttendanceDetailSchema.parse(data);
}

export async function updateAttendance(id: string, input: AdminUpdateAttendanceRequest) {
  const { data } = await apiClient.put<unknown>(`/admin/attendance/${encodeURIComponent(id)}`, input);
  return adminAttendanceDetailSchema.parse(data);
}

export async function deleteAttendance(id: string) {
  await apiClient.delete(`/admin/attendance/${encodeURIComponent(id)}`);
}

// --- Master Data -------------------------------------------------------------------

export const MASTER_DATA_SCHEMAS = {
  tutors: tutorSchema,
  students: studentSchema,
  parents: parentSchema,
  subjects: subjectSchema,
} as const;

export type MasterDataEntity = keyof typeof MASTER_DATA_SCHEMAS;
export type MasterDataRow<E extends MasterDataEntity> = z.output<(typeof MASTER_DATA_SCHEMAS)[E]>;

export function fetchMasterData<E extends MasterDataEntity>(entity: E, params: QueryParams): Promise<Paginated<MasterDataRow<E>>> {
  return get(paginatedSchema(MASTER_DATA_SCHEMAS[entity]), `/admin/${entity}`, params) as Promise<Paginated<MasterDataRow<E>>>;
}

export async function createMasterData<E extends MasterDataEntity>(entity: E, body: object): Promise<MasterDataRow<E>> {
  const { data } = await apiClient.post<unknown>(`/admin/${entity}`, body);
  return MASTER_DATA_SCHEMAS[entity].parse(data) as MasterDataRow<E>;
}

export async function updateMasterData<E extends MasterDataEntity>(entity: E, id: string, body: object): Promise<MasterDataRow<E>> {
  const { data } = await apiClient.patch<unknown>(`/admin/${entity}/${encodeURIComponent(id)}`, body);
  return MASTER_DATA_SCHEMAS[entity].parse(data) as MasterDataRow<E>;
}

/** Respons create/reset tutor memuat password sementara SEKALI (tidak disimpan di cache). */
export async function createTutor(body: object) {
  const { data } = await apiClient.post<unknown>('/admin/tutors', body);
  return tutorCredentialIssuedSchema.parse(data);
}

export async function resetTutorPassword(id: string) {
  const { data } = await apiClient.post<unknown>(`/admin/tutors/${encodeURIComponent(id)}/reset-password`);
  return tutorCredentialIssuedSchema.parse(data);
}

/** Respons create parent memuat kode akses mentah SEKALI (tidak disimpan di cache). */
export async function createParent(body: object) {
  const { data } = await apiClient.post<unknown>('/admin/parents', body);
  return parentAccessCodeIssuedSchema.parse(data);
}

export async function rotateParentAccessCode(id: string) {
  const { data } = await apiClient.post<unknown>(`/admin/parents/${encodeURIComponent(id)}/rotate-access-code`);
  return parentAccessCodeIssuedSchema.parse(data);
}

// --- Ekspor Google Sheets (on-demand Admin) ------------------------------------------

/** Ekspor delapan kolom absensi periode ke tab `Absensi YYYY-MM` (replace isi tab). */
export async function exportAttendanceToSheets(input: SheetExportRequest) {
  const { data } = await apiClient.post<unknown>('/admin/reports/google-sheets/attendance', input);
  return sheetExportResponseSchema.parse(data).export;
}

export const fetchExportHistory = (params: { page?: number; page_size?: number; period?: string }) =>
  get(paginatedSchema(sheetExportRunSchema), '/admin/reports/google-sheets/attendance/history', params);
