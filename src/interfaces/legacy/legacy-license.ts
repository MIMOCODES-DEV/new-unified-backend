/**
 * How the old apps see a device's licence. Shared by every legacy route so they all agree.
 * Trial devices: is_trial 0 and the trial end. Paid devices are reported as lifetime (is_trial 2,
 * old lifetime = activation + 5000 months) until real licence plans exist (PAY / DEV-01).
 */
export interface LegacyLicenseView {
  isPaid: boolean;
  trialExpiresAt: Date;
  activatedAt: Date | null;
}

const LIFETIME_MONTHS = 5000;

export function legacyIsTrial(device: LegacyLicenseView): 0 | 2 {
  return device.isPaid ? 2 : 0;
}

/** When the device's access ends: the trial end, or the lifetime end for paid devices. */
export function legacyAccessEnd(device: LegacyLicenseView): Date {
  if (!device.isPaid) return device.trialExpiresAt;
  const end = new Date(device.activatedAt ?? Date.now());
  end.setUTCMonth(end.getUTCMonth() + LIFETIME_MONTHS);
  return end;
}

/** The old padded `YYYY-MM-DD` expire_date (UTC). */
export function legacyExpireDate(device: LegacyLicenseView): string {
  return legacyAccessEnd(device).toISOString().slice(0, 10);
}
