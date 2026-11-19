import { randomInt } from 'node:crypto';
import argon2 from 'argon2';

/**
 * Argon2id dengan parameter minimum rekomendasi OWASP
 * (m=19 MiB, t=2, p=1). Hash lama dengan parameter lebih lemah di-rehash saat login.
 */
const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, HASH_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    // Hash rusak/tidak dikenal diperlakukan sebagai gagal, bukan error 500.
    return false;
  }
}

export function passwordNeedsRehash(hash: string): boolean {
  return argon2.needsRehash(hash, HASH_OPTIONS);
}

let dummyHash: Promise<string> | undefined;

/**
 * Verifikasi terhadap hash dummy saat username tidak ditemukan, agar waktu
 * respons tidak membocorkan apakah akun ada.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword('dummy-password-for-timing-equalization');
  await verifyPassword(await dummyHash, password);
  return false;
}

/** Tanpa karakter ambigu (0/O, 1/l/I) agar mudah dibaca & diketik Tutor. */
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const TEMP_PASSWORD_GROUPS = 3;
const TEMP_PASSWORD_GROUP_SIZE = 4;

/**
 * Password sementara Tutor: 12 karakter acak (CSPRNG, ±69 bit) dalam 3 grup, mis. `Kx7m-Pq3R-wN9t`.
 * Dikembalikan SEKALI ke Admin; hanya hash-nya yang disimpan. Tutor menggantinya di Profil.
 */
export function generateTemporaryPassword(): string {
  const group = () =>
    Array.from({ length: TEMP_PASSWORD_GROUP_SIZE }, () => TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)]).join('');
  return Array.from({ length: TEMP_PASSWORD_GROUPS }, group).join('-');
}
