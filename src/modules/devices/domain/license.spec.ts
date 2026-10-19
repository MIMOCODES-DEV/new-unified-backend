import { describe, expect, it } from 'vitest';
import { License } from './license.js';

const NOW = new Date('2026-10-19T10:00:00Z');

/** Unwraps a Result in tests: fails loudly if it is an error. */
function must<T>(result: { ok: true; value: T } | { ok: false; error: Error }): T {
  if (!result.ok) throw result.error;
  return result.value;
}

const trial = (days = 7) => must(License.startTrial(days, NOW));
const yearly = () => must(trial().extendYearly(NOW));
const lifetime = () => must(trial().makeLifetime());

describe('License', () => {
  describe('trial', () => {
    it('starts a trial that ends at the end of the day, trialDays from now', () => {
      const license = trial(7);

      expect(license.type).toBe('trial');
      expect(license.expiresAt).toEqual(new Date('2026-10-26T23:59:59.999Z'));
    });

    it('refuses trialDays of 0, negative, fractional or above 365', () => {
      for (const days of [0, -5, 2.5, 366]) {
        const result = License.startTrial(days, NOW);
        expect(!result.ok && result.error.code).toBe('licenses.invalid');
      }
    });
  });

  describe('active or not', () => {
    it('is active until the last millisecond of the expiry day, expired one millisecond later', () => {
      const license = trial(7);

      expect(license.isActive(new Date('2026-10-26T23:59:59.999Z'))).toBe(true);
      expect(license.isActive(new Date('2026-10-27T00:00:00.000Z'))).toBe(false);
    });

    it('a lifetime license is always active', () => {
      expect(lifetime().isActive(new Date('2099-01-01T00:00:00Z'))).toBe(true);
    });

    it('a revoked license is never active, even with a future date', () => {
      expect(must(yearly().revoke()).isActive(NOW)).toBe(false);
    });

    it('reports trial / active / expired / revoked status', () => {
      const later = new Date('2030-01-01T00:00:00Z');

      expect(trial().status(NOW)).toBe('trial');
      expect(trial().status(later)).toBe('expired');
      expect(yearly().status(NOW)).toBe('active');
      expect(lifetime().status(later)).toBe('active');
      expect(must(lifetime().revoke()).status(NOW)).toBe('revoked');
    });
  });

  describe('add one year', () => {
    it('adds one year on top of the time left (stacking)', () => {
      // 7-day trial ends 2026-10-26 → one year later
      expect(yearly().expiresAt).toEqual(new Date('2027-10-26T23:59:59.999Z'));
    });

    it('adds one year from now to an expired license', () => {
      const later = new Date('2030-03-10T08:00:00Z');

      const license = must(trial().extendYearly(later));

      expect(license.expiresAt).toEqual(new Date('2031-03-10T23:59:59.999Z'));
    });

    it('turns a trial into a yearly license', () => {
      expect(yearly().type).toBe('yearly');
    });

    it('restarts a revoked license from now', () => {
      const revoked = must(yearly().revoke());

      const license = must(revoked.extendYearly(NOW));

      expect(license.revoked).toBe(false);
      expect(license.expiresAt).toEqual(new Date('2027-10-19T23:59:59.999Z'));
    });

    it('refuses to add a year to a lifetime license', () => {
      const result = lifetime().extendYearly(NOW);

      expect(!result.ok && result.error.code).toBe('licenses.already_lifetime');
    });
  });

  describe('lifetime', () => {
    it('makes a license lifetime with no expiry date', () => {
      const license = lifetime();

      expect(license.type).toBe('lifetime');
      expect(license.expiresAt).toBeNull();
    });

    it('refuses to make a lifetime license lifetime again', () => {
      const result = lifetime().makeLifetime();

      expect(!result.ok && result.error.code).toBe('licenses.already_lifetime');
    });

    it('a revoked license can become lifetime', () => {
      const license = must(must(lifetime().revoke()).makeLifetime());

      expect(license.isActive(NOW)).toBe(true);
    });
  });

  describe('revoke', () => {
    it('revokes a license and keeps its dates', () => {
      const before = yearly();

      const license = must(before.revoke());

      expect(license.revoked).toBe(true);
      expect(license.type).toBe('yearly');
      expect(license.expiresAt).toEqual(before.expiresAt);
    });

    it('refuses to revoke an already revoked license', () => {
      const result = must(yearly().revoke()).revoke();

      expect(!result.ok && result.error.code).toBe('licenses.already_revoked');
    });
  });

  it('costs 0 credits for a trial, 1 for yearly, 2 for lifetime', () => {
    expect([trial().creditCost, yearly().creditCost, lifetime().creditCost]).toEqual([0, 1, 2]);
  });

  it('never changes the original license (immutable)', () => {
    const original = trial();

    must(original.extendYearly(NOW));

    expect(original.type).toBe('trial');
  });
});
