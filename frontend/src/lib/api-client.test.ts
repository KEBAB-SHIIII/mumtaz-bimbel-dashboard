import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { CSRF_HEADER, apiClient, getCsrfToken, onUnauthenticated, setCsrfToken } from './api-client';

function reply(config: InternalAxiosRequestConfig, status: number, data: unknown) {
  const response = { data, status, statusText: String(status), headers: {}, config };
  if (status >= 400) throw new AxiosError('error', AxiosError.ERR_BAD_REQUEST, config, null, response);
  return response;
}

describe('apiClient', () => {
  it('mengirim cookie session (withCredentials) dan tidak memakai localStorage', () => {
    expect(apiClient.defaults.withCredentials).toBe(true);
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    setCsrfToken('token');
    expect(spy).not.toHaveBeenCalled();
  });

  it('menambahkan header CSRF hanya untuk request mutasi', async () => {
    const seen: InternalAxiosRequestConfig[] = [];
    apiClient.defaults.adapter = (async (config) => {
      seen.push(config);
      return reply(config, 200, {});
    }) as AxiosAdapter;
    setCsrfToken('token-memory');

    await apiClient.get('/health');
    await apiClient.post('/auth/logout');
    await apiClient.patch('/tutor/me/password', {});

    expect(seen[0]?.headers.get(CSRF_HEADER)).toBeUndefined();
    expect(seen[1]?.headers.get(CSRF_HEADER)).toBe('token-memory');
    expect(seen[2]?.headers.get(CSRF_HEADER)).toBe('token-memory');
  });

  it('403 CSRF_INVALID → ambil token baru lalu ulangi request sekali', async () => {
    let posts = 0;
    apiClient.defaults.adapter = (async (config) => {
      if (config.url === '/auth/csrf') return reply(config, 200, { csrf_token: 'token-baru' });
      posts += 1;
      if (config.headers.get(CSRF_HEADER) !== 'token-baru') {
        return reply(config, 403, { error: { code: 'CSRF_INVALID', message: 'x' } });
      }
      return reply(config, 200, { ok: true });
    }) as AxiosAdapter;
    setCsrfToken('token-kedaluwarsa');

    const res = await apiClient.post('/admin/students', {});
    expect(res.data).toEqual({ ok: true });
    expect(posts).toBe(2);
    expect(getCsrfToken()).toBe('token-baru');
  });

  it('tidak retry tanpa batas bila CSRF tetap ditolak', async () => {
    let posts = 0;
    apiClient.defaults.adapter = (async (config) => {
      if (config.url === '/auth/csrf') return reply(config, 200, { csrf_token: 'masih-salah' });
      posts += 1;
      return reply(config, 403, { error: { code: 'CSRF_INVALID', message: 'x' } });
    }) as AxiosAdapter;

    await expect(apiClient.post('/admin/students', {})).rejects.toBeInstanceOf(AxiosError);
    expect(posts).toBe(2);
  });

  it('401 di endpoint terproteksi memicu listener sesi; 401 /auth/me tidak', async () => {
    const listener = vi.fn();
    const unsubscribe = onUnauthenticated(listener);
    apiClient.defaults.adapter = (async (config) => reply(config, 401, { error: { code: 'UNAUTHENTICATED', message: 'x' } })) as AxiosAdapter;

    await apiClient.get('/auth/me').catch(() => undefined);
    expect(listener).not.toHaveBeenCalled();
    await apiClient.get('/admin/attendance').catch(() => undefined);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
