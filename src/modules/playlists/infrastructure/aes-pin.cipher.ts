import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../shared/tenancy/tenant-context.js';
import { PinCipher } from '../application/ports/pin-cipher.js';
import { PLAYLIST_PIN_KEY_SECRET, PlaylistPinKey } from '../application/ports/playlist-pin-key.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
/** Stored form: `v1:` + base64 of iv | tag | ciphertext. */
const PREFIX = 'v1:';

/**
 * AES-256-GCM with the brand's `playlists.pinKey`. The brand id is authenticated with each PIN,
 * so a pinEnc copied into another brand's database does not open.
 */
@Injectable()
export class AesPinCipher extends PinCipher {
  constructor(
    private readonly keys: PlaylistPinKey,
    private readonly context: TenantContext,
  ) {
    super();
  }

  private async key(): Promise<Buffer> {
    const value = await this.keys.current();
    const key = value ? Buffer.from(value, 'base64') : null;
    if (!key || key.length !== 32) {
      // A setup problem, not a user error: the brand must have its key before PINs are used.
      throw new Error(
        `Brand ${this.context.current.slug} has no valid ${PLAYLIST_PIN_KEY_SECRET} secret; run pnpm cli playlists:pin-keys`,
      );
    }
    return key;
  }

  async encrypt(pin: string): Promise<string> {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, await this.key(), iv);
    cipher.setAAD(Buffer.from(this.context.current.id));
    const data = Buffer.concat([cipher.update(pin, 'utf8'), cipher.final()]);
    return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
  }

  async decrypt(pinEnc: string): Promise<string> {
    if (!pinEnc.startsWith(PREFIX)) throw new Error('Unknown pinEnc format');
    const raw = Buffer.from(pinEnc.slice(PREFIX.length), 'base64');
    const decipher = createDecipheriv(ALGORITHM, await this.key(), raw.subarray(0, IV_BYTES));
    decipher.setAAD(Buffer.from(this.context.current.id));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    return Buffer.concat([
      decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');
  }
}
