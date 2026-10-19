/**
 * Translates our device into the fields old apps read. The only place the old numbers live.
 * - is_trial: trial 0 · revoked 1 · lifetime 2 · yearly 3 (PLAN §5.3)
 * - expire_date: "YYYY-MM-DD" (UTC). Lifetime has no date, so we send the far date old apps expect.
 */
import type { Device } from '../../../modules/devices/index.js';

const LIFETIME_EXPIRE_DATE = '2438-11-01';
const IS_TRIAL = { trial: 0, yearly: 3, lifetime: 2 } as const;

export function legacyIsTrial(device: Device): 0 | 1 | 2 | 3 {
  return device.license.revoked ? 1 : IS_TRIAL[device.license.type];
}

export function legacyExpireDate(device: Device): string {
  const expiresAt = device.license.expiresAt;
  return expiresAt ? expiresAt.toISOString().slice(0, 10) : LIFETIME_EXPIRE_DATE;
}
