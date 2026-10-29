import { AxiosError } from 'axios';
import {
  csrfResponseSchema,
  loginResponseSchema,
  meResponseSchema,
  type AuthUser,
  type ChangePasswordRequest,
  type LoginRequest,
  type ParentAccessRequest,
} from '@mumtaz/contracts';
import { apiClient, refreshCsrfToken, setCsrfToken } from '../../lib/api-client';

/** Session aktif atau `null` bila belum login (401 adalah hasil normal di sini). */
export async function fetchSession(): Promise<AuthUser | null> {
  await refreshCsrfToken();
  try {
    const { data } = await apiClient.get<unknown>('/auth/me');
    return meResponseSchema.parse(data).user;
  } catch (error) {
    if (error instanceof AxiosError && error.response?.status === 401) return null;
    throw error;
  }
}

export async function login(input: LoginRequest): Promise<AuthUser> {
  const { data } = await apiClient.post<unknown>('/auth/login', input);
  const body = loginResponseSchema.parse(data);
  // Token baru terikat ke session terautentikasi (session ID diregenerasi server).
  setCsrfToken(body.csrf_token);
  return body.user;
}

export async function parentAccess(input: ParentAccessRequest): Promise<AuthUser> {
  const { data } = await apiClient.post<unknown>('/auth/parent-access', input);
  const body = loginResponseSchema.parse(data);
  setCsrfToken(body.csrf_token);
  return body.user;
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post('/auth/logout');
  } finally {
    setCsrfToken(null);
  }
}

export async function changePassword(input: ChangePasswordRequest): Promise<void> {
  const { data } = await apiClient.patch<unknown>('/tutor/me/password', input);
  setCsrfToken(csrfResponseSchema.parse(data).csrf_token);
}
