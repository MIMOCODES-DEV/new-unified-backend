import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { aesDecrypt, aesEncrypt } from './cryptojs-aes.js';
import { sameText, sign, tvV3Uid } from './legacy-signature.js';

const read = <T>(file: string): T =>
  JSON.parse(readFileSync(`test/fixtures/legacy/codecs/${file}`, 'utf8')) as T;

interface AesVector {
  server: string;
  version: string;
  deviceType: string;
  plaintext: string;
  ciphertext: string;
  roundTrips: boolean;
}
const aes = read<{ fakeKeys: Record<string, string>; aes: AesVector[] }>('aes.json');

describe('CryptoJS AES', () => {
  it('decrypts what the real old code encrypted (CAP-03 vectors)', () => {
    // Each backend maps its versions (old / V2 / V3) to the keys differently; every captured
    // ciphertext must decrypt with one of the fake keys to exactly its plaintext.
    const keys = Object.values(aes.fakeKeys);
    const vectors = aes.aes.filter((v) => v.ciphertext && v.plaintext.length <= 512);
    expect(vectors.length).toBeGreaterThan(0);
    for (const v of vectors) {
      const decrypted = keys.map((k) => aesDecrypt(v.ciphertext, k));
      expect(decrypted, `${v.server} ${v.version} ${v.deviceType}`).toContain(v.plaintext);
    }
  });

  it('encrypts so that the same key reads it back, and another key does not', () => {
    const text = JSON.stringify({ mac_address: 'aa:bb:cc:dd:ee:ff', note: 'Télé قناة' });
    const cipher = aesEncrypt(text, 'the-key');

    expect(cipher.startsWith('U2FsdGVk')).toBe(true); // "Salted__", like CryptoJS
    expect(aesDecrypt(cipher, 'the-key')).toBe(text);
    expect(aesDecrypt(cipher, 'other-key')).not.toBe(text);
  });

  it('returns null for garbage', () => {
    for (const bad of ['', 'not base64 at all', 'U2FsdGVkX1+AAAA']) {
      expect(aesDecrypt(bad, 'k')).toBeNull();
    }
  });
});

describe('legacy signatures', () => {
  const sig = read<{
    signatures: Record<
      string,
      { secret?: string; data?: string; signature?: string; mac?: string; u_id?: string }
    >;
    fakeKeys: Record<string, string>;
  }>('signatures.json');

  it('signs requests exactly like the old backends', () => {
    for (const name of ['androidV2', 'tvV3']) {
      const v = sig.signatures[name]!;
      expect(sign(v.secret!, v.data!), name).toBe(v.signature);
    }
  });

  it('computes the TV v3 u_id like the old backend', () => {
    const v = sig.signatures.tvV3Uid!;
    expect(tvV3Uid(sig.fakeKeys.TV_SIGNING_SECRET!, sig.fakeKeys.TV_AES_NEW_SECRET!, v.mac!)).toBe(
      v.u_id,
    );
  });

  it('compares texts safely', () => {
    expect(sameText('abc', ' abc ')).toBe(true);
    expect(sameText('abc', 'abd')).toBe(false);
    expect(sameText('abc', 'abcd')).toBe(false);
  });
});
