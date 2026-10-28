import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/kernel/clock.js';
import type { Customer, CustomerToken, CustomerTokenKind } from '../domain/customer.js';
import { CustomerTokenRepository } from './ports/customer-token.repository.js';

/** How long a link works. */
const LIFETIME_MS: Record<CustomerTokenKind, number> = {
  verifyEmail: 24 * 60 * 60 * 1000,
  resetPassword: 60 * 60 * 1000,
};

/** A set-password link sent on sign-up: a day, like a verification link. */
export const SET_PASSWORD_LIFETIME_MS = 24 * 60 * 60 * 1000;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/** One-time email links (CUS-1, CUS-2): the token goes in the email, only its hash is stored. */
@Injectable()
export class CustomerLinks {
  constructor(
    private readonly tokens: CustomerTokenRepository,
    private readonly clock: Clock,
  ) {}

  /** A new link for this customer; their older open links of the same kind stop working. */
  async issue(
    customer: Customer,
    kind: CustomerTokenKind,
    lifetimeMs = LIFETIME_MS[kind],
  ): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const now = this.clock.now();
    await this.tokens.deleteFor(customer.id, kind);
    await this.tokens.insert({
      id: hash(token),
      customerId: customer.id,
      kind,
      email: customer.email,
      expiresAt: new Date(now.getTime() + lifetimeMs),
      createdAt: now,
    });
    return token;
  }

  /** The link's record, used up in the same step; null when unknown, used or expired. */
  take(token: string, kind: CustomerTokenKind): Promise<CustomerToken | null> {
    if (!token) return Promise.resolve(null);
    return this.tokens.take(hash(token), kind, this.clock.now());
  }
}
