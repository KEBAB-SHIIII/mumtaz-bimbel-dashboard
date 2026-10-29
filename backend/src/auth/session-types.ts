import 'express-session';
import type { Role } from '@mumtaz/contracts';

declare module 'express-session' {
  interface SessionData {
    /** Synchronizer token CSRF; ada juga pada session anonim (sebelum login). */
    csrfToken?: string;
    userId?: string;
    role?: Role;
    /** Harus sama dengan `users.credential_version`; jika tidak, session dicabut. */
    credentialVersion?: number;
  }
}

/** Identitas terautentikasi yang dimuat ulang dari DB pada setiap request. */
export interface AuthContext {
  userId: string;
  role: Role;
  fullName: string;
  /** Hanya untuk role tutor. */
  tutorId: string | null;
  tutorActive: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
