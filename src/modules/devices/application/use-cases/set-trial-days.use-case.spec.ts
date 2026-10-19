import { describe, expect, it } from 'vitest';
import { InMemoryDeviceSettings } from '../../../../../test/support/in-memory-device.repository.js';
import { SetTrialDaysUseCase } from './set-trial-days.use-case.js';

describe('SetTrialDaysUseCase', () => {
  it("changes the brand's trial length", async () => {
    const settings = new InMemoryDeviceSettings();

    const result = await new SetTrialDaysUseCase(settings).execute({ days: '14' });

    expect(result.ok && result.value.days).toBe(14);
    expect((await settings.trialDays()).days).toBe(14);
  });

  it('refuses an invalid length and keeps the current one', async () => {
    const settings = new InMemoryDeviceSettings();

    const result = await new SetTrialDaysUseCase(settings).execute({ days: '0' });

    expect(!result.ok && result.error.code).toBe('devices.invalid_trial_days');
    expect((await settings.trialDays()).days).toBe(7);
  });
});
