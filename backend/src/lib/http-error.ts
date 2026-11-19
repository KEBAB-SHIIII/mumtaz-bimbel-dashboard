import type { ErrorCode } from '@mumtaz/contracts';

export interface ErrorDetail {
  field: string;
  message: string;
}

/** Error terkontrol yang dipetakan ke envelope `{ error: { code, message, details? } }`. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: ErrorDetail[] | undefined;

  constructor(status: number, code: ErrorCode, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const unauthenticated = () => new HttpError(401, 'UNAUTHENTICATED', 'Sesi tidak valid atau sudah berakhir');
export const invalidCredentials = () => new HttpError(401, 'UNAUTHENTICATED', 'Kredensial tidak valid');
export const forbidden = () => new HttpError(403, 'FORBIDDEN', 'Anda tidak memiliki akses ke resource ini');
export const notFound = (what = 'Data') => new HttpError(404, 'NOT_FOUND', `${what} tidak ditemukan`);
export const conflict = (message: string) => new HttpError(409, 'CONFLICT', message);
export const stateConflict = (message: string) => new HttpError(409, 'SESSION_STATE_CONFLICT', message);
export const validationFailed = (details: ErrorDetail[], message = 'Validasi gagal') =>
  new HttpError(422, 'VALIDATION_FAILED', message, details);
