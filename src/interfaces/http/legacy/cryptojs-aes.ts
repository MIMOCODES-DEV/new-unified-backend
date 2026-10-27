/**
 * CryptoJS "passphrase" AES rules (what the old apps and backends use for v2/v3 routes):
 * - Text = base64( "Salted__" + 8-byte salt + AES-256-CBC ciphertext ), PKCS7 padding.
 * - Key and IV come from the passphrase + salt with OpenSSL's EVP_BytesToKey (MD5, 1 round).
 * - Same output as CryptoJS.AES.encrypt(text, passphrase).toString(), so old apps read it.
 * - The old backends refused requests over 512 characters (a bug: longer device_info made
 *   them fail). We accept up to 16 KB instead.
 * Test vectors: test/fixtures/legacy/codecs/aes.json (from the real old code).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const SALTED = Buffer.from('Salted__', 'latin1');
const MAX_INPUT = 16 * 1024;

function keyAndIv(passphrase: string, salt: Buffer): { key: Buffer; iv: Buffer } {
  const pass = Buffer.from(passphrase, 'utf8');
  let block = Buffer.alloc(0);
  let all = Buffer.alloc(0);
  while (all.length < 48) {
    block = createHash('md5')
      .update(Buffer.concat([block, pass, salt]))
      .digest();
    all = Buffer.concat([all, block]);
  }
  return { key: all.subarray(0, 32), iv: all.subarray(32, 48) };
}

export function aesEncrypt(text: string, passphrase: string): string {
  const salt = randomBytes(8);
  const { key, iv } = keyAndIv(passphrase, salt);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return Buffer.concat([SALTED, salt, body]).toString('base64');
}

/** The decrypted text, or null if it is not valid CryptoJS AES for this passphrase. */
export function aesDecrypt(cipherText: string, passphrase: string): string | null {
  if (!cipherText || cipherText.length > MAX_INPUT) return null;
  const raw = Buffer.from(cipherText, 'base64');
  if (raw.length < 32 || !raw.subarray(0, 8).equals(SALTED)) return null;
  const { key, iv } = keyAndIv(passphrase, raw.subarray(8, 16));
  try {
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    return Buffer.concat([decipher.update(raw.subarray(16)), decipher.final()]).toString('utf8');
  } catch {
    return null; // wrong key or tampered text: the padding check fails
  }
}
