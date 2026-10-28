import { z } from 'zod';
import { CUSTOMER_TOKEN_KINDS, type Customer, type CustomerToken } from '../domain/customer.js';

export const CUSTOMERS_COLLECTION = 'customers';
export const CUSTOMER_TOKENS_COLLECTION = 'customerTokens';

/** Stored shape of a `customers` row, checked on every read. */
export const customerDocumentSchema = z.object({
  _id: z.string().min(1),
  email: z.email().refine((e) => e === e.toLowerCase(), 'stored lowercase'),
  passwordHash: z.string().min(1),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  emailVerifiedAt: z.date().nullable(),
  legacy: z.looseObject({ id: z.string().optional(), brand: z.string().optional() }).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/** Stored shape of a `customerTokens` row. */
export const customerTokenDocumentSchema = z.object({
  _id: z.string().regex(/^[0-9a-f]{64}$/),
  customerId: z.string().min(1),
  kind: z.enum(CUSTOMER_TOKEN_KINDS),
  email: z.string().min(1),
  expiresAt: z.date(),
  createdAt: z.date(),
});

export type CustomerDocument = z.input<typeof customerDocumentSchema>;
export type CustomerTokenDocument = z.input<typeof customerTokenDocumentSchema>;

export function toCustomer(raw: unknown): Customer {
  const { _id, ...rest } = customerDocumentSchema.parse(raw);
  return { id: _id, ...rest };
}

export function toCustomerDocument(customer: Customer): CustomerDocument {
  const { id, ...rest } = customer;
  return customerDocumentSchema.parse({ _id: id, ...rest });
}

export function toCustomerToken(raw: unknown): CustomerToken {
  const { _id, ...rest } = customerTokenDocumentSchema.parse(raw);
  return { id: _id, ...rest };
}

export function toCustomerTokenDocument(token: CustomerToken): CustomerTokenDocument {
  const { id, ...rest } = token;
  return customerTokenDocumentSchema.parse({ _id: id, ...rest });
}
