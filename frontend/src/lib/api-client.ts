import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { csrfResponseSchema, errorResponseSchema } from '@mumtaz/contracts';

/**
 * Satu-satunya HTTP client aplikasi (docs/02, docs/04 §1, §9).
 * - Cookie session dikirim lewat `withCredentials`; tidak ada credential di localStorage.
 * - CSRF token hanya di memory modul ini, dikirim sebagai `X-CSRF-Token` pada mutasi.
 * - `403 CSRF_INVALID` → ambil token baru lalu ulangi request SEKALI.
 * - `401` → listener (AuthProvider) membersihkan state sesi.
 */
export const CSRF_HEADER = 'X-CSRF-Token';

const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);
/** Endpoint yang 401-nya adalah hasil normal (bukan sesi kedaluwarsa). */
const AUTH_PROBE_PATHS = ['/auth/me', '/auth/login', '/auth/parent-access', '/tutor/me/password'];

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

export function attachCsrfHeader(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  const method = (config.method ?? 'get').toLowerCase();
  if (csrfToken && MUTATING_METHODS.has(method)) {
    config.headers.set(CSRF_HEADER, csrfToken);
  }
  return config;
}

type UnauthenticatedListener = () => void;
const unauthenticatedListeners = new Set<UnauthenticatedListener>();

export function onUnauthenticated(listener: UnauthenticatedListener): () => void {
  unauthenticatedListeners.add(listener);
  return () => unauthenticatedListeners.delete(listener);
}

export const apiClient = axios.create({
  // Same-origin: UI disajikan backend yang sama (:3001), atau lewat proxy Vite saat hot reload.
  baseURL: '/api/v1',
  withCredentials: true,
  timeout: 15_000,
  headers: { Accept: 'application/json' },
});

apiClient.interceptors.request.use(attachCsrfHeader);

/** Ambil synchronizer token baru dari server dan simpan di memory. */
export async function refreshCsrfToken(): Promise<string> {
  const { data } = await apiClient.get<unknown>('/auth/csrf');
  const { csrf_token } = csrfResponseSchema.parse(data);
  setCsrfToken(csrf_token);
  return csrf_token;
}

type RetriableConfig = InternalAxiosRequestConfig & { _csrfRetried?: boolean };

apiClient.interceptors.response.use(undefined, async (error: unknown) => {
  if (!(error instanceof AxiosError) || !error.config) throw error;
  const config = error.config as RetriableConfig;
  const status = error.response?.status;
  const code = errorResponseSchema.safeParse(error.response?.data).data?.error.code;

  if (status === 403 && code === 'CSRF_INVALID' && !config._csrfRetried) {
    config._csrfRetried = true;
    await refreshCsrfToken();
    return apiClient.request(config);
  }

  if (status === 401 && !AUTH_PROBE_PATHS.some((path) => config.url?.startsWith(path))) {
    for (const listener of unauthenticatedListeners) listener();
  }
  throw error;
});
