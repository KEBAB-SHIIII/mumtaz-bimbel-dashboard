import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ErrorCode, ErrorResponse } from '@mumtaz/contracts';

export class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;

  constructor(status: number, code: ErrorCode, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

function errorBody(code: ErrorCode, message: string): ErrorResponse {
  return { error: { code, message } };
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json(errorBody('NOT_FOUND', 'Resource tidak ditemukan'));
};

function hasStatus(err: unknown): err is { status: number; type?: string } {
  return typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number';
}

/** Error envelope seragam (docs/04 §1). Tidak pernah mengirim stack trace/SQL ke client. */
export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json(errorBody(err.code, err.message));
    return;
  }

  // Body JSON tidak valid dari express.json().
  if (hasStatus(err) && err.status === 400 && err.type === 'entity.parse.failed') {
    res.status(400).json(errorBody('BAD_REQUEST', 'Request tidak dapat diproses'));
    return;
  }

  console.error('[error]', err instanceof Error ? err.name : 'UnknownError');
  res.status(500).json(errorBody('INTERNAL_ERROR', 'Terjadi kesalahan pada server'));
};
