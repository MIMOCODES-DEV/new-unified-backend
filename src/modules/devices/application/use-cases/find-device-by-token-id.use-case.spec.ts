import { beforeEach, describe, expect, it } from 'vitest';
import {
  InMemoryPaidDeviceRepository,
  InMemoryTrialDeviceRepository,
  InProcessDeviceLock,
  paidDevice,
  trialDevice,
} from '../../../../../test/support/device-fakes.js';
import { DeviceIdentity } from '../device-identity.js';
import { FindDeviceByTokenIdUseCase } from './find-device-by-token-id.use-case.js';

describe('FindDeviceByTokenIdUseCase (#10.1)', () => {
  let find: FindDeviceByTokenIdUseCase;

  beforeEach(async () => {
    const trials = new InMemoryTrialDeviceRepository();
    const paid = new InMemoryPaidDeviceRepository();
    find = new FindDeviceByTokenIdUseCase(
      new DeviceIdentity(trials, paid, new InProcessDeviceLock()),
    );
    await trials.insert(trialDevice({ id: 'trial-1', legacy: { id: '64f0c0ffee0000000000aaaa' } }));
    await paid.insert(paidDevice({ id: 'paid-1', legacy: { id: '64f0c0ffee0000000000bbbb' } }));
  });

  it('finds a device by the id a new token carries', async () => {
    const found = await find.execute('paid-1');

    expect(found.ok && found.value.device.id).toBe('paid-1');
  });

  it('finds a device by the old _id a token from an old backend carries, trial or paid', async () => {
    const paid = await find.execute('64f0c0ffee0000000000bbbb');
    const trial = await find.execute('64f0c0ffee0000000000aaaa');

    expect(paid.ok && [paid.value.paid, paid.value.device.id]).toEqual([true, 'paid-1']);
    expect(trial.ok && [trial.value.paid, trial.value.device.id]).toEqual([false, 'trial-1']);
  });

  it('refuses an id nobody has', async () => {
    const found = await find.execute('64f0c0ffee0000000000cccc');

    expect(!found.ok && found.error.code).toBe('devices.not_found');
  });
});
