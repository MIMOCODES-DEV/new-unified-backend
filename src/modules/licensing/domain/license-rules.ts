import { err, ok, type Result } from '../../../shared/kernel/result.js';
import type { License, LicenseType } from './license.js';
import { AlreadyLifetimeError } from './licensing.errors.js';

/** What a device can do right now. Worked out every time, never stored (replaces old `is_trial`). */
export type LicenseState = 'trial' | 'yearly' | 'lifetime' | 'expired' | 'revoked';

export interface DeviceLicense {
  readonly state: LicenseState;
  /** The app may play: a running trial, yearly or lifetime. */
  readonly active: boolean;
  /** When the trial or license ends; null for lifetime. Kept for expired and revoked. */
  readonly endsAt: Date | null;
}

/** What a device has: a trial end while it is a trial device, its current license once paid. */
export interface LicenseHolder {
  readonly trialEndsAt: Date | null;
  readonly current: License | null;
}

/** Credits a reseller spends: a year costs 1, lifetime 2. */
export const CREDIT_COST: Record<LicenseType, number> = { yearly: 1, lifetime: 2 };

/** LIC-1: the state of a device, from its trial end or its current license. */
export function deviceLicense(holder: LicenseHolder, now: Date): DeviceLicense {
  const license = holder.current;
  if (license) {
    if (license.revoked) return { state: 'revoked', active: false, endsAt: license.expiresAt };
    if (license.type === 'lifetime') return { state: 'lifetime', active: true, endsAt: null };
    const running = license.expiresAt !== null && license.expiresAt >= now;
    return { state: running ? 'yearly' : 'expired', active: running, endsAt: license.expiresAt };
  }
  const running = holder.trialEndsAt !== null && holder.trialEndsAt >= now;
  return { state: running ? 'trial' : 'expired', active: running, endsAt: holder.trialEndsAt };
}

/** The last millisecond of the day, in UTC: licenses end at the end of a day, like trials. */
export function endOfDayUtc(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999),
  );
}

/**
 * LIC-1: when a new license ends. Lifetime never ends. A year stacks: it starts where the running
 * trial or yearly license ends, or now when nothing runs (expired, revoked), as the old backends
 * did with `max(today, expire_date)`. A running lifetime gets neither a year nor another lifetime.
 */
export function newLicenseEnd(
  type: LicenseType,
  holder: LicenseHolder,
  now: Date,
): Result<Date | null, AlreadyLifetimeError> {
  const current = deviceLicense(holder, now);
  if (current.state === 'lifetime') {
    return err(new AlreadyLifetimeError('This device already has a lifetime license'));
  }
  if (type === 'lifetime') return ok(null);
  const from = current.active && current.endsAt ? current.endsAt : now;
  const end = new Date(from);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  return ok(endOfDayUtc(end));
}
