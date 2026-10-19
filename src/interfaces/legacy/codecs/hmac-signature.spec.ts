import { describe, expect, it } from 'vitest';
import { loadVectors } from './fixtures.spec-helper.js';
import { signRequest, tvV3Uid, verifyRequestSignature, verifyTvV3Uid } from './hmac-signature.js';

interface Vectors {
  fakeKeys: { TV_AES_NEW_SECRET: string; TV_SIGNING_SECRET: string };
  signatures: {
    androidV2: { secret: string; data: string; signature: string };
    tvV3: { secret: string; data: string; signature: string };
    tvV3Uid: { mac: string; u_id: string };
  };
}

const { fakeKeys, signatures } = loadVectors<Vectors>('signatures.json');

describe('legacy request signatures', () => {
  it.each([
    ['Android V2', signatures.androidV2],
    ['TV V3', signatures.tvV3],
  ])('%s: base64(HMAC-SHA256(secret, ciphertext)) matches the old code', (_name, s) => {
    expect(signRequest(s.secret, s.data)).toBe(s.signature);
    expect(verifyRequestSignature(s.secret, s.data, s.signature)).toBe(true);
    expect(verifyRequestSignature(s.secret, s.data, ` ${s.signature} `)).toBe(true); // old code trimmed
  });

  it('refuses a wrong, tampered or missing signature', () => {
    const s = signatures.androidV2;

    expect(verifyRequestSignature(s.secret, s.data + 'x', s.signature)).toBe(false);
    expect(verifyRequestSignature('other', s.data, s.signature)).toBe(false);
    expect(verifyRequestSignature(s.secret, s.data, '')).toBe(false);
    expect(verifyRequestSignature(s.secret, s.data, undefined)).toBe(false);
  });

  it('TV V3 u_id = base64(HMAC-SHA1(TV signing secret, lower(mac) + TV AES secret))', () => {
    const { mac, u_id } = signatures.tvV3Uid;

    expect(tvV3Uid(fakeKeys.TV_SIGNING_SECRET, fakeKeys.TV_AES_NEW_SECRET, mac)).toBe(u_id);
    expect(verifyTvV3Uid(fakeKeys.TV_SIGNING_SECRET, fakeKeys.TV_AES_NEW_SECRET, mac, u_id)).toBe(
      true,
    );
    expect(verifyTvV3Uid(fakeKeys.TV_SIGNING_SECRET, fakeKeys.TV_AES_NEW_SECRET, mac, 'nope')).toBe(
      false,
    );
  });
});
