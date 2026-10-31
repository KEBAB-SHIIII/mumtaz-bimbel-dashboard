import { AxiosError, AxiosHeaders, type AxiosAdapter, type AxiosResponse } from 'axios';
import { CSRF_HEADER } from '../../lib/api-client';
import { createFakeBackend, type FakeBackend } from './fake-backend';

function parseBody(data: unknown): Record<string, unknown> {
  if (typeof data === 'string' && data.length > 0) {
    try {
      const parsed: unknown = JSON.parse(data);
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
}

/** Axios adapter yang menjawab request dari fake backend in-memory (data sintetis). */
export function createFakeAdapter(backend: FakeBackend = createFakeBackend(), { latencyMs = 0 } = {}): AxiosAdapter {
  return async (config) => {
    if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs));
    const url = new URL(config.url ?? '/', 'http://demo.local');
    const params = Object.fromEntries(
      Object.entries((config.params ?? {}) as Record<string, unknown>)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => [key, String(value)]),
    );
    const headers = AxiosHeaders.from(config.headers);
    const result = backend.handle({
      method: (config.method ?? 'get').toLowerCase(),
      path: url.pathname,
      params,
      body: parseBody(config.data),
      csrfHeader: headers.get(CSRF_HEADER)?.toString(),
    });
    const response: AxiosResponse = {
      data: result.data,
      status: result.status,
      statusText: String(result.status),
      headers: {},
      config,
    };
    if (result.status >= 400) {
      throw new AxiosError(`Request failed with status code ${result.status}`, AxiosError.ERR_BAD_REQUEST, config, null, response);
    }
    return response;
  };
}
