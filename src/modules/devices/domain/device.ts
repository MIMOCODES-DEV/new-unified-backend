/**
 * The two device collections of a brand (Phase 1 schema, docs/phase-1/README.md §2):
 * a device that never paid is a TrialDevice (`trialDevices`), one that paid at least once is a
 * PaidDevice (`devices`). Paying moves it and keeps its id, MAC and device key. A MAC is in only
 * one of the two collections; the device key is not unique.
 */

/** The device or OS the app runs on; old `app_type`, lowercased. `unknown` = the old row had none. */
export const PLATFORMS = [
  'samsung',
  'lg',
  'android',
  'android_tv',
  'ios',
  'tvos',
  'macos',
  'windows',
  'linux',
  'roku',
  'vidaa',
  'titanos',
  'zeasn',
  'vegaos',
  'unknown',
] as const;
export type Platform = (typeof PLATFORMS)[number];

export const API_VERSIONS = ['legacy', 'v4', 'v5'] as const;
export type ApiVersion = (typeof API_VERSIONS)[number];

/** Where a row came from in the old backends: old brand, old `_id`, raw old fields kept for reference. */
export interface LegacyRef {
  readonly id?: string;
  readonly brand?: string;
  readonly [field: string]: unknown;
}

/** Fields both device collections share. */
export interface DeviceBase {
  readonly id: string;
  /** Normalized (`aa:bb:cc:dd:ee:ff`); unique across both device collections. */
  readonly macAddress: string;
  /** Used only when the device has no usable MAC. */
  readonly appDeviceId: string | null;
  readonly platform: Platform;
  /** 6 digits; not unique: always checked together with the MAC. */
  readonly deviceKey: string;
  /** Only V4 apps send it. */
  readonly uid: string | null;
  /** Turns Stalker portals on for this device. */
  readonly stalkerEnabled: boolean;
  /** Kept as entered, not hashed: the apps get it back and check it themselves. */
  readonly parentPin: string | null;
  readonly apiVersion: ApiVersion;
  readonly appVersion: string | null;
  readonly ip: string;
  readonly lastSeenAt: Date;
  readonly legacy: LegacyRef | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Never paid; trial running or ended. Kept after the trial ends so it never gets a second one. */
export interface TrialDevice extends DeviceBase {
  readonly trialStartedAt: Date;
  /** End of day UTC. */
  readonly trialEndsAt: Date;
  /** 0 = never added a playlist; follows adds and deletes. */
  readonly playlistCount: number;
  /** Stays set after the playlist is deleted. */
  readonly firstPlaylistAt: Date | null;
}

/** The last MAC switch of a paid device. */
export interface MacSwitch {
  readonly from: string;
  readonly to: string;
  readonly at: Date;
  /** The MAC the device had before its first switch. */
  readonly originMac: string | null;
}

/** A code made on the website (paid devices only, 30 minutes) that moves this device to a new TV. */
export interface DeviceRecovery {
  readonly code: string | null;
  readonly expiresAt: Date | null;
  readonly enabled: boolean;
  /** The MAC the device was recovered from. */
  readonly recoveredFrom: string | null;
  readonly recoveredAt: Date | null;
}

/** Paid at least once. Never deleted; an expired or revoked license leaves it here. */
export interface PaidDevice extends DeviceBase {
  readonly currentLicenseId: string;
  /** First payment. */
  readonly activatedAt: Date;
  /** A reseller in the central database (later phase). */
  readonly resellerId: string | null;
  /** A customer (later phase). */
  readonly customerId: string | null;
  readonly switch: MacSwitch | null;
  readonly recovery: DeviceRecovery | null;
}

/** A device looked up by MAC (or id): which collection it is in decides whether it ever paid. */
export type FoundDevice =
  | { readonly paid: false; readonly device: TrialDevice }
  | { readonly paid: true; readonly device: PaidDevice };
