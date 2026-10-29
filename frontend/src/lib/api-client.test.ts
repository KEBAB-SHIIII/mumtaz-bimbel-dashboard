import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it } from 'vitest';
import { CSRF_HEADER, apiClient, setCsrfToken } from './api-client';

function captureRequests() {
  const seen: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = async (config) => {
    seen.push(config);
    return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
  };
  return { seen, adapter };
}

describe('apiClient', () => {
  afterEach(() => {
    setCsrfToken(null);
  });

  it('mengirim cookie session (withCredentials)', () => {
    expect(apiClient.defaults.withCredentials).toBe(true);
  });

  it('menambahkan header CSRF hanya untuk request mutasi', async () => {
    const { seen, adapter } = captureRequests();
    setCsrfToken('token-memory');

    await apiClient.get('/health', { adapter });
    await apiClient.post('/auth/logout', {}, { adapter });
    await apiClient.patch('/tutor/me/password', {}, { adapter });

    expect(seen[0]?.headers.get(CSRF_HEADER)).toBeUndefined();
    expect(seen[1]?.headers.get(CSRF_HEADER)).toBe('token-memory');
    expect(seen[2]?.headers.get(CSRF_HEADER)).toBe('token-memory');
  });

  it('tidak mengirim header CSRF bila token belum ada', async () => {
    const { seen, adapter } = captureRequests();

    await apiClient.post('/auth/login', {}, { adapter });

    expect(seen[0]?.headers.get(CSRF_HEADER)).toBeUndefined();
  });
});
