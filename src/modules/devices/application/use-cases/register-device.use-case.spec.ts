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
import { madeUpMac } from '../../domain/device-mac.js';
import type { ReviewBuild } from '../../domain/review-build.js';
import { DeviceIdentity } from '../device-identity.js';
import { DeviceKeyGenerator } from '../ports/device-key-generator.js';
import { DeviceSettings } from '../ports/device-settings.js';
import {
  type RegisterDeviceInput,
  type RegisterDeviceOutput,
  RegisterDeviceUseCase,
} from './register-device.use-case.js';

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
  builds: ReviewBuild[] = [];
  trialDays() {
    return Promise.resolve(this.days);
  }
  reviewBuilds() {
    return Promise.resolve(this.builds);
  }
  maxMacSwitches() {
    return Promise.resolve(1);
  }
}

class CountingKeys extends DeviceKeyGenerator {
  private n = 0;
  next() {
    this.n += 1;
    return String(100000 + this.n);
  }
}

describe('RegisterDeviceUseCase (DEV-1, DEV-2)', () => {
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

  /** Runs the use case and fails the test on an error result. */
  const run = async (input: RegisterDeviceInput): Promise<RegisterDeviceOutput> => {
    const result = await register.execute(input);
    if (!result.ok) throw result.error;
    return result.value;
  };

  it('makes a trial device for an unknown MAC, with the brand trial length', async () => {
    const result = await run(call());

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
      parentPin: '0000',
      ip: '198.51.100.20',
      appVersion: '1.2.0',
    });
    expect(trials.items.size).toBe(1);
  });

  it('uses the brand setting for the trial length', async () => {
    settings.days = 3;

    const result = await run(call());

    expect(!result.found.paid && result.found.device.trialEndsAt).toEqual(
      new Date('2026-10-29T23:59:59.999Z'),
    );
  });

  it('returns the same device on the next call and records the visit', async () => {
    const first = await run(call());
    const second = await run(call({ ip: '198.51.100.99', appVersion: '1.3.0', apiVersion: 'v4' }));

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

    const result = await run(call());

    expect(result.created).toBe(false);
    expect(result.found.device.id).toBe(ended.id);
    expect(!result.found.paid && result.found.device.trialEndsAt).toEqual(ended.trialEndsAt);
    expect(trials.items.size).toBe(1);
  });

  it('returns a paid device as paid, without a trial', async () => {
    await paid.insert(paidDevice({ macAddress: '00:1a:2b:3c:4d:5e' }));

    const result = await run(call());

    expect(result.created).toBe(false);
    expect(result.found.paid).toBe(true);
    expect(paid.items.get('paid-1')?.lastSeenAt).toEqual(now);
    expect(trials.items.size).toBe(0);
  });

  it('makes one device when many calls for a new MAC arrive together', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => run(call())));

    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.found.device.id)).size).toBe(1);
    expect(trials.items.size).toBe(1);
  });

  describe('without a usable MAC (DEV-2)', () => {
    it('makes up a MAC from the app device id and finds the device again by that id', async () => {
      const first = await run(call({ mac: null, appDeviceId: 'app-123' }));
      const second = await run(call({ mac: null, appDeviceId: 'app-123', ip: '198.51.100.99' }));

      expect(first.created).toBe(true);
      expect(first.found.device).toMatchObject({
        macAddress: madeUpMac('app-123').value,
        appDeviceId: 'app-123',
      });
      expect(second.created).toBe(false);
      expect(second.found.device.id).toBe(first.found.device.id);
      expect(second.found.device.ip).toBe('198.51.100.99');
    });

    it.each(['52:54:00:12:34:57', '52:54:00:12:34:58', '52:54:00:12:34:59', '00:00:00:00:00:00'])(
      'never shares a device between two apps on the fallback MAC %s',
      async (fallback) => {
        const a = await run(call({ mac: mac(fallback), appDeviceId: 'app-a' }));
        const b = await run(call({ mac: mac(fallback), appDeviceId: 'app-b' }));

        expect(a.created && b.created).toBe(true);
        expect(a.found.device.id).not.toBe(b.found.device.id);
        expect([a, b].map((r) => r.found.device.macAddress)).not.toContain(fallback);
      },
    );

    it('does not match a device stored under a fallback MAC', async () => {
      await trials.insert(trialDevice({ id: 'shared', macAddress: '52:54:00:12:34:57' }));

      const result = await run(call({ mac: mac('52:54:00:12:34:57'), appDeviceId: 'app-a' }));

      expect(result.created).toBe(true);
      expect(result.found.device.id).not.toBe('shared');
    });

    it('finds a device by uid when there is no MAC and no app device id', async () => {
      await paid.insert(paidDevice({ uid: 'uid-9' }));

      const result = await run(call({ mac: null, uid: 'uid-9' }));

      expect(result.created).toBe(false);
      expect(result.found.paid && result.found.device.id).toBe('paid-1');
    });

    it('makes a device from the uid when that is all it has', async () => {
      const result = await run(call({ mac: null, uid: 'uid-9' }));

      expect(result.created).toBe(true);
      expect(result.found.device.macAddress).toBe(madeUpMac('uid-9').value);
    });

    it('refuses a call with no usable MAC, no app device id and no uid', async () => {
      const result = await register.execute(call({ mac: mac('52:54:00:12:34:57') }));

      expect(!result.ok && result.error.code).toBe('devices.device_id_missing');
      expect(trials.items.size).toBe(0);
    });

    it('takes the next made-up MAC when another device already has the first one', async () => {
      await trials.insert(trialDevice({ id: 'other', macAddress: madeUpMac('app-123').value }));

      const result = await run(call({ mac: null, appDeviceId: 'app-123' }));

      expect(result.created).toBe(true);
      expect(result.found.device.macAddress).toBe(madeUpMac('app-123', 1).value);
    });

    it('makes one device when many calls with one app device id arrive together', async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, () => run(call({ mac: null, appDeviceId: 'app-123' }))),
      );

      expect(results.filter((r) => r.created)).toHaveLength(1);
      expect(trials.items.size).toBe(1);
    });
  });

  describe('one device for every app on a MAC (DEV-3)', () => {
    it('gives IBO Player, Pro and TV on one MAC the same device; appVersion is the last caller', async () => {
      const player = await run(call({ appVersion: 'iboplayer 1.9' }));
      const pro = await run(call({ appVersion: 'iboproplayer 2.1' }));
      const tv = await run(call({ appVersion: 'iboplayertv 3.0' }));

      expect(new Set([player, pro, tv].map((r) => r.found.device.id)).size).toBe(1);
      expect(trials.items.size).toBe(1);
      expect(trials.items.get(player.found.device.id)?.appVersion).toBe('iboplayertv 3.0');
    });

    it('lets a device that is not V4 yet take the caller platform', async () => {
      await trials.insert(trialDevice({ platform: 'android', apiVersion: 'legacy' }));

      const result = await run(call({ platform: 'samsung' }));

      expect(result.found.device.platform).toBe('samsung');
      expect(trials.items.get('trial-1')?.platform).toBe('samsung');
    });

    it('fills in the platform of an old row that had none', async () => {
      await paid.insert(
        paidDevice({ macAddress: '00:1a:2b:3c:4d:5e', platform: 'unknown', apiVersion: 'v4' }),
      );

      const result = await run(call({ platform: 'lg', apiVersion: 'v4' }));

      expect(result.found.device.platform).toBe('lg');
    });

    it('refuses a V4 device called as another platform and changes nothing', async () => {
      await trials.insert(
        trialDevice({ platform: 'android', apiVersion: 'v4', ip: '203.0.113.7' }),
      );

      const result = await register.execute(call({ platform: 'samsung', apiVersion: 'v4' }));

      expect(!result.ok && result.error.code).toBe('devices.platform_mismatch');
      expect(trials.items.get('trial-1')).toMatchObject({ platform: 'android', ip: '203.0.113.7' });
    });
  });

  describe('V4 lock and store-review builds (DEV-6)', () => {
    it('refuses an old entry point for a device that used V4, and changes nothing', async () => {
      await trials.insert(trialDevice({ apiVersion: 'v4', ip: '203.0.113.7' }));

      const result = await register.execute(call({ apiVersion: 'legacy' }));

      expect(!result.ok && result.error.code).toBe('devices.older_api_refused');
      expect(trials.items.get('trial-1')).toMatchObject({ apiVersion: 'v4', ip: '203.0.113.7' });
    });

    it('lets a legacy device move up to V4', async () => {
      await trials.insert(trialDevice({ apiVersion: 'legacy' }));

      const result = await run(call({ apiVersion: 'v4' }));

      expect(result.found.device.apiVersion).toBe('v4');
    });

    it('flags a call from a build in review, matched on exact platform and version', async () => {
      settings.builds = [{ platform: 'samsung', version: '1.2.0' }];

      const review = await run(call({ platform: 'samsung', appVersion: '1.2.0' }));
      const newer = await run(call({ platform: 'samsung', appVersion: '1.2.1' }));

      expect(review.reviewBuild).toBe(true);
      expect(newer.reviewBuild).toBe(false);
    });

    it('flags nothing with no review builds (the default)', async () => {
      const result = await run(call());

      expect(result.reviewBuild).toBe(false);
    });

    it('does not flag the same version on another platform', async () => {
      settings.builds = [{ platform: 'samsung', version: '1.2.0' }];

      const result = await run(call({ platform: 'lg', appVersion: '1.2.0' }));

      expect(result.reviewBuild).toBe(false);
    });
  });
});
