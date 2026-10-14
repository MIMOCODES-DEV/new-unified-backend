import { describe, expect, it } from 'vitest';
import { MacAddress } from './mac-address.js';

describe('MacAddress', () => {
  it.each([
    'AA:BB:CC:DD:EE:FF',
    'aa-bb-cc-dd-ee-ff',
    'aabbccddeeff',
    'AABB.CCDD.EEFF',
    '  aa:bb:cc:dd:ee:ff  ',
  ])('normalizes %s', (input) => {
    const result = MacAddress.parse(input);

    expect(result.ok && result.value.toString()).toBe('aa:bb:cc:dd:ee:ff');
  });

  it.each(['', 'aa:bb:cc:dd:ee', 'gg:bb:cc:dd:ee:ff', 'aa:bb:cc:dd:ee:ff:00', '{"$ne":"x"}'])(
    'rejects %s',
    (input) => {
      const result = MacAddress.parse(input);

      expect(!result.ok && result.error.code).toBe('kernel.invalid_mac_address');
    },
  );
});
