import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  AES_MAX_CIPHERTEXT_LENGTH,
  decryptPassphrase,
  encryptPassphrase,
} from './aes-passphrase.codec.js';
import { type FakeKeys, loadVectors } from './fixtures.spec-helper.js';

interface Vectors {
  fakeKeys: FakeKeys;
  aes: {
    server: string;
    version: string;
    deviceType?: string;
    plaintext?: string;
    ciphertext?: string;
    roundTrips?: boolean;
  }[];
}

/** The library the TV apps use (devDependency, no type definitions): only what this test needs. */
interface CryptoJsSubset {
  AES: { decrypt(ciphertext: string, passphrase: string): { toString(encoding: unknown): string } };
  enc: { Utf8: unknown };
}
const CryptoJS = createRequire(import.meta.url)('crypto-js') as CryptoJsSubset;

const vectors = loadVectors<Vectors>('aes.json');
const keys = vectors.fakeKeys;

/**
 * Which secret produced each fixture. ibo picks by version (server.js encryptMsg); bob and cr only
 * know "new" vs "old", so the generator's V2/V3 labels fell back to their old key.
 */
function secretFor(server: string, version: string, deviceType: string): string {
  if (server !== 'iboplayer-backend') return keys.ANDROID_AES_SECRET;
  if (version === 'V3' && deviceType === 'android') return keys.ANDROID_V3_AES_NEW_SECRET;
  if (version === 'V2') return keys.ANDROID_AES_NEW_SECRET;
  if (version === 'V3') return keys.TV_AES_NEW_SECRET;
  return keys.ANDROID_AES_SECRET;
}

const cases = vectors.aes.filter(
  (
    v,
  ): v is Required<Pick<Vectors['aes'][number], 'plaintext' | 'ciphertext' | 'deviceType'>> &
    Vectors['aes'][number] =>
    v.ciphertext !== undefined && v.plaintext !== undefined && v.deviceType !== undefined,
);

describe('legacy CryptoJS passphrase AES', () => {
  describe('decrypts what the old backends encrypted', () => {
    for (const v of cases) {
      it(`${v.server} ${v.version} ${v.deviceType}`, () => {
        const result = decryptPassphrase(
          v.ciphertext,
          secretFor(v.server, v.version, v.deviceType),
        );

        // ibo's Android V3 never decrypted in the old code (a bug); with the right key it works here.
        if (!result.ok) throw result.error;
        expect(result.value).toBe(v.plaintext);
      });
    }
  });

  it('encrypts in the OpenSSL "Salted__" format CryptoJS (the apps) can decrypt', () => {
    const plaintext = '{"status":"success","name":"قناة"}';

    const ciphertext = encryptPassphrase(plaintext, keys.ANDROID_AES_NEW_SECRET);

    expect(ciphertext.startsWith('U2FsdGVkX1')).toBe(true); // base64 of "Salted__"
    expect(
      CryptoJS.AES.decrypt(ciphertext, keys.ANDROID_AES_NEW_SECRET).toString(CryptoJS.enc.Utf8),
    ).toBe(plaintext);
  });

  it('uses a fresh salt every time', () => {
    expect(encryptPassphrase('same', 'k')).not.toBe(encryptPassphrase('same', 'k'));
  });

  it(`rejects ciphertext longer than ${AES_MAX_CIPHERTEXT_LENGTH} characters, like the old decryptMsg`, () => {
    const long = encryptPassphrase('x'.repeat(600), 'k');

    expect(long.length).toBeGreaterThan(AES_MAX_CIPHERTEXT_LENGTH);
    expect(!decryptPassphrase(long, 'k').ok).toBe(true);
  });

  it.each(['', 'not base64 at all', 'U2FsdGVkX1+AAAA'])(
    'rejects malformed ciphertext %j',
    (input) => {
      const result = decryptPassphrase(input, 'k');

      expect(!result.ok && result.error.code).toBe('legacy.bad_ciphertext');
    },
  );

  it('rejects the wrong key', () => {
    const ciphertext = encryptPassphrase('{"a":1}', 'right');

    expect(decryptPassphrase(ciphertext, 'wrong').ok).toBe(false);
  });
});
