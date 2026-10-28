import { describe, expect, it } from 'vitest';
import { trialEndsAt } from './trial.js';

describe('trialEndsAt', () => {
  it('ends at the end of the UTC day, the given number of days later', () => {
    expect(trialEndsAt(new Date('2026-10-25T10:00:00Z'), 7)).toEqual(
      new Date('2026-11-01T23:59:59.999Z'),
    );
  });

  it('ends today with 0 days', () => {
    expect(trialEndsAt(new Date('2026-10-25T23:30:00Z'), 0)).toEqual(
      new Date('2026-10-25T23:59:59.999Z'),
    );
  });
});
