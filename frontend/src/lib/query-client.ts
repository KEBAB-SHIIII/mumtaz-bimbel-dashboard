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
        // Otomatis segarkan data yang sudah lewat `staleTime` (30 dtk) saat pengguna kembali ke tab.
        refetchOnWindowFocus: true,
        staleTime: 30_000,
      },
      mutations: { retry: false },
    },
  });
}
