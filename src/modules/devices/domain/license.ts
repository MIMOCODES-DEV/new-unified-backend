/**
 * License rules:
 * - Types: trial | yearly | lifetime (names, not the old is_trial 0/1/2/3).
 * - Trial: 1–365 whole days, ends at 23:59:59.999 UTC of the last day.
 * - Active = not revoked AND (lifetime OR now <= expiresAt). "Expired" is computed, never stored.
 * - Add a year: stacks on the time left, or starts from now if expired or revoked. Becomes yearly.
 * - Lifetime: no end date. A running lifetime can't get a year or lifetime again.
 * - Revoke: keeps the dates; revoking twice is refused. A revoked license can be paid again.
 * - Credit cost for resellers: trial 0, yearly 1, lifetime 2.
 * - Immutable: every change returns a new License.
 */
import { DomainError } from '../../../shared/kernel/domain-error.js';
import { err, ok, type Result } from '../../../shared/kernel/result.js';

export type LicenseType = 'trial' | 'yearly' | 'lifetime';
export type LicenseStatus = 'trial' | 'active' | 'expired' | 'revoked';

const MAX_TRIAL_DAYS = 365;
const CREDIT_COST: Record<LicenseType, number> = { trial: 0, yearly: 1, lifetime: 2 };

export class InvalidLicenseError extends DomainError {
  readonly code = 'licenses.invalid';
}

export class LicenseAlreadyLifetimeError extends DomainError {
  readonly code = 'licenses.already_lifetime';
}

export class LicenseAlreadyRevokedError extends DomainError {
  readonly code = 'licenses.already_revoked';
}

/** The last millisecond of the given day, in UTC. */
function endOfDay(date: Date): Date {
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

export class License {
  private constructor(
    readonly type: LicenseType,
    /** null = lifetime, never ends. */
    readonly expiresAt: Date | null,
    readonly revoked: boolean,
  ) {}

  static startTrial(trialDays: number, now: Date): Result<License, InvalidLicenseError> {
    if (!Number.isInteger(trialDays) || trialDays < 1 || trialDays > MAX_TRIAL_DAYS) {
      return err(
        new InvalidLicenseError(`Trial days must be a whole number from 1 to ${MAX_TRIAL_DAYS}`, {
          trialDays,
        }),
      );
    }
    const end = new Date(now);
    end.setUTCDate(end.getUTCDate() + trialDays);
    return ok(new License('trial', endOfDay(end), false));
  }

  get creditCost(): number {
    return CREDIT_COST[this.type];
  }

  isActive(now: Date): boolean {
    if (this.revoked) return false;
    return this.expiresAt === null || now <= this.expiresAt;
  }

  status(now: Date): LicenseStatus {
    if (this.revoked) return 'revoked';
    if (!this.isActive(now)) return 'expired';
    return this.type === 'trial' ? 'trial' : 'active';
  }

  extendYearly(now: Date): Result<License, LicenseAlreadyLifetimeError> {
    if (this.isRunningLifetime()) {
      return err(new LicenseAlreadyLifetimeError('A lifetime license cannot get a year added'));
    }
    // Stacking: a running license keeps its remaining days; otherwise the year starts now.
    const base = this.isActive(now) && this.expiresAt ? this.expiresAt : now;
    const end = new Date(base);
    end.setUTCFullYear(end.getUTCFullYear() + 1);
    return ok(new License('yearly', endOfDay(end), false));
  }

  makeLifetime(): Result<License, LicenseAlreadyLifetimeError> {
    if (this.isRunningLifetime()) {
      return err(new LicenseAlreadyLifetimeError('This license is already lifetime'));
    }
    return ok(new License('lifetime', null, false));
  }

  revoke(): Result<License, LicenseAlreadyRevokedError> {
    if (this.revoked) {
      return err(new LicenseAlreadyRevokedError('This license is already revoked'));
    }
    return ok(new License(this.type, this.expiresAt, true));
  }

  private isRunningLifetime(): boolean {
    return this.type === 'lifetime' && !this.revoked;
  }
}
