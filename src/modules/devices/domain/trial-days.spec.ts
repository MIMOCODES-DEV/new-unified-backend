import { describe, expect, it } from 'vitest';
import { DEFAULT_TRIAL_DAYS, TrialDays } from './trial-days.js';

describe('TrialDays', () => {
  it('defaults to 7 days, like the old backends', () => {
    expect(DEFAULT_TRIAL_DAYS).toBe(7);
  });

  it.each([1, 7, 30, 365, '14'])('accepts %j', (input) => {
    const result = TrialDays.parse(input);

    expect(result.ok && result.value.days).toBe(Number(input));
  });

  it.each([0, -1, 366, 1.5, 'abc', '', null, undefined])('rejects %j', (input) => {
    const result = TrialDays.parse(input);

    expect(!result.ok && result.error.code).toBe('devices.invalid_trial_days');
  });
});
