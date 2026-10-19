import { describe, expect, it } from 'vitest';
import { loadVectors } from './fixtures.spec-helper.js';
import { decodeXorToken, encodeXorToken } from './xor-token.codec.js';

interface Vectors {
  tokens: (
    | { server: string; key: string; deviceId: string; mac: string; token: string }
    | { server: string; key: string; tamperedToken: string }
  )[];
}

const vectors = loadVectors<Vectors>('xor-token.json');
const valid = vectors.tokens.filter(
  (t): t is Extract<Vectors['tokens'][number], { token: string }> => 'token' in t,
);

describe('legacy XOR device token', () => {
  describe('produces the same tokens as all three old backends', () => {
    for (const t of valid) {
      it(`${t.server}: ${t.deviceId}, ${t.mac}`, () => {
        expect(encodeXorToken(t.key, t.deviceId, t.mac)).toBe(t.token);
      });
    }
  });

  describe('decodes them back', () => {
    for (const t of valid) {
      it(`${t.server}: ${t.deviceId}`, () => {
        const result = decodeXorToken(t.key, t.token);

        if (!result.ok) throw result.error;
        expect(result.value).toEqual({ deviceId: t.deviceId, mac: t.mac });
      });
    }
  });

  it('rejects a tampered token instead of returning garbage like the old decoder', () => {
    for (const t of vectors.tokens.filter((x) => 'tamperedToken' in x)) {
      if (!('tamperedToken' in t)) continue;
      const result = decodeXorToken(t.key, t.tamperedToken);

      expect(!result.ok && result.error.code).toBe('legacy.bad_token');
    }
  });

  it('rejects a token made with another key', () => {
    const token = encodeXorToken('other-key', '665f1c2e9b1e8a0012345678', '00:1a:79:aa:bb:cc');

    const result = decodeXorToken('fake-token-key-123', token);

    expect(result.ok).toBe(false);
  });

  it('round-trips a UUID device id (new backend ids)', () => {
    const token = encodeXorToken('k', 'fe15f950-8ae8-45e8-8f95-35d97a26d5d5', 'aa:bb:21:8c:fd:6f');

    expect(decodeXorToken('k', token)).toEqual({
      ok: true,
      value: { deviceId: 'fe15f950-8ae8-45e8-8f95-35d97a26d5d5', mac: 'aa:bb:21:8c:fd:6f' },
    });
  });
});
