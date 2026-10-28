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

/** How a MAC switch ended on the devices side. */
export type MacSwitchOutcome =
  | {
      readonly status: 'done';
      readonly from: string;
      readonly to: string;
      readonly at: Date;
      /** Switches made so far, this one included. */
      readonly count: number;
      /** The trial device that had the new MAC and was absorbed; null when the MAC was free. */
      readonly absorbedTrialId: string | null;
    }
  | {
      readonly status:
        'not_found' | 'invalid_mac' | 'same_mac' | 'limit_reached' | 'not_registered' | 'mac_taken';
    };

/** How a recovery ended on the devices side. */
export type RecoveryOutcome =
  | {
      readonly status: 'done';
      readonly from: string;
      readonly to: string;
      readonly at: Date;
      /** The new TV's trial device, removed; null when the MAC had none. */
      readonly removedTrialId: string | null;
    }
  | {
      readonly status: 'not_found' | 'invalid_mac' | 'same_mac' | 'not_registered' | 'mac_taken';
    };

/** A trial device the cleanup may remove (LIC-4). */
export interface StaleTrial {
  readonly id: string;
  readonly macAddress: string;
  readonly trialEndsAt: Date;
  readonly lastSeenAt: Date;
}

/** Which trial devices count as stale: trial ended before, and not seen since, these dates. */
export interface StaleTrialRule {
  readonly endedBefore: Date;
  readonly notSeenSince: Date;
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
  /**
   * Gives a paid device a new MAC (DEV-7). A trial device on the new MAC is absorbed: `takeOver`
   * runs with its id before it is deleted. A paid device on the new MAC refuses (`mac_taken`).
   */
  abstract switchMac(
    deviceId: string,
    newMac: string,
    takeOver: (trialDeviceId: string) => Promise<void>,
  ): Promise<MacSwitchOutcome>;
  /** REC-1: a paid device's new recovery code; `taken` when another device already has it. */
  abstract setRecoveryCode(
    deviceId: string,
    code: string,
    expiresAt: Date,
  ): Promise<'done' | 'not_found' | 'taken'>;
  /** REC-2: the paid device holding this code and when the code expires; null when none does. */
  abstract findByRecoveryCode(code: string): Promise<{ id: string; expiresAt: Date | null } | null>;
  /**
   * REC-2 and REC-3: gives a paid device the new TV's MAC. The new TV's trial device is removed:
   * `removeTrial` runs with its id first. A paid device on the new MAC refuses (`mac_taken`).
   */
  abstract recover(
    deviceId: string,
    newMac: string,
    removeTrial: (trialDeviceId: string) => Promise<void>,
  ): Promise<RecoveryOutcome>;
  /** LIC-4: stale trial devices (no playlist, matching the rule), the longest ended first. */
  abstract listStaleTrials(rule: StaleTrialRule, limit: number): Promise<StaleTrial[]>;
  /**
   * LIC-4: deletes one trial device if it still matches the rule (under the lock for its MAC);
   * `removePlaylists` runs first. False when nothing was deleted.
   */
  abstract deleteStaleTrial(
    deviceId: string,
    rule: StaleTrialRule,
    removePlaylists: (deviceId: string) => Promise<void>,
  ): Promise<boolean>;
}
