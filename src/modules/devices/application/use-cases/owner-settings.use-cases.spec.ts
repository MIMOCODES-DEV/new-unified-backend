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
import { DeviceIdentity, type PaidDeviceFields } from '../device-identity.js';
import { DeviceKeyGenerator } from '../ports/device-key-generator.js';
import { ChangeDeviceKeyUseCase } from './change-device-key.use-case.js';
import { SetParentPinUseCase } from './set-parent-pin.use-case.js';
import { VerifyDeviceKeyUseCase } from './verify-device-key.use-case.js';

const now = new Date('2026-10-26T10:00:00Z');

const mac = (value: string) => {
  const parsed = MacAddress.parse(value);
  if (!parsed.ok) throw parsed.error;
  return parsed.value;
};

class FixedKeys extends DeviceKeyGenerator {
  next() {
    return '777777';
  }
}

describe('Device key and parent PIN (DEV-5)', () => {
  let trials: InMemoryTrialDeviceRepository;
  let paid: InMemoryPaidDeviceRepository;
  let identity: DeviceIdentity;
  let changeKey: ChangeDeviceKeyUseCase;
  let verifyKey: VerifyDeviceKeyUseCase;
  let setPin: SetParentPinUseCase;

  beforeEach(async () => {
    trials = new InMemoryTrialDeviceRepository();
    paid = new InMemoryPaidDeviceRepository();
    identity = new DeviceIdentity(trials, paid, new InProcessDeviceLock());
    const clock = new FixedClock(now);
    changeKey = new ChangeDeviceKeyUseCase(identity, new FixedKeys(), clock);
    verifyKey = new VerifyDeviceKeyUseCase(identity);
    setPin = new SetParentPinUseCase(identity, clock);
    await trials.insert(trialDevice({ deviceKey: '123456', parentPin: null }));
  });

  describe('device key', () => {
    it('logs in with the MAC and the right key', async () => {
      const result = await verifyKey.execute({ mac: mac('00:1a:2b:3c:4d:5e'), key: '123456' });

      expect(result.ok && result.value.device.id).toBe('trial-1');
    });

    it('gives the same error for a wrong key and an unknown MAC', async () => {
      const wrongKey = await verifyKey.execute({ mac: mac('00:1a:2b:3c:4d:5e'), key: '000000' });
      const unknownMac = await verifyKey.execute({ mac: mac('00:00:00:00:00:01'), key: '123456' });

      expect(!wrongKey.ok && wrongKey.error.code).toBe('devices.device_key_mismatch');
      expect(!unknownMac.ok && unknownMac.error.code).toBe('devices.device_key_mismatch');
    });

    it('changes the key to the owner choice; the old key stops working', async () => {
      const changed = await changeKey.execute({ deviceId: 'trial-1', key: '654321' });

      expect(changed.ok && changed.value.deviceKey).toBe('654321');
      expect((await verifyKey.execute({ mac: mac('00:1a:2b:3c:4d:5e'), key: '123456' })).ok).toBe(
        false,
      );
      expect((await verifyKey.execute({ mac: mac('00:1a:2b:3c:4d:5e'), key: '654321' })).ok).toBe(
        true,
      );
      expect(trials.items.get('trial-1')?.updatedAt).toEqual(now);
    });

    it('makes a new random key when the owner gives none', async () => {
      const changed = await changeKey.execute({ deviceId: 'trial-1', key: null });

      expect(changed.ok && changed.value.deviceKey).toBe('777777');
      expect(trials.items.get('trial-1')?.deviceKey).toBe('777777');
    });

    it.each(['12345', '1234567', 'abcdef', ''])('refuses the key "%s"', async (key) => {
      const changed = await changeKey.execute({ deviceId: 'trial-1', key });

      expect(!changed.ok && changed.error.code).toBe('devices.invalid_device_key');
      expect(trials.items.get('trial-1')?.deviceKey).toBe('123456');
    });

    it('allows two devices with the same key: it is always checked with the MAC', async () => {
      await paid.insert(paidDevice({ deviceKey: '123456' }));

      const result = await verifyKey.execute({ mac: mac('00:1a:2b:3c:4d:5f'), key: '123456' });

      expect(result.ok && result.value.device.id).toBe('paid-1');
    });

    it('reports a device that does not exist', async () => {
      const changed = await changeKey.execute({ deviceId: 'missing', key: '654321' });

      expect(!changed.ok && changed.error.code).toBe('devices.not_found');
    });
  });

  describe('parent PIN', () => {
    it('turns parental control back on with a new PIN, returned as entered', async () => {
      await setPin.execute({ deviceId: 'trial-1', pin: null });

      const result = await setPin.execute({ deviceId: 'trial-1', pin: '0420' });

      expect(result.ok && result.value.parentPin).toBe('0420');
      expect(trials.items.get('trial-1')?.parentPin).toBe('0420');
    });

    it('sets a PIN and returns it as entered', async () => {
      const result = await setPin.execute({ deviceId: 'trial-1', pin: '0420' });

      expect(result.ok && result.value.parentPin).toBe('0420');
      expect(trials.items.get('trial-1')?.parentPin).toBe('0420');
    });

    it('changes the PIN of a paid device', async () => {
      await paid.insert(paidDevice({ parentPin: '0000' }));

      await setPin.execute({ deviceId: 'paid-1', pin: '1234' });

      expect(paid.items.get('paid-1')?.parentPin).toBe('1234');
    });

    it.each([null, ''])('turns parental control off when given %j', async (pin) => {
      await setPin.execute({ deviceId: 'trial-1', pin: '0420' });

      const result = await setPin.execute({ deviceId: 'trial-1', pin });

      expect(result.ok && result.value.parentPin).toBeNull();
      expect(trials.items.get('trial-1')?.parentPin).toBeNull();
    });

    it.each(['123', '12345', 'abcd'])('refuses the PIN "%s"', async (pin) => {
      const result = await setPin.execute({ deviceId: 'trial-1', pin });

      expect(!result.ok && result.error.code).toBe('devices.invalid_parent_pin');
    });
  });

  it('keeps a change made while the device moves to devices', async () => {
    const paying: PaidDeviceFields = {
      currentLicenseId: 'license-1',
      activatedAt: now,
      resellerId: null,
      customerId: null,
    };

    await Promise.all([
      identity.moveToPaid('trial-1', paying),
      setPin.execute({ deviceId: 'trial-1', pin: '4321' }),
    ]);

    expect(trials.items.size).toBe(0);
    expect(paid.items.get('trial-1')?.parentPin).toBe('4321');
  });
});
