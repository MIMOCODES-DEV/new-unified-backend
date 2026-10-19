import { describe, expect, it } from 'vitest';
import { MacAddress } from '../../../shared/kernel/mac-address.js';
import { parseAppType } from './app-type.js';
import { Device } from './device.entity.js';
import { License } from './license.js';

const NOW = new Date('2026-10-19T10:00:00Z');

function newDevice(deviceKey = '123456') {
  const mac = MacAddress.parse('aa:bb:cc:dd:ee:ff');
  const trial = License.startTrial(7, NOW);
  if (!mac.ok || !trial.ok) throw new Error('bad test setup');
  return Device.register({
    id: 'd1',
    mac: mac.value,
    appType: 'samsung',
    deviceKey,
    trial: trial.value,
    now: NOW,
  });
}

function registered(): Device {
  const result = newDevice();
  if (!result.ok) throw result.error;
  return result.value;
}

describe('Device', () => {
  it('registers as pending with a trial', () => {
    const device = registered();

    expect(device.state).toBe('pending');
    expect(device.license.type).toBe('trial');
    expect(device.isActive(NOW)).toBe(true);
  });

  it('refuses a device key that is not 6 digits', () => {
    for (const key of ['12345', '1234567', '012345', 'abcdef']) {
      const result = newDevice(key);
      expect(!result.ok && result.error.code).toBe('devices.invalid_device_key');
    }
  });

  it('becomes active when it gets a paid license (yearly or lifetime)', () => {
    const yearly = registered();
    const lifetime = registered();

    yearly.extendYearly(NOW);
    lifetime.makeLifetime();

    expect(yearly.state).toBe('active');
    expect(lifetime.state).toBe('active');
  });

  it('passes license errors through: lifetime twice is refused', () => {
    const device = registered();
    device.makeLifetime();

    const again = device.makeLifetime();

    expect(!again.ok && again.error.code).toBe('licenses.already_lifetime');
  });

  it('revoking makes the device inactive', () => {
    const device = registered();
    device.revoke();

    expect(device.isActive(NOW)).toBe(false);
  });
});

describe('parseAppType', () => {
  it('accepts any case, stores lowercase, and maps the old androidtv spelling', () => {
    expect([parseAppType('iOS'), parseAppType(' Samsung '), parseAppType('androidtv')]).toEqual([
      { ok: true, value: 'ios' },
      { ok: true, value: 'samsung' },
      { ok: true, value: 'android_tv' },
    ]);
  });

  it('refuses an unknown app type', () => {
    expect(parseAppType('toaster').ok).toBe(false);
  });
});
