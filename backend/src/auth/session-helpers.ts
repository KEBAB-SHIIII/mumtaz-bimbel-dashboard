import type { Request } from 'express';
import type { Role } from '@mumtaz/contracts';
import { newCsrfToken } from './csrf.js';

function promisify(fn: (callback: (error?: unknown) => void) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    fn((error) => (error ? reject(error instanceof Error ? error : new Error(String(error))) : resolve()));
  });
}

export function saveSession(req: Request): Promise<void> {
  return promisify((cb) => req.session.save(cb));
}

export function destroySession(req: Request): Promise<void> {
  return promisify((cb) => req.session.destroy(cb));
}

/**
 * Login berhasil: regenerasi session ID (anti session fixation), simpan identitas,
 * dan terbitkan CSRF token baru yang terikat ke session terautentikasi.
 */
export async function establishSession(
  req: Request,
  identity: { userId: string; role: Role; credentialVersion: number },
): Promise<string> {
  await promisify((cb) => req.session.regenerate(cb));
  const csrfToken = newCsrfToken();
  req.session.userId = identity.userId;
  req.session.role = identity.role;
  req.session.credentialVersion = identity.credentialVersion;
  req.session.csrfToken = csrfToken;
  await saveSession(req);
  return csrfToken;
}
