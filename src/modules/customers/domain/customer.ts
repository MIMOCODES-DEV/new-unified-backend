/**
 * A customer of one brand's website. The same person on two brands has two accounts: the email is
 * unique within a brand only (Phase 5 schema).
 */
export interface Customer {
  readonly id: string;
  /** Lowercase; unique in the brand. */
  readonly email: string;
  /** Never shown or logged. Old cr hashes (bcrypt) are kept as they are. */
  readonly passwordHash: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  /** Null until the email is verified; cleared again when the email changes. */
  readonly emailVerifiedAt: Date | null;
  readonly legacy: { readonly id?: string; readonly brand?: string } | null;
  /** The names the customer gave their linked TVs ("Living room"); the device itself has none. */
  readonly deviceNames: readonly CustomerDeviceName[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CustomerDeviceName {
  readonly deviceId: string;
  readonly name: string;
}

/** A device name: trimmed, 1 to 50 characters. */
export const MAX_DEVICE_NAME = 50;

export const CUSTOMER_TOKEN_KINDS = ['verifyEmail', 'resetPassword'] as const;
export type CustomerTokenKind = (typeof CUSTOMER_TOKEN_KINDS)[number];

/**
 * A one-time link sent by email. Only a hash of the token is stored; the link works once and
 * expires on its own.
 */
export interface CustomerToken {
  /** SHA-256 of the token in the link. */
  readonly id: string;
  readonly customerId: string;
  readonly kind: CustomerTokenKind;
  /** The address the link was sent to: verifying proves this one, even after a change. */
  readonly email: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}
