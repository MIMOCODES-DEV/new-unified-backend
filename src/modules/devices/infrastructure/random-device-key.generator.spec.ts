import { describe, expect, it } from 'vitest';
import { RandomDeviceKeyGenerator } from './random-device-key.generator.js';

describe('RandomDeviceKeyGenerator', () => {
  it('always produces 6 digits without a leading zero', () => {
    const generator = new RandomDeviceKeyGenerator();

    for (let i = 0; i < 1000; i++) {
      expect(generator.next()).toMatch(/^[1-9]\d{5}$/);
    }
  });
});
