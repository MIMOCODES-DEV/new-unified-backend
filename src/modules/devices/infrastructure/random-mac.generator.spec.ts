import { describe, expect, it } from 'vitest';
import { CryptoRandomMacGenerator } from './random-mac.generator.js';

describe('CryptoRandomMacGenerator', () => {
  it('produces locally administered unicast MACs that are different each time', () => {
    const generator = new CryptoRandomMacGenerator();
    const seen = new Set<string>();

    for (let i = 0; i < 500; i++) {
      const mac = generator.next().value;
      const firstByte = parseInt(mac.slice(0, 2), 16);
      expect(mac).toMatch(/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/);
      expect(firstByte & 0b10).toBe(0b10); // locally administered
      expect(firstByte & 0b01).toBe(0); // unicast
      seen.add(mac);
    }
    expect(seen.size).toBe(500);
  });
});
