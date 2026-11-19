import { createHmac, randomBytes } from 'node:crypto';
import { normalizeParentAccessCode } from '@mumtaz/contracts';

const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_BYTES = 16; // 128 bit dari CSPRNG
const GROUP_SIZE = 4;

function encodeCrockford(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += CROCKFORD_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += CROCKFORD_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/**
 * Kode akses Orang Tua baru: 128 bit acak, base32 Crockford uppercase,
 * dikelompokkan per 4 karakter (docs/04 §2), mis. `7K3M-…-X`.
 * Kode mentah hanya dikembalikan sekali ke Admin dan tidak pernah disimpan.
 */
export function generateParentAccessCode(): string {
  const encoded = encodeCrockford(randomBytes(CODE_BYTES));
  return encoded.match(new RegExp(`.{1,${GROUP_SIZE}}`, 'g'))?.join('-') ?? encoded;
}

/** HMAC-SHA-256 (hex, 64 karakter) dari kode ternormalisasi dengan pepper server. */
export function digestParentAccessCode(code: string, pepper: string): string {
  return createHmac('sha256', pepper).update(normalizeParentAccessCode(code)).digest('hex');
}
