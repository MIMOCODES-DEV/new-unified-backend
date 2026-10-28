import { describe, expect, it } from 'vitest';
import type { License } from './license.js';
import { CREDIT_COST, deviceLicense, type LicenseHolder, newLicenseEnd } from './license-rules.js';

const now = new Date('2026-10-26T10:00:00Z');
const day = (iso: string) => new Date(`${iso}T23:59:59.999Z`);

function license(overrides: Partial<License>): License {
  return {
    id: 'lic-1',
    deviceId: 'device-1',
    type: 'yearly',
    expiresAt: day('2027-03-01'),
    revoked: false,
    revokedAt: null,
    activatedBy: { source: 'admin', actorId: null },
    creditCost: 1,
    multiActivate: false,
    sourceId: null,
    createdAt: now,
    ...overrides,
  };
}
const trial = (ends: string | null): LicenseHolder => ({
  trialEndsAt: ends ? day(ends) : null,
  current: null,
});
const paid = (overrides: Partial<License>): LicenseHolder => ({
  trialEndsAt: null,
  current: license(overrides),
});

describe('deviceLicense (LIC-1): the state is worked out, never stored', () => {
  it.each<[string, LicenseHolder, string, boolean]>([
    ['a running trial', trial('2026-11-02'), 'trial', true],
    ['a trial that ended', trial('2026-10-01'), 'expired', false],
    ['a running yearly license', paid({}), 'yearly', true],
    ['a yearly license that ended', paid({ expiresAt: day('2026-10-25') }), 'expired', false],
    ['a lifetime license', paid({ type: 'lifetime', expiresAt: null }), 'lifetime', true],
    ['a revoked license', paid({ revoked: true, revokedAt: now }), 'revoked', false],
    [
      'a revoked lifetime license',
      paid({ type: 'lifetime', expiresAt: null, revoked: true }),
      'revoked',
      false,
    ],
  ])('%s is %s', (_, holder, state, active) => {
    expect(deviceLicense(holder, now)).toMatchObject({ state, active });
  });

  it('a trial still runs on its last day', () => {
    expect(deviceLicense(trial('2026-10-26'), now).state).toBe('trial');
  });

  it('gives the end date, and none for lifetime', () => {
    expect(deviceLicense(trial('2026-11-02'), now).endsAt).toEqual(day('2026-11-02'));
    expect(deviceLicense(paid({ type: 'lifetime', expiresAt: null }), now).endsAt).toBeNull();
  });
});

describe('newLicenseEnd (LIC-1): stacking', () => {
  const end = (type: 'yearly' | 'lifetime', holder: LicenseHolder) => {
    const result = newLicenseEnd(type, holder, now);
    if (!result.ok) throw result.error;
    return result.value;
  };

  it('a year bought during a running yearly license adds to its end date', () => {
    expect(end('yearly', paid({ expiresAt: day('2027-03-01') }))).toEqual(day('2028-03-01'));
  });

  it('a year bought during a trial keeps the trial days left', () => {
    expect(end('yearly', trial('2026-11-02'))).toEqual(day('2027-11-02'));
  });

  it('a year on an expired trial or license starts today', () => {
    expect(end('yearly', trial('2026-10-01'))).toEqual(day('2027-10-26'));
    expect(end('yearly', paid({ expiresAt: day('2026-01-01') }))).toEqual(day('2027-10-26'));
  });

  it('a year on a revoked license starts today', () => {
    expect(end('yearly', paid({ revoked: true, revokedAt: now }))).toEqual(day('2027-10-26'));
  });

  it('a year on a device with no trial date starts today', () => {
    expect(end('yearly', trial(null))).toEqual(day('2027-10-26'));
  });

  it('lifetime has no end date', () => {
    expect(end('lifetime', paid({}))).toBeNull();
    expect(end('lifetime', trial('2026-11-02'))).toBeNull();
  });

  it('a running lifetime gets neither a year nor another lifetime', () => {
    const lifetime = paid({ type: 'lifetime', expiresAt: null });

    for (const type of ['yearly', 'lifetime'] as const) {
      const result = newLicenseEnd(type, lifetime, now);
      expect(!result.ok && result.error.code).toBe('licensing.already_lifetime');
    }
  });

  it('a revoked lifetime can be paid again', () => {
    expect(end('yearly', paid({ type: 'lifetime', expiresAt: null, revoked: true }))).toEqual(
      day('2027-10-26'),
    );
  });

  it('29 February plus a year ends on 1 March', () => {
    const leap = { trialEndsAt: null, current: license({ expiresAt: day('2028-02-29') }) };
    expect(newLicenseEnd('yearly', leap, new Date('2028-01-10T00:00:00Z'))).toEqual({
      ok: true,
      value: day('2029-03-01'),
    });
  });
});

describe('credit cost (LIC-1)', () => {
  it('is 1 for a year and 2 for lifetime', () => {
    expect(CREDIT_COST).toEqual({ yearly: 1, lifetime: 2 });
  });
});
