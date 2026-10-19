import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { err, ok, type Result } from '../../../shared/kernel/result.js';
import { BadCiphertextError } from './codec.errors.js';

/**
 * CryptoJS "passphrase" AES, as used by the old Android/TV apps and backends (`AES.encrypt(msg, secret)`):
 * OpenSSL format `"Salted__" + salt(8) + ciphertext`, base64; key and IV from EVP_BytesToKey(MD5);
 * AES-256-CBC with PKCS#7 padding. Implemented on node:crypto, no CryptoJS at runtime.
 * Verified against test/fixtures/legacy/codecs/aes.json.
 */

/** The old decryptMsg refused longer inputs; legacy routes keep the same limit. */
export const AES_MAX_CIPHERTEXT_LENGTH = 512;

const SALTED = Buffer.from('Salted__', 'latin1');

export function encryptPassphrase(plaintext: string, passphrase: string): string {
  const salt = randomBytes(8);
  const { key, iv } = evpBytesToKey(passphrase, salt);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([SALTED, salt, body]).toString('base64');
}

export function decryptPassphrase(
  ciphertext: string,
  passphrase: string,
): Result<string, BadCiphertextError> {
  if (ciphertext.length === 0 || ciphertext.length > AES_MAX_CIPHERTEXT_LENGTH) {
    return err(new BadCiphertextError('Ciphertext is empty or too long'));
  }
  const raw = Buffer.from(ciphertext, 'base64');
  if (raw.length < 32 || !raw.subarray(0, 8).equals(SALTED) || (raw.length - 16) % 16 !== 0) {
    return err(new BadCiphertextError('Not an OpenSSL salted ciphertext'));
  }
  try {
    const { key, iv } = evpBytesToKey(passphrase, raw.subarray(8, 16));
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    const plain = Buffer.concat([decipher.update(raw.subarray(16)), decipher.final()]);
    const text = plain.toString('utf8');
    // A wrong key usually fails the padding check; if it slips through, it is not valid UTF-8.
    if (!Buffer.from(text, 'utf8').equals(plain)) {
      return err(new BadCiphertextError('Ciphertext does not decrypt with this key'));
    }
    return ok(text);
  } catch {
    return err(new BadCiphertextError('Ciphertext does not decrypt with this key'));
  }
}

/** OpenSSL EVP_BytesToKey with MD5 and one iteration: 32-byte key + 16-byte IV. */
function evpBytesToKey(passphrase: string, salt: Buffer): { key: Buffer; iv: Buffer } {
  const password = Buffer.from(passphrase, 'utf8');
  let block = Buffer.alloc(0);
  let derived = Buffer.alloc(0);
  while (derived.length < 48) {
    block = createHash('md5')
      .update(Buffer.concat([block, password, salt]))
      .digest();
    derived = Buffer.concat([derived, block]);
  }
  return { key: derived.subarray(0, 32), iv: derived.subarray(32, 48) };
}
