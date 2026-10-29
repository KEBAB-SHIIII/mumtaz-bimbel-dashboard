import { QueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';

/** Retry hanya untuk error jaringan/5xx; 4xx (validasi, akses, sesi) tidak diulang. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    return status === undefined || status >= 500;
  }
  return false;
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
      mutations: { retry: false },
    },
  });
}
