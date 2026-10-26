import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { TenantContext } from '../../../shared/tenancy/tenant-context.js';
import { PlaylistPinKey } from '../application/ports/playlist-pin-key.js';
import { AesPinCipher } from './aes-pin.cipher.js';

class Key extends PlaylistPinKey {
  constructor(private readonly value: string | null) {
    super();
  }
  current() {
    return Promise.resolve(this.value);
  }
}

const brand = (id: string) => ({ current: { id, slug: id } }) as unknown as TenantContext;
const key = randomBytes(32).toString('base64');

describe('AesPinCipher', () => {
  it('encrypts a PIN that only opens again with the same key and brand', async () => {
    const cipher = new AesPinCipher(new Key(key), brand('brand-a'));

    const enc = await cipher.encrypt('1234');

    expect(enc.startsWith('v1:')).toBe(true);
    expect(enc).not.toContain('1234');
    expect(await cipher.decrypt(enc)).toBe('1234');
    expect(await cipher.encrypt('1234')).not.toBe(enc);
  });

  it('does not open a PIN copied into another brand', async () => {
    const enc = await new AesPinCipher(new Key(key), brand('brand-a')).encrypt('1234');

    await expect(new AesPinCipher(new Key(key), brand('brand-b')).decrypt(enc)).rejects.toThrow();
  });

  it('does not open a PIN with another key', async () => {
    const enc = await new AesPinCipher(new Key(key), brand('brand-a')).encrypt('1234');
    const other = new AesPinCipher(new Key(randomBytes(32).toString('base64')), brand('brand-a'));

    await expect(other.decrypt(enc)).rejects.toThrow();
  });

  it('fails clearly when the brand has no key', async () => {
    await expect(new AesPinCipher(new Key(null), brand('brand-a')).encrypt('1234')).rejects.toThrow(
      'playlists.pinKey',
    );
  });
});
