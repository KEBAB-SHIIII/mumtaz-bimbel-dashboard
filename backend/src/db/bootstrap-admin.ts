import { eq } from 'drizzle-orm';
import { usernameSchema } from '@mumtaz/contracts';
import { hashPassword } from '../auth/password.js';
import type { DbOrTx } from './client.js';
import { users } from './schema.js';

export interface BootstrapAdminInput {
  username: string;
  password: string;
  fullName?: string;
  /** ID tetap (dipakai seed sintetis agar selaras dengan fixtures). */
  id?: string;
}

export const BOOTSTRAP_ADMIN_MIN_PASSWORD_LENGTH = 12;

/**
 * Idempoten: membuat Admin bila username belum ada. Bila sudah ada, password
 * TIDAK diubah (bootstrap bukan mekanisme reset password).
 */
export async function ensureBootstrapAdmin(db: DbOrTx, input: BootstrapAdminInput): Promise<'created' | 'exists'> {
  const username = usernameSchema.parse(input.username);
  if (input.password.length < BOOTSTRAP_ADMIN_MIN_PASSWORD_LENGTH) {
    throw new Error(`BOOTSTRAP_ADMIN_PASSWORD minimal ${BOOTSTRAP_ADMIN_MIN_PASSWORD_LENGTH} karakter`);
  }

  const [existing] = await db.select({ role: users.role }).from(users).where(eq(users.username, username)).limit(1);
  if (existing) {
    if (existing.role !== 'admin') {
      throw new Error(`Username ${username} sudah dipakai akun non-admin`);
    }
    return 'exists';
  }

  await db.insert(users).values({
    ...(input.id ? { id: input.id } : {}),
    full_name: input.fullName ?? 'Administrator',
    username,
    password_hash: await hashPassword(input.password),
    role: 'admin',
  });
  return 'created';
}
