import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryDeviceRepository } from '../../../../../test/support/in-memory-device.repository.js';
import { FixedClock } from '../../../../shared/kernel/clock.js';
import { DeviceKeyGenerator } from '../ports/device-key-generator.js';
import { DeviceSettings } from '../ports/device-settings.js';
import { RegisterDeviceUseCase } from './register-device.use-case.js';

class FixedSettings extends DeviceSettings {
  constructor(private readonly days: number) {
    super();
  }
  trialDays(): Promise<number> {
    return Promise.resolve(this.days);
  }
}

class SequenceKeys extends DeviceKeyGenerator {
  private n = 100000;
  next(): string {
    return String(this.n++);
  }
}

describe('RegisterDeviceUseCase', () => {
  let devices: InMemoryDeviceRepository;
  let useCase: RegisterDeviceUseCase;

  beforeEach(() => {
    devices = new InMemoryDeviceRepository();
    useCase = new RegisterDeviceUseCase(
      devices,
      new FixedSettings(7),
      new SequenceKeys(),
      new FixedClock(new Date('2026-10-19T10:00:00Z')),
    );
  });

  it('creates an unknown device with a trial, a key and state pending', async () => {
    const result = await useCase.execute({ mac: 'AA-BB-CC-DD-EE-FF', appType: 'Samsung' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { device, created } = result.value;
    expect(created).toBe(true);
    expect(device.mac.value).toBe('aa:bb:cc:dd:ee:ff');
    expect(device.appType).toBe('samsung');
    expect(device.deviceKey).toBe('100000');
    expect(device.state).toBe('pending');
    expect(device.license.type).toBe('trial');
    expect(device.license.expiresAt).toEqual(new Date('2026-10-26T23:59:59.999Z'));
    expect(devices.items.size).toBe(1);
  });

  it('returns the existing device for a known MAC, without a second trial', async () => {
    await useCase.execute({ mac: 'aa:bb:cc:dd:ee:ff', appType: 'samsung' });

    const again = await useCase.execute({ mac: 'AABBCCDDEEFF', appType: 'lg' });

    expect(again.ok && again.value.created).toBe(false);
    expect(again.ok && again.value.device.deviceKey).toBe('100000');
    expect(devices.items.size).toBe(1);
  });

  it('two requests for the same new MAC create one device', async () => {
    const results = await Promise.all([
      useCase.execute({ mac: 'aa:bb:cc:dd:ee:01', appType: 'android' }),
      useCase.execute({ mac: 'aa:bb:cc:dd:ee:01', appType: 'android' }),
    ]);

    const ids = results.map((r) => (r.ok ? r.value.device.id : null));
    expect(ids[0]).toBe(ids[1]);
    expect(results.filter((r) => r.ok && r.value.created)).toHaveLength(1);
    expect(devices.items.size).toBe(1);
  });

  it('refuses an invalid MAC or app type', async () => {
    const badMac = await useCase.execute({ mac: 'not-a-mac', appType: 'samsung' });
    const badType = await useCase.execute({ mac: 'aa:bb:cc:dd:ee:ff', appType: 'toaster' });

    expect(!badMac.ok && badMac.error.code).toBe('kernel.invalid_mac_address');
    expect(!badType.ok && badType.error.code).toBe('devices.invalid_app_type');
    expect(devices.items.size).toBe(0);
  });
});
