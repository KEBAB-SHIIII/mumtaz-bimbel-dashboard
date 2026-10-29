import axios, { type InternalAxiosRequestConfig } from 'axios';

/**
 * Satu-satunya HTTP client aplikasi (docs/02, docs/04 §1).
 * - Cookie session dikirim lewat `withCredentials`; tidak ada token di localStorage.
 * - CSRF token disimpan di memory modul ini dan dikirim sebagai `X-CSRF-Token`
 *   untuk request mutasi. Bootstrap token via `GET /auth/csrf` dipasang Phase 03/04.
 */
export const CSRF_HEADER = 'X-CSRF-Token';

const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);

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

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001/api/v1',
  withCredentials: true,
  timeout: 15_000,
  headers: {
    Accept: 'application/json',
  },
});

apiClient.interceptors.request.use(attachCsrfHeader);
