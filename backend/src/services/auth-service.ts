import { and, eq, inArray, sql } from 'drizzle-orm';
import type { AuthUser, ChangePasswordRequest, LoginRequest, Role } from '@mumtaz/contracts';
import { digestParentAccessCode } from '../auth/parent-access-code.js';
import {
  hashPassword,
  passwordNeedsRehash,
  verifyAgainstDummy,
  verifyPassword,
} from '../auth/password.js';
import { tutors, users } from '../db/schema.js';
import { invalidCredentials, notFound } from '../lib/http-error.js';
import type { ServiceContext } from './context.js';

export interface AuthenticatedIdentity {
  userId: string;
  role: Role;
  credentialVersion: number;
  user: AuthUser;
}

async function toAuthUser(ctx: ServiceContext, userId: string): Promise<AuthUser> {
  const [row] = await ctx.db
    .select({
      id: users.id,
      full_name: users.full_name,
      role: users.role,
      username: users.username,
      phone: tutors.phone,
    })
    .from(users)
    .leftJoin(tutors, eq(tutors.user_id, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) throw notFound('Pengguna');

  const role = row.role as Role;
  return {
    id: row.id,
    full_name: row.full_name,
    role,
    ...(row.username ? { username: row.username } : {}),
    ...(role === 'tutor' ? { phone: row.phone } : {}),
  };
}

/**
 * Login Admin/Tutor. Semua kegagalan (username tidak ada, password salah,
 * akun nonaktif) menghasilkan error generik yang sama.
 */
export async function authenticateStaff(ctx: ServiceContext, input: LoginRequest): Promise<AuthenticatedIdentity> {
  const [user] = await ctx.db
    .select()
    .from(users)
    .where(and(eq(users.username, input.username.toLowerCase()), inArray(users.role, ['admin', 'tutor'])))
    .limit(1);

  if (!user?.password_hash) {
    await verifyAgainstDummy(input.password);
    throw invalidCredentials();
  }

  const valid = await verifyPassword(user.password_hash, input.password);
  if (!valid || !user.is_active) {
    throw invalidCredentials();
  }

  if (passwordNeedsRehash(user.password_hash)) {
    await ctx.db
      .update(users)
      .set({ password_hash: await hashPassword(input.password), updated_at: ctx.now() })
      .where(eq(users.id, user.id));
  }

  return {
    userId: user.id,
    role: user.role as Role,
    credentialVersion: user.credential_version,
    user: await toAuthUser(ctx, user.id),
  };
}

/** Login Orang Tua dengan satu ID Akses; lookup lewat digest HMAC, bukan kode mentah. */
export async function authenticateParent(ctx: ServiceContext, accessCode: string): Promise<AuthenticatedIdentity> {
  const digest = digestParentAccessCode(accessCode, ctx.parentAccessCodePepper);
  const [user] = await ctx.db
    .select()
    .from(users)
    .where(and(eq(users.parent_access_code_hash, digest), eq(users.role, 'parent'), eq(users.is_active, true)))
    .limit(1);

  if (!user) throw invalidCredentials();

  return {
    userId: user.id,
    role: 'parent',
    credentialVersion: user.credential_version,
    user: await toAuthUser(ctx, user.id),
  };
}

export function getAuthUser(ctx: ServiceContext, userId: string): Promise<AuthUser> {
  return toAuthUser(ctx, userId);
}

/**
 * `PATCH /tutor/me/password`. Menaikkan `credential_version` sehingga session lain
 * milik akun ini ikut dicabut; route meregenerasi session saat ini.
 */
export async function changePassword(
  ctx: ServiceContext,
  userId: string,
  input: ChangePasswordRequest,
): Promise<{ credentialVersion: number }> {
  const [user] = await ctx.db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.password_hash || !(await verifyPassword(user.password_hash, input.current_password))) {
    throw invalidCredentials();
  }

  const [updated] = await ctx.db
    .update(users)
    .set({
      password_hash: await hashPassword(input.new_password),
      credential_version: sql`${users.credential_version} + 1`,
      updated_at: ctx.now(),
    })
    .where(eq(users.id, userId))
    .returning({ credentialVersion: users.credential_version });

  if (!updated) throw notFound('Pengguna');
  return updated;
}
