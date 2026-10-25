export const MOVE_KINDS = ['migration', 'mirror'] as const;
export type MoveKind = (typeof MOVE_KINDS)[number];

export const MOVE_SOURCES = ['user', 'admin'] as const;
export type MoveSource = (typeof MOVE_SOURCES)[number];

/** Only `approved` moves are served. */
export const MOVE_STATUSES = ['pending', 'approved', 'blocked'] as const;
export type MoveStatus = (typeof MOVE_STATUSES)[number];

export const SCHEMES = ['http', 'https', ''] as const;
export type Scheme = (typeof SCHEMES)[number];

/** One paid device that reported the move. One per IP. */
export interface MoveConfirmation {
  readonly tenantId: string;
  readonly deviceId: string;
  readonly ipHash: string;
  readonly at: Date;
}

/**
 * An IPTV provider moving its server from one host to another, learned from paid devices and
 * served only once a staff member approves it. Central: a provider host is the same for every brand.
 */
export interface DomainMigration {
  readonly id: string;
  readonly kind: MoveKind;
  /** Lowercase host[:port]; unique together with toHost. */
  readonly fromHost: string;
  readonly toHost: string;
  readonly fromScheme: Scheme;
  readonly toScheme: Scheme;
  readonly confirmations: readonly MoveConfirmation[];
  readonly source: MoveSource;
  readonly status: MoveStatus;
  /** The staff user who approved or blocked it. */
  readonly decidedBy: string | null;
  readonly decidedAt: Date | null;
  readonly firstSeenAt: Date;
  readonly lastConfirmedAt: Date;
  readonly legacy: { readonly id?: string; readonly [field: string]: unknown } | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
