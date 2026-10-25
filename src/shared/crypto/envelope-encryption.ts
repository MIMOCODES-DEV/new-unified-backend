import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** A secret encrypted with its own data key; the data key is encrypted with the master key. */
export interface SealedSecret {
  /** Fingerprint of the master key that sealed it, so a wrong key fails with a clear error. */
  readonly keyId: string;
  /** The data key, encrypted with the master key: base64 of iv | tag | ciphertext. */
  readonly dataKey: string;
  /** The secret, encrypted with the data key: base64 of iv | tag | ciphertext. */
  readonly data: string;
}

/**
 * Envelope encryption with AES-256-GCM. Every secret gets a fresh random data key, so the master key
 * only ever encrypts data keys and can later move to a KMS without re-encrypting the secrets.
 * `context` (e.g. `<tenantId>/<name>`) is authenticated but not stored: a ciphertext copied to
 * another tenant or name in the database fails to open instead of being served.
 */
export class EnvelopeEncryption {
  readonly keyId: string;

  constructor(private readonly masterKey: Buffer) {
    if (masterKey.length !== KEY_BYTES) {
      throw new Error(`The master key must be ${KEY_BYTES} bytes`);
    }
    this.keyId = createHash('sha256').update(masterKey).digest('hex').slice(0, 16);
  }

  static fromBase64(value: string): EnvelopeEncryption {
    return new EnvelopeEncryption(Buffer.from(value, 'base64'));
  }

  seal(plaintext: string, context: string): SealedSecret {
    const dataKey = randomBytes(KEY_BYTES);
    try {
      return {
        keyId: this.keyId,
        dataKey: encrypt(this.masterKey, dataKey, context),
        data: encrypt(dataKey, Buffer.from(plaintext, 'utf8'), context),
      };
    } finally {
      dataKey.fill(0);
    }
  }

  open(sealed: SealedSecret, context: string): string {
    if (sealed.keyId !== this.keyId) {
      throw new Error(`Secret was sealed with another master key (${sealed.keyId})`);
    }
    const dataKey = decrypt(this.masterKey, sealed.dataKey, context);
    try {
      return decrypt(dataKey, sealed.data, context).toString('utf8');
    } finally {
      dataKey.fill(0);
    }
  }
}

function encrypt(key: Buffer, plaintext: Buffer, context: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

function decrypt(key: Buffer, payload: string, context: string): Buffer {
  const bytes = Buffer.from(payload, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, bytes.subarray(0, IV_BYTES));
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([decipher.update(bytes.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]);
}
