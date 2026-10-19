import { err, ok, type Result } from '../../../shared/kernel/result.js';
import { InvalidTrialDaysError } from './device.errors.js';

/** The old backends' `trial_days` default. */
export const DEFAULT_TRIAL_DAYS = 7;

const MAX_TRIAL_DAYS = 365;

/** How long a new device's free trial lasts in one brand: a whole number of days, 1 to 365. */
export class TrialDays {
  private constructor(readonly days: number) {}

  static default(): TrialDays {
    return new TrialDays(DEFAULT_TRIAL_DAYS);
  }

  /** Accepts a number or a numeric string (CLI input, stored settings). */
  static parse(input: unknown): Result<TrialDays, InvalidTrialDaysError> {
    const value = typeof input === 'string' && input.trim() !== '' ? Number(input) : input;
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > MAX_TRIAL_DAYS
    ) {
      return err(
        new InvalidTrialDaysError(
          `Trial length must be a whole number of days, 1 to ${MAX_TRIAL_DAYS}`,
          {
            input,
          },
        ),
      );
    }
    return ok(new TrialDays(value));
  }
}
