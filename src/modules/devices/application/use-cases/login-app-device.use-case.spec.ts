import { beforeEach, describe, expect, it } from 'vitest';
import {
  InMemoryDeviceRepository,
  InMemoryDeviceSettings,
  SequenceKeyGenerator,
  SequenceMacGenerator,
} from '../../../../../test/support/in-memory-device.repository.js';
import { FixedClock } from '../../../../shared/kernel/clock.js';
import { LoginAppDeviceUseCase } from './login-app-device.use-case.js';
import { RegisterOrGetDeviceUseCase } from './register-or-get-device.use-case.js';

const MAC = 'AA:BB:CC:00:00:21';

describe('LoginAppDeviceUseCase (iOS / Android v2-v3 device_login)', () => {
  let repo: InMemoryDeviceRepository;
  let login: LoginAppDeviceUseCase;

  beforeEach(() => {
    repo = new InMemoryDeviceRepository();
    const register = new RegisterOrGetDeviceUseCase(
      repo,
      new SequenceKeyGenerator(['111111', '222222']),
      new FixedClock(new Date('2026-10-19T10:00:00Z')),
      new InMemoryDeviceSettings(),
      new SequenceMacGenerator(['02:00:00:00:00:01']),
    );
    login = new LoginAppDeviceUseCase(repo, register);
  });

  it('registers a new device and remembers its install uid', async () => {
    const result = await login.execute({ macAddress: MAC, appType: 'ios', uid: 'F3A9-UUID-1' });

    if (!result.ok) throw result.error;
    expect(result.value.outcome).toBe('created');
    expect(result.value.device.appUid?.value).toBe('F3A9-UUID-1');
  });

  it('logs the same install in again', async () => {
    await login.execute({ macAddress: MAC, appType: 'ios', uid: 'F3A9-UUID-1' });

    const again = await login.execute({ macAddress: MAC, appType: 'ios', uid: 'F3A9-UUID-1' });

    expect(again.ok && again.value.outcome).toBe('existing');
  });

  it('refuses another install uid for the same MAC', async () => {
    await login.execute({ macAddress: MAC, appType: 'ios', uid: 'F3A9-UUID-1' });

    const other = await login.execute({ macAddress: MAC, appType: 'ios', uid: 'OTHER-UUID' });

    expect(!other.ok && other.error.code).toBe('devices.uid_mismatch');
  });

  it('adopts the uid of a device first registered by another app family (old code always refused it)', async () => {
    const fresh = new InMemoryDeviceRepository();
    const register = new RegisterOrGetDeviceUseCase(
      fresh,
      new SequenceKeyGenerator(['333333']),
      new FixedClock(new Date('2026-10-19T10:00:00Z')),
      new InMemoryDeviceSettings(),
      new SequenceMacGenerator(['02:00:00:00:00:02']),
    );
    await register.execute({ macAddress: MAC, appType: 'samsung' }); // legacy TV registration, no uid

    const result = await new LoginAppDeviceUseCase(fresh, register).execute({
      macAddress: MAC,
      appType: 'android',
      uid: 'ANDROID-1',
    });

    expect(result.ok && result.value.device.appUid?.value).toBe('ANDROID-1');
  });

  it('requires a uid', async () => {
    const result = await login.execute({ macAddress: MAC, appType: 'ios', uid: '' });

    expect(!result.ok && result.error.code).toBe('devices.invalid_app_device_id');
  });
});
