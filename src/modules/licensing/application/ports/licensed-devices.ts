/** A device as licensing sees it. */
export interface LicensedDevice {
  readonly id: string;
  /** Whether it is in `devices` (paid at least once). */
  readonly paid: boolean;
  /** A trial device's trial end; null once paid. */
  readonly trialEndsAt: Date | null;
  /** A paid device's current license. */
  readonly currentLicenseId: string | null;
}

export interface PaidBy {
  readonly licenseId: string;
  readonly activatedAt: Date;
  readonly resellerId: string | null;
  readonly customerId: string | null;
}

/**
 * What licensing needs from the devices module, bound at the process root
 * (src/module-settings.ts): a module may not import another module.
 */
export abstract class LicensedDevices {
  abstract find(deviceId: string): Promise<LicensedDevice | null>;
  /**
   * Makes the license current: a trial device moves to `devices`, a paid one points at it.
   * `conflict` when the device cannot move (its app device id is already on a paid device).
   */
  abstract markPaid(deviceId: string, paidBy: PaidBy): Promise<'done' | 'not_found' | 'conflict'>;
}
