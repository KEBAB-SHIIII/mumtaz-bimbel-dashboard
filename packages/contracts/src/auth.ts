import { z } from 'zod';
import { uuidSchema } from './common.js';
import { roleSchema } from './enums.js';

/**
 * Panjang minimal password baru. Working default teknis; docs/04 menyebut
 * "panjang minimal dikonfigurasi" sehingga backend boleh menaikkannya.
 */
export const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 256;

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9._-]+$/, 'Username hanya huruf kecil, angka, titik, garis bawah, atau tanda hubung');

/** `POST /auth/login` — Admin & Tutor. Pesan gagal tetap generik di backend. */
export const loginRequestSchema = z.strictObject({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** `POST /auth/parent-access` — satu field ID Akses, tanpa password. */
export const parentAccessRequestSchema = z.strictObject({
  access_code: z.string().trim().min(1).max(128),
});
export type ParentAccessRequest = z.infer<typeof parentAccessRequestSchema>;

/** Normalisasi sebelum HMAC (docs/04 §2): trim, uppercase, hapus spasi & tanda hubung. */
export function normalizeParentAccessCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, '');
}

export const csrfResponseSchema = z.object({ csrf_token: z.string().min(1) });
export type CsrfResponse = z.infer<typeof csrfResponseSchema>;

/** Identitas non-rahasia. Tidak pernah memuat password hash/kode akses. */
export const authUserSchema = z.strictObject({
  id: uuidSchema,
  full_name: z.string(),
  role: roleSchema,
  /** Admin/Tutor saja; untuk tab Profil Tutor (read-only). */
  username: z.string().optional(),
  phone: z.string().nullable().optional(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const loginResponseSchema = z.object({
  user: authUserSchema,
  csrf_token: z.string().min(1),
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const meResponseSchema = z.object({ user: authUserSchema });
export type MeResponse = z.infer<typeof meResponseSchema>;

/** `PATCH /tutor/me/password` — tab Profil Tutor. */
export const changePasswordRequestSchema = z
  .strictObject({
    current_password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
    new_password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  })
  .refine((body) => body.current_password !== body.new_password, {
    path: ['new_password'],
    message: 'Password baru harus berbeda dari password lama',
  });
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
