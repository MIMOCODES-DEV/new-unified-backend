import { describe, expect, it } from 'vitest';
import { MacAddress } from '../../../shared/kernel/mac-address.js';
import { AppType } from './app-type.js';
import { Device } from './device.entity.js';
import { Uid } from './uid.js';

const mac = (() => {
  const r = MacAddress.parse('AA:BB:CC:DD:EE:01');
  if (!r.ok) throw r.error;
  return r.value;
})();
const app = (() => {
  const r = AppType.parse('samsung');
  if (!r.ok) throw r.error;
  return r.value;
})();
const now = new Date('2026-10-19T10:00:00Z');
const later = new Date('2026-10-21T08:30:00Z');

const trial = () =>
  Device.registerTrial({ id: 'd1', macAddress: mac, appType: app, deviceKey: '123456', now });

describe('Device', () => {
  it('starts as a pending 7-day trial', () => {
    const device = trial();

    expect(device.state).toBe('pending');
    expect(device.isPaid).toBe(false);
    expect(device.trialExpiresAt).toEqual(new Date('2026-10-26T10:00:00Z'));
    expect(device.createdAt).toEqual(now);
    expect(device.lastSeenAt).toEqual(now);
    expect(device.activatedAt).toBeNull();
    expect(device.isTrialExpired(now)).toBe(false);
    expect(device.isTrialExpired(new Date('2026-10-26T10:00:00Z'))).toBe(true);
  });

  it('records a visit without touching the trial', () => {
    const device = trial();

    device.recordVisit(later);

    expect(device.lastSeenAt).toEqual(later);
    expect(device.trialExpiresAt).toEqual(new Date('2026-10-26T10:00:00Z'));
  });

  it('becomes paid on activation, keeping id, key and trial date', () => {
    const device = trial();

    expect(device.activate(later)).toBe(true);
    expect(device.state).toBe('paid');
    expect(device.isPaid).toBe(true);
    expect(device.activatedAt).toEqual(later);
    expect(device.id).toBe('d1');
    expect(device.deviceKey).toBe('123456');
    expect(device.trialExpiresAt).toEqual(new Date('2026-10-26T10:00:00Z'));
  });

  it('does not activate twice', () => {
    const device = trial();
    device.activate(later);

    expect(device.activate(new Date('2026-12-01T00:00:00Z'))).toBe(false);
    expect(device.activatedAt).toEqual(later);
  });

  it('starts with no u_id and not V4-verified unless given', () => {
    const plain = trial();
    const uid = Uid.parse('ab12cd');
    if (!uid.ok) throw uid.error;
    const v4 = Device.registerTrial({
      id: 'd2',
      macAddress: mac,
      appType: app,
      deviceKey: '222222',
      now,
      uid: uid.value,
      v4Verified: true,
    });

    expect(plain.uid).toBeNull();
    expect(plain.v4Verified).toBe(false);
    expect(v4.uid?.value).toBe('AB12CD');
    expect(v4.v4Verified).toBe(true);
  });

  it('adopts a u_id only when it has none, and can replace it after a recovery', () => {
    const device = trial();
    const first = Uid.parse('AAAAAA');
    const second = Uid.parse('BBBBBB');
    if (!first.ok || !second.ok) throw new Error('bad fixture');

    expect(device.adoptUidIfMissing(first.value)).toBe(true);
    expect(device.adoptUidIfMissing(second.value)).toBe(false);
    expect(device.uid?.value).toBe('AAAAAA');

    device.replaceUid(second.value);
    expect(device.uid?.value).toBe('BBBBBB');
  });

  it('remembers that it passed the V4 registration captcha', () => {
    const device = trial();

    device.markV4Verified();

    expect(device.v4Verified).toBe(true);
  });
});
