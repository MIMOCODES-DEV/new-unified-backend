import { beforeEach, describe, expect, it } from 'vitest';
import {
  InMemoryPaidDeviceRepository,
  InMemoryTrialDeviceRepository,
  InProcessDeviceLock,
  paidDevice,
  trialDevice,
} from '../../../../../test/support/device-fakes.js';
import { FixedClock } from '../../../../shared/kernel/clock.js';
import { MacAddress } from '../../../../shared/kernel/mac-address.js';
import { DeviceIdentity } from '../device-identity.js';
import { DeviceKeyGenerator } from '../ports/device-key-generator.js';
import { DeviceSettings } from '../ports/device-settings.js';
import { type RegisterDeviceInput, RegisterDeviceUseCase } from './register-device.use-case.js';

const now = new Date('2026-10-26T10:00:00Z');

const mac = (value: string) => {
  const parsed = MacAddress.parse(value);
  if (!parsed.ok) throw parsed.error;
  return parsed.value;
};

const call = (overrides: Partial<RegisterDeviceInput> = {}): RegisterDeviceInput => ({
  mac: mac('00:1A:2B:3C:4D:5E'),
  platform: 'samsung',
  appDeviceId: null,
  uid: null,
  ip: '198.51.100.20',
  appVersion: '1.2.0',
  apiVersion: 'legacy',
  ...overrides,
});

class Settings extends DeviceSettings {
  days = 7;
  trialDays() {
    return Promise.resolve(this.days);
  }
}

class CountingKeys extends DeviceKeyGenerator {
  private n = 0;
  next() {
    this.n += 1;
    return String(100000 + this.n);
  }
}

describe('RegisterDeviceUseCase (DEV-1)', () => {
  let trials: InMemoryTrialDeviceRepository;
  let paid: InMemoryPaidDeviceRepository;
  let settings: Settings;
  let register: RegisterDeviceUseCase;

  beforeEach(() => {
    trials = new InMemoryTrialDeviceRepository();
    paid = new InMemoryPaidDeviceRepository();
    settings = new Settings();
    const identity = new DeviceIdentity(trials, paid, new InProcessDeviceLock());
    register = new RegisterDeviceUseCase(
      identity,
      trials,
      paid,
      settings,
      new CountingKeys(),
      new FixedClock(now),
    );
  });

  it('makes a trial device for an unknown MAC, with the brand trial length', async () => {
    const result = await register.execute(call());

    expect(result.created).toBe(true);
    expect(result.found.paid).toBe(false);
    expect(result.found.device).toMatchObject({
      macAddress: '00:1a:2b:3c:4d:5e',
      platform: 'samsung',
      deviceKey: '100001',
      trialStartedAt: now,
      trialEndsAt: new Date('2026-11-02T23:59:59.999Z'),
      playlistCount: 0,
      firstPlaylistAt: null,
      parentPin: null,
      ip: '198.51.100.20',
      appVersion: '1.2.0',
    });
    expect(trials.items.size).toBe(1);
  });

  it('uses the brand setting for the trial length', async () => {
    settings.days = 3;

    const result = await register.execute(call());

    expect(!result.found.paid && result.found.device.trialEndsAt).toEqual(
      new Date('2026-10-29T23:59:59.999Z'),
    );
  });

  it('returns the same device on the next call and records the visit', async () => {
    const first = await register.execute(call());
    const second = await register.execute(
      call({ ip: '198.51.100.99', appVersion: '1.3.0', apiVersion: 'v4' }),
    );

    expect(second.created).toBe(false);
    expect(second.found.device.id).toBe(first.found.device.id);
    expect(trials.items.get(first.found.device.id)).toMatchObject({
      ip: '198.51.100.99',
      appVersion: '1.3.0',
      apiVersion: 'v4',
      lastSeenAt: now,
    });
  });

  it('never gives a second trial to a device whose trial ended', async () => {
    const ended = trialDevice({ trialEndsAt: new Date('2026-10-01T23:59:59.999Z') });
    await trials.insert(ended);

    const result = await register.execute(call());

    expect(result.created).toBe(false);
    expect(result.found.device.id).toBe(ended.id);
    expect(!result.found.paid && result.found.device.trialEndsAt).toEqual(ended.trialEndsAt);
    expect(trials.items.size).toBe(1);
  });

  it('returns a paid device as paid, without a trial', async () => {
    await paid.insert(paidDevice({ macAddress: '00:1a:2b:3c:4d:5e' }));

    const result = await register.execute(call());

    expect(result.created).toBe(false);
    expect(result.found.paid).toBe(true);
    expect(paid.items.get('paid-1')?.lastSeenAt).toEqual(now);
    expect(trials.items.size).toBe(0);
  });

  it('makes one device when many calls for a new MAC arrive together', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => register.execute(call())));

    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.found.device.id)).size).toBe(1);
    expect(trials.items.size).toBe(1);
  });
});
