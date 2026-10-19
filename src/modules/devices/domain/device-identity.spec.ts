import { describe, expect, it } from 'vitest';
import { MacAddress } from '../../../shared/kernel/mac-address.js';
import { AppDeviceId, isSharedFallbackMac } from './device-identity.js';

const mac = (input: string) => {
  const r = MacAddress.parse(input);
  if (!r.ok) throw r.error;
  return r.value;
};

describe('device identity', () => {
  it.each(['52:54:00:12:34:56', '52:54:00:12:34:57', '52:54:00:12:34:59', '52-54-00-12-34-57'])(
    'treats %s as a MAC many devices share (BobPlayer/CRPlayer/emulator fallbacks)',
    (input) => {
      expect(isSharedFallbackMac(mac(input))).toBe(true);
    },
  );

  it('does not treat a normal MAC as shared', () => {
    expect(isSharedFallbackMac(mac('00:1a:79:aa:bb:cc'))).toBe(false);
  });

  it('accepts an app_device_id and trims it', () => {
    const result = AppDeviceId.parse('  8f2c1a77-tv-ABC ');

    expect(result.ok && result.value.value).toBe('8f2c1a77-tv-ABC');
  });

  it.each(['', '   ', 'x'.repeat(129), 'has\nnewline', 42, null, undefined])(
    'rejects app_device_id %j',
    (input) => {
      const result = AppDeviceId.parse(input);

      expect(!result.ok && result.error.code).toBe('devices.invalid_app_device_id');
    },
  );
});
