import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeDeviceToken, encodeDeviceToken } from './xor-device-token.js';

interface TokenVector {
  server: string;
  key: string;
  deviceId?: string;
  mac?: string;
  token?: string;
  tamperedToken?: string;
}

const { tokens } = JSON.parse(
  readFileSync('test/fixtures/legacy/codecs/xor-token.json', 'utf8'),
) as { tokens: TokenVector[] };

describe('XOR device token', () => {
  it('makes exactly the tokens the old backends made (CAP-03 vectors)', () => {
    for (const v of tokens.filter((t) => t.token && t.deviceId && t.mac)) {
      expect(encodeDeviceToken(v.key, v.deviceId!, v.mac!), v.server).toBe(v.token);
    }
  });

  it('reads old tokens back, with the MAC normalized', () => {
    for (const v of tokens.filter((t) => t.token && t.deviceId && t.mac)) {
      expect(decodeDeviceToken(v.key, v.token!)).toEqual({
        deviceId: v.deviceId,
        mac: v.mac!.toLowerCase().replace(/-/g, ':'),
      });
    }
  });

  it('refuses tampered tokens and tokens made with another key', () => {
    for (const v of tokens.filter((t) => t.tamperedToken)) {
      expect(decodeDeviceToken(v.key, v.tamperedToken!)).toBeNull();
    }
    const token = encodeDeviceToken('the-right-key', 'abc', 'aa:bb:cc:dd:ee:ff');
    expect(decodeDeviceToken('another-key', token)).toBeNull();
  });
});
