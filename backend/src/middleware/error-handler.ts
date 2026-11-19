import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ErrorCode, ErrorResponse } from '@mumtaz/contracts';
import {
  PG_CHECK_VIOLATION,
  PG_EXCLUSION_VIOLATION,
  PG_FOREIGN_KEY_VIOLATION,
  PG_UNIQUE_VIOLATION,
  findPgError,
  safeErrorMessage,
} from '../lib/db-errors.js';
import { HttpError, type ErrorDetail } from '../lib/http-error.js';
import type { Logger } from '../lib/logger.js';

function body(code: ErrorCode, message: string, details?: ErrorDetail[]): ErrorResponse {
  return { error: { code, message, ...(details?.length ? { details } : {}) } };
}

/** Pesan aman per constraint; nama constraint/SQL tidak pernah dikirim ke client. */
const CONSTRAINT_MESSAGES: Record<string, { field: string; message: string }> = {
  users_username_key: { field: 'username', message: 'Username sudah dipakai' },
  users_email_key: { field: 'email', message: 'Email sudah dipakai' },
  subjects_name_key: { field: 'name', message: 'Nama mata pelajaran sudah ada' },
  tutor_rates_no_overlap: {
    field: 'effective_from',
    message: 'Periode tarif overlap dengan tarif lain pada penugasan yang sama',
  },
  tutor_assignments_active_no_overlap: {
    field: 'start_date',
    message: 'Penugasan aktif dengan tutor, siswa, dan mapel yang sama sudah ada pada periode tersebut',
  },
};

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json(body('NOT_FOUND', 'Resource tidak ditemukan'));
};

function hasHttpStatus(err: unknown): err is { status: number; type?: string } {
  return typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number';
}

/** Error envelope seragam (docs/04 §1). Tidak pernah mengirim stack trace, SQL, atau credential. */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, req, res, _next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json(body(err.code, err.message, err.details));
      return;
    }

    const pg = findPgError(err);
    if (pg) {
      const known = pg.constraint ? CONSTRAINT_MESSAGES[pg.constraint] : undefined;
      if (pg.code === PG_UNIQUE_VIOLATION || pg.code === PG_EXCLUSION_VIOLATION) {
        res.status(409).json(body('CONFLICT', known?.message ?? 'Data bertentangan dengan data yang sudah ada', known ? [known] : undefined));
        return;
      }
      if (pg.code === PG_FOREIGN_KEY_VIOLATION || pg.code === PG_CHECK_VIOLATION) {
        res.status(422).json(body('VALIDATION_FAILED', 'Data tidak memenuhi aturan validasi'));
        return;
      }
    }

    if (hasHttpStatus(err) && err.status >= 400 && err.status < 500) {
      // body-parser: JSON rusak / payload terlalu besar.
      res.status(400).json(body('BAD_REQUEST', 'Request tidak dapat diproses'));
      return;
    }

    logger.error('unhandled_error', {
      request_id: res.locals.requestId,
      method: req.method,
      path: req.path,
      error: err instanceof Error ? err.name : 'UnknownError',
      // Tanpa parameter query (bisa memuat hash/kode akses).
      error_message: safeErrorMessage(err),
    });
    res.status(500).json(body('INTERNAL_ERROR', 'Terjadi kesalahan pada server'));
  };
}
