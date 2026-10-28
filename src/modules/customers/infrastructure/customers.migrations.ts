import type { Migration } from '../../../shared/database/migrations/migration.js';
import { bson, ensureCollection } from '../../../shared/database/migrations/ensure-collection.js';
import { CUSTOMER_TOKEN_KINDS } from '../domain/customer.js';
import { CUSTOMER_TOKENS_COLLECTION, CUSTOMERS_COLLECTION } from './customer.document.js';

const nullableString = () => bson.nullable(bson.string());

/** Brand-database migrations owned by the customers module. */
export const customersMigrations: readonly Migration[] = [
  {
    id: '0009-customers',
    description: 'customers (email unique in the brand) and their one-time email links',
    up: async (db) => {
      await ensureCollection(
        db,
        CUSTOMERS_COLLECTION,
        bson.object({
          _id: bson.string(),
          email: bson.string(),
          passwordHash: bson.string(),
          firstName: nullableString(),
          lastName: nullableString(),
          emailVerifiedAt: bson.nullable(bson.date()),
          legacy: bson.nullable(bson.anyObject()),
          createdAt: bson.date(),
          updatedAt: bson.date(),
        }),
        [
          // Emails are stored lowercase, so a plain unique index is case-insensitive.
          { key: { email: 1 }, name: 'email_unique', unique: true },
          {
            key: { 'legacy.id': 1 },
            name: 'legacy_id',
            partialFilterExpression: { 'legacy.id': { $type: 'string' } },
          },
        ],
      );
      await ensureCollection(
        db,
        CUSTOMER_TOKENS_COLLECTION,
        bson.object({
          _id: bson.string(),
          customerId: bson.string(),
          kind: bson.enum(CUSTOMER_TOKEN_KINDS),
          email: bson.string(),
          expiresAt: bson.date(),
          createdAt: bson.date(),
        }),
        [
          { key: { customerId: 1, kind: 1 }, name: 'customer_kind' },
          { key: { expiresAt: 1 }, name: 'expires_ttl', expireAfterSeconds: 0 },
        ],
      );
    },
  },
];
