import { beforeEach, describe, expect, it } from 'vitest';
import {
  InMemoryPaidDeviceRepository,
  InMemoryTrialDeviceRepository,
  InProcessDeviceLock,
  paidDevice,
  trialDevice,
} from '../../../../test/support/device-fakes.js';
import { MacAddress } from '../../../shared/kernel/mac-address.js';
import { DeviceIdentity, type PaidDeviceFields } from './device-identity.js';

const mac = (value: string) => {
  const parsed = MacAddress.parse(value);
  if (!parsed.ok) throw parsed.error;
  return parsed.value;
};

const paying: PaidDeviceFields = {
  currentLicenseId: 'license-1',
  activatedAt: new Date('2026-10-26T09:00:00Z'),
  resellerId: 'reseller-7',
  customerId: null,
};

describe('DeviceIdentity (one MAC, one device)', () => {
  let trials: InMemoryTrialDeviceRepository;
  let paid: InMemoryPaidDeviceRepository;
  let lock: InProcessDeviceLock;
  let identity: DeviceIdentity;

  beforeEach(() => {
    trials = new InMemoryTrialDeviceRepository();
    paid = new InMemoryPaidDeviceRepository();
    lock = new InProcessDeviceLock();
    identity = new DeviceIdentity(trials, paid, lock);
  });

  describe('claimTrial', () => {
    it('saves a new device when its MAC is in neither collection', async () => {
      const result = await identity.claimTrial(trialDevice());

      expect(result.created).toBe(true);
      expect(trials.items.size).toBe(1);
    });

    it('creates exactly one device when ten sign-ups for one MAC arrive together', async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          identity.claimTrial(trialDevice({ id: `trial-${i}` })),
        ),
      );

      expect(results.filter((r) => r.created)).toHaveLength(1);
      expect(trials.items.size).toBe(1);
      expect(new Set(results.map((r) => r.found.device.id)).size).toBe(1);
    });

    it('returns the paid device instead of creating a trial for a MAC that already paid', async () => {
      await paid.insert(paidDevice({ macAddress: '00:1a:2b:3c:4d:5e' }));

      const result = await identity.claimTrial(trialDevice());

      expect(result.created).toBe(false);
      expect(result.found.paid).toBe(true);
      expect(trials.items.size).toBe(0);
    });

    it('refuses to run without the lock (Redis down), while lookups still work', async () => {
      await trials.insert(trialDevice());
      lock.unavailable = true;

      await expect(
        identity.claimTrial(trialDevice({ id: 'trial-2', macAddress: '00:1a:2b:3c:4d:99' })),
      ).rejects.toThrow();
      expect((await identity.findByMac(mac('00:1a:2b:3c:4d:5e')))?.device.id).toBe('trial-1');
    });
  });

  describe('moveToPaid', () => {
    it('moves the device to devices with the same id, MAC and device key', async () => {
      const trial = trialDevice();
      await trials.insert(trial);

      const result = await identity.moveToPaid(trial.id, paying);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toMatchObject({
        id: trial.id,
        macAddress: trial.macAddress,
        deviceKey: trial.deviceKey,
        currentLicenseId: 'license-1',
        resellerId: 'reseller-7',
      });
      expect(result.value).not.toHaveProperty('trialEndsAt');
      expect(trials.items.size).toBe(0);
      expect(paid.items.size).toBe(1);
    });

    it('finishes a move that stopped after writing to devices', async () => {
      const trial = trialDevice();
      await trials.insert(trial);
      await paid.insert(paidDevice({ id: trial.id, macAddress: trial.macAddress }));

      const result = await identity.moveToPaid(trial.id, paying);

      expect(result.ok).toBe(true);
      expect(trials.items.size).toBe(0);
      expect(paid.items.size).toBe(1);
    });

    it('finds a device caught mid-move as paid', async () => {
      const trial = trialDevice();
      await trials.insert(trial);
      await paid.insert(paidDevice({ id: trial.id, macAddress: trial.macAddress }));

      expect((await identity.findByMac(mac(trial.macAddress)))?.paid).toBe(true);
    });

    it('reports a device that does not exist', async () => {
      const result = await identity.moveToPaid('missing', paying);

      expect(!result.ok && result.error.code).toBe('devices.not_found');
    });
  });

  describe('changeMac', () => {
    it('gives a paid device a free MAC and keeps everything else', async () => {
      const device = paidDevice();
      await paid.insert(device);

      const result = await identity.changeMac(device.id, mac('AA:BB:CC:DD:EE:01'), (d) => d);

      expect(result.ok && result.value).toMatchObject({
        id: device.id,
        macAddress: 'aa:bb:cc:dd:ee:01',
      });
      expect(paid.items.get(device.id)?.macAddress).toBe('aa:bb:cc:dd:ee:01');
    });

    it('refuses a MAC that a trial or paid device already has', async () => {
      await paid.insert(paidDevice());
      await trials.insert(trialDevice({ macAddress: 'aa:bb:cc:dd:ee:02' }));

      const result = await identity.changeMac('paid-1', mac('aa:bb:cc:dd:ee:02'), (d) => d);

      expect(!result.ok && result.error.code).toBe('devices.mac_in_use');
    });

    it('lets only one of two devices take the same free MAC at once', async () => {
      await paid.insert(paidDevice({ id: 'a', macAddress: '00:00:00:00:00:0a' }));
      await paid.insert(paidDevice({ id: 'b', macAddress: '00:00:00:00:00:0b' }));
      const target = mac('00:00:00:00:00:ff');

      const results = await Promise.all([
        identity.changeMac('a', target, (d) => d),
        identity.changeMac('b', target, (d) => d),
      ]);

      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect([...paid.items.values()].filter((d) => d.macAddress === target.value)).toHaveLength(1);
    });
  });
});
