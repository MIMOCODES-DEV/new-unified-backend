import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** RFC 6238 time-based codes, as authenticator apps make them: SHA-1, 6 digits, 30 seconds. */
const STEP_SECONDS = 30;
const DIGITS = 6;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** A new shared secret: 20 random bytes in base32, the form authenticator apps take. */
export function newTotpSecret(): string {
  return toBase32(randomBytes(20));
}

/** The code for the 30-second step that `at` falls in. */
export function totpCode(secret: string, at: Date): string {
  return codeForStep(fromBase32(secret), Math.floor(at.getTime() / 1000 / STEP_SECONDS));
}

/**
 * Whether `code` is right now, or one step before or after (a phone clock off by up to 30 seconds).
 */
export function verifyTotp(secret: string, code: string, at: Date): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const key = fromBase32(secret);
  const step = Math.floor(at.getTime() / 1000 / STEP_SECONDS);
  let match = false;
  for (const offset of [-1, 0, 1]) {
    const expected = Buffer.from(codeForStep(key, step + offset));
    // Every step is compared, so the time taken does not say which one matched.
    if (timingSafeEqual(expected, Buffer.from(code))) match = true;
  }
  return match;
}

/** The link an authenticator app reads from a QR code. */
export function totpUri(issuer: string, account: string, secret: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const query = new URLSearchParams({ secret, issuer, digits: String(DIGITS), period: '30' });
  return `otpauth://totp/${label}?${query.toString()}`;
}

function codeForStep(key: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const value = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return value.toString().padStart(DIGITS, '0');
}

function toBase32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function fromBase32(text: string): Buffer {
  const clean = text.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 secret');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
