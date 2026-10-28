import type { CustomerToken, CustomerTokenKind } from '../../domain/customer.js';

/** The current brand's `customerTokens`: one-time email links, stored as hashes. */
export abstract class CustomerTokenRepository {
  abstract insert(token: CustomerToken): Promise<void>;
  /**
   * Takes the token with this hash and deletes it in the same step, so a link works once even when
   * clicked twice at the same time. Null when it is unknown, already used or expired.
   */
  abstract take(id: string, kind: CustomerTokenKind, now: Date): Promise<CustomerToken | null>;
  /** Drops a customer's other open links of this kind (a new one replaces them). */
  abstract deleteFor(customerId: string, kind: CustomerTokenKind): Promise<void>;
}
