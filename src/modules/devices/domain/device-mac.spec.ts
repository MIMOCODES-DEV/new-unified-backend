import { describe, expect, it } from 'vitest';
import { MacAddress } from '../../../shared/kernel/mac-address.js';
import { isUsableMac, madeUpMac } from './device-mac.js';

const mac = (value: string) => {
  const parsed = MacAddress.parse(value);
  if (!parsed.ok) throw parsed.error;
  return parsed.value;
};

describe('isUsableMac', () => {
  it.each(['52:54:00:12:34:57', '52:54:00:12:34:58', '52:54:00:12:34:59', '00:00:00:00:00:00'])(
    'treats the fallback MAC %s as no MAC',
    (value) => {
      expect(isUsableMac(mac(value))).toBe(false);
    },
  );

  it('accepts a real MAC', () => {
    expect(isUsableMac(mac('00:1a:2b:3c:4d:5e'))).toBe(true);
  });
});

describe('madeUpMac', () => {
  it('gives the same MAC for the same id', () => {
    expect(madeUpMac('app-123').value).toBe(madeUpMac('app-123').value);
  });

  it('gives different MACs for different ids and attempts', () => {
    const macs = new Set([madeUpMac('app-123'), madeUpMac('app-124'), madeUpMac('app-123', 1)]);

    expect(new Set([...macs].map((m) => m.value)).size).toBe(3);
  });

  it('is a locally administered unicast MAC', () => {
    const firstByte = parseInt(madeUpMac('app-123').value.slice(0, 2), 16);

    expect(firstByte & 0x01).toBe(0);
    expect(firstByte & 0x02).toBe(2);
  });
});
