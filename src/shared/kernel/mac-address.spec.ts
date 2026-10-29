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

  it('accepts letters past F, as apps that make up a MAC send them', () => {
    const result = MacAddress.parse('FL:2A:82:43:3E:EF');

    expect(result.ok && result.value.toString()).toBe('fl:2a:82:43:3e:ef');
  });

  it.each(['', 'aa:bb:cc:dd:ee', 'aa:bb:cc:dd:ee:f!', 'aa:bb:cc:dd:ee:ff:00', '{"$ne":"x"}'])(
    'rejects %s',
    (input) => {
      const result = MacAddress.parse(input);

      expect(!result.ok && result.error.code).toBe('kernel.invalid_mac_address');
    },
  );
});
