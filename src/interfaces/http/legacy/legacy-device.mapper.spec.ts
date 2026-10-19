import { describe, expect, it } from 'vitest';
import { Device } from '../../../modules/devices/domain/device.entity.js';
import { License } from '../../../modules/devices/domain/license.js';
import { MacAddress } from '../../../shared/kernel/mac-address.js';
import {
  isV4Locked,
  legacyDeviceInfo,
  legacyExpireDate,
  legacyIsTrial,
} from './legacy-device.mapper.js';

const NOW = new Date('2026-10-19T10:00:00Z');

function device(uid: string | null = null): Device {
  const mac = MacAddress.parse('aa:bb:cc:dd:ee:ff');
  const trial = License.startTrial(7, NOW);
  if (!mac.ok || !trial.ok) throw new Error('bad test setup');
  const result = Device.register({
    id: 'd1',
    mac: mac.value,
    appType: 'samsung',
    deviceKey: '123456',
    uid,
    trial: trial.value,
    now: NOW,
  });
  if (!result.ok) throw result.error;
  return result.value;
}

describe('legacy device mapper', () => {
  it('sends the old numbers: trial 0, yearly 3, lifetime 2, revoked 1', () => {
    const d = device();
    expect(legacyIsTrial(d)).toBe(0);
    d.extendYearly(NOW);
    expect(legacyIsTrial(d)).toBe(3);
    d.revoke();
    expect(legacyIsTrial(d)).toBe(1);
    d.makeLifetime();
    expect(legacyIsTrial(d)).toBe(2);
    expect(legacyExpireDate(d)).toBe('2438-11-01');
  });

  it('marks a new device as not registered yet, a known one as registered', () => {
    const d = device();

    expect(legacyDeviceInfo(d, { created: true, trialDays: 7, ip: '1.2.3.4' })).toMatchObject({
      mac_registered: false,
      mac_address: 'aa:bb:cc:dd:ee:ff',
      device_key: '123456',
      is_trial: 0,
      expire_date: '2026-10-26',
      trial_days: 7,
    });
    expect(legacyDeviceInfo(d, { created: false, trialDays: 7, ip: '' }).mac_registered).toBe(true);
  });

  it('always sends at least one playlist (old apps crash on an empty list)', () => {
    expect(legacyDeviceInfo(device(), { created: true, trialDays: 7, ip: '' }).urls).toHaveLength(
      1,
    );
  });

  it('locks devices that logged in with V4 out of the older routes', () => {
    expect(isV4Locked(device())).toBe(false);
    expect(isV4Locked(device('ACDE13'))).toBe(true);
  });
});
