import { AxiosError } from 'axios';
import { errorResponseSchema, type ErrorCode } from '@mumtaz/contracts';

export interface ApiError {
  status: number | null;
  code: ErrorCode | 'NETWORK_ERROR' | 'UNKNOWN';
  message: string;
  details: { field: string; message: string }[];
}

const FALLBACK_MESSAGES: Partial<Record<ApiError['code'], string>> = {
  NETWORK_ERROR: 'Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.',
  INTERNAL_ERROR: 'Terjadi kesalahan pada server. Coba lagi beberapa saat lagi.',
  UNKNOWN: 'Terjadi kesalahan. Coba lagi.',
};

/** Normalisasi error Axios ke envelope kontrak (docs/04 §1); pesan aman dari server dipakai apa adanya. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof AxiosError) {
    if (!error.response) {
      return { status: null, code: 'NETWORK_ERROR', message: FALLBACK_MESSAGES.NETWORK_ERROR ?? '', details: [] };
    }
    const parsed = errorResponseSchema.safeParse(error.response.data);
    if (parsed.success) {
      return {
        status: error.response.status,
        code: parsed.data.error.code,
        message: parsed.data.error.message,
        details: parsed.data.error.details ?? [],
      };
    }
    return { status: error.response.status, code: 'UNKNOWN', message: FALLBACK_MESSAGES.UNKNOWN ?? '', details: [] };
  }
  return { status: null, code: 'UNKNOWN', message: FALLBACK_MESSAGES.UNKNOWN ?? '', details: [] };
}
