export const LICENSE_TYPES = ['yearly', 'lifetime'] as const;
export type LicenseType = (typeof LICENSE_TYPES)[number];

/** What paid for a license. The sources themselves (resellers, codes, payments, …) come in later phases. */
export const ACTIVATION_SOURCES = [
  'admin',
  'reseller',
  'code',
  'coupon',
  'payment',
  'store',
  'transfer',
  'plan',
] as const;
export type ActivationSource = (typeof ACTIVATION_SOURCES)[number];

export interface ActivatedBy {
  readonly source: ActivationSource;
  /** Who did it, when known: the staff user, the reseller, … */
  readonly actorId: string | null;
}

/**
 * One license a paid device got. Every row is kept as history; the device points to its current one.
 * Trial, expired and revoked are worked out from these fields, never stored as a state.
 */
export interface License {
  readonly id: string;
  /** A row in devices. */
  readonly deviceId: string;
  readonly type: LicenseType;
  /** Empty for lifetime. A yearly license bought early starts where the current one ends. */
  readonly expiresAt: Date | null;
  readonly revoked: boolean;
  readonly revokedAt: Date | null;
  readonly activatedBy: ActivatedBy;
  /** Yearly costs 1, lifetime 2. */
  readonly creditCost: number;
  /** Bought in a multi-device store order: a MAC switch is refused. */
  readonly multiActivate: boolean;
  /** The transaction, code, coupon or subscription that paid. */
  readonly sourceId: string | null;
  readonly createdAt: Date;
}
