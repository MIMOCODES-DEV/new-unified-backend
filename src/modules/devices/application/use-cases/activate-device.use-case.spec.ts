import { beforeEach, describe, expect, it } from 'vitest';
import {
  InMemoryDeviceRepository,
  InMemoryDeviceSettings,
  SequenceMacGenerator,
  SequenceKeyGenerator,
} from '../../../../../test/support/in-memory-device.repository.js';
import { FixedClock } from '../../../../shared/kernel/clock.js';
import { ActivateDeviceUseCase } from './activate-device.use-case.js';
import { RegisterOrGetDeviceUseCase } from './register-or-get-device.use-case.js';

const MAC = 'AA:BB:CC:DD:EE:01';

describe('ActivateDeviceUseCase', () => {
  let repo: InMemoryDeviceRepository;
  let register: RegisterOrGetDeviceUseCase;

  const activateAt = (iso: string) =>
    new ActivateDeviceUseCase(repo, new FixedClock(new Date(iso)));

  beforeEach(async () => {
    repo = new InMemoryDeviceRepository();
    register = new RegisterOrGetDeviceUseCase(
      repo,
      new SequenceKeyGenerator(['111111']),
      new FixedClock(new Date('2026-10-19T10:00:00Z')),
      new InMemoryDeviceSettings(),
      new SequenceMacGenerator(['02:00:00:00:00:01', '02:00:00:00:00:02', '02:00:00:00:00:03']),
    );
    await register.execute({ macAddress: MAC, appType: 'samsung' });
  });

  it('moves a trial device to devices', async () => {
    const trialId = [...repo.pending.values()][0]?.id;

    const result = await activateAt('2026-10-20T09:00:00Z').execute({ macAddress: MAC });

    if (!result.ok) throw result.error;
    expect(result.value.outcome).toBe('activated');
    expect(result.value.device.isPaid).toBe(true);
    expect(result.value.device.id).toBe(trialId);
    expect(result.value.device.deviceKey).toBe('111111');
    expect(result.value.device.activatedAt).toEqual(new Date('2026-10-20T09:00:00Z'));
    expect(repo.pending.size).toBe(0);
    expect(repo.paid.size).toBe(1);
  });

  it('activates an expired trial', async () => {
    const result = await activateAt('2026-12-01T00:00:00Z').execute({ macAddress: MAC });

    if (!result.ok) throw result.error;
    expect(result.value.outcome).toBe('activated');
  });

  it('returns already_paid for a paid device', async () => {
    await activateAt('2026-10-20T09:00:00Z').execute({ macAddress: MAC });

    const again = await activateAt('2026-10-21T09:00:00Z').execute({ macAddress: MAC });

    if (!again.ok) throw again.error;
    expect(again.value.outcome).toBe('already_paid');
    expect(again.value.device.activatedAt).toEqual(new Date('2026-10-20T09:00:00Z'));
    expect(repo.paid.size).toBe(1);
  });

  it('returns already_paid when another activation won the race', async () => {
    const [trial] = [...repo.pending.values()];
    if (!trial) throw new Error('expected a pending device');
    repo.beforeNextWrite = () => {
      repo.pending.delete(trial.id);
      repo.paid.set(trial.id, trial);
    };

    const result = await activateAt('2026-10-20T09:00:00Z').execute({ macAddress: MAC });

    if (!result.ok) throw result.error;
    expect(result.value.outcome).toBe('already_paid');
    expect(repo.paid.size).toBe(1);
    expect(repo.pending.size).toBe(0);
  });

  it('returns devices.not_found for an unknown MAC', async () => {
    const result = await activateAt('2026-10-20T09:00:00Z').execute({
      macAddress: 'AA:BB:CC:DD:EE:02',
    });

    expect(!result.ok && result.error.code).toBe('devices.not_found');
  });

  it('rejects an invalid MAC', async () => {
    const result = await activateAt('2026-10-20T09:00:00Z').execute({ macAddress: 'nope' });

    expect(!result.ok && result.error.code).toBe('kernel.invalid_mac_address');
  });
});
