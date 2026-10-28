import { describe, expect, it } from 'vitest';
import { customer } from '../../../../test/support/account-fakes.js';
import {
  toCustomer,
  toCustomerDocument,
  toCustomerToken,
  toCustomerTokenDocument,
} from './customer.document.js';

describe('customer documents (ACC-1)', () => {
  it('a customer round-trips through its stored shape', () => {
    const c = customer({ legacy: { id: 'old-1', brand: 'cr' } });
    const doc = toCustomerDocument(c);
    expect(doc._id).toBe(c.id);
    expect(toCustomer(doc)).toEqual(c);
  });

  it('refuses a stored email that is not lowercase', () => {
    expect(() =>
      toCustomer({ ...toCustomerDocument(customer()), email: 'Ana@example.com' }),
    ).toThrow();
  });

  it('a one-time link round-trips', () => {
    const token = {
      id: 'a'.repeat(64),
      customerId: 'customer-1',
      kind: 'verifyEmail' as const,
      email: 'ana@example.com',
      expiresAt: new Date('2026-10-29T00:00:00Z'),
      createdAt: new Date('2026-10-28T00:00:00Z'),
    };
    expect(toCustomerToken(toCustomerTokenDocument(token))).toEqual(token);
  });
});
