/** Who a session belongs to. `staff-2fa` is the short step between the password and the code. */
export interface SessionSubject {
  readonly kind: 'staff' | 'staff-2fa' | 'customer';
  readonly id: string;
  /** The brand of a customer session; null for staff (one account for every brand). */
  readonly tenantId: string | null;
}

/**
 * Server sessions (DISCUSSIONS #9.1): the caller holds an opaque random token, the server keeps who
 * it belongs to, so a session can be ended at once on every server.
 */
export abstract class SessionStore {
  /** A new session; returns the token to give the caller (only its hash is stored). */
  abstract create(subject: SessionSubject, ttlMs: number): Promise<string>;
  /** Null when the token is unknown, ended or expired. */
  abstract find(token: string): Promise<SessionSubject | null>;
  abstract revoke(token: string): Promise<void>;
  /** Ends every session of this subject; returns how many were ended. */
  abstract revokeAll(subject: SessionSubject): Promise<number>;
}
