import type { Migration } from '../../../shared/database/migrations/migration.js';
import { bson, ensureCollection } from '../../../shared/database/migrations/ensure-collection.js';
import { MOVE_KINDS, MOVE_SOURCES, MOVE_STATUSES, SCHEMES } from '../domain/domain-migration.js';
import { DOMAIN_MIGRATIONS_COLLECTION } from './domain-migration.document.js';

/** Central-database migrations owned by the domain-migrations module. */
export const domainMigrationsMigrations: readonly Migration[] = [
  {
    id: '0004-domain-migrations',
    description: 'domainMigrations: provider host moves, served only once approved',
    up: (db) =>
      ensureCollection(
        db,
        DOMAIN_MIGRATIONS_COLLECTION,
        bson.object({
          _id: bson.string(),
          kind: bson.enum(MOVE_KINDS),
          fromHost: bson.string(),
          toHost: bson.string(),
          fromScheme: bson.enum(SCHEMES),
          toScheme: bson.enum(SCHEMES),
          confirmations: bson.array(
            bson.object({
              tenantId: bson.string(),
              deviceId: bson.string(),
              ipHash: bson.string(),
              at: bson.date(),
            }),
          ),
          source: bson.enum(MOVE_SOURCES),
          status: bson.enum(MOVE_STATUSES),
          decidedBy: bson.nullable(bson.string()),
          decidedAt: bson.nullable(bson.date()),
          firstSeenAt: bson.date(),
          lastConfirmedAt: bson.date(),
          legacy: bson.nullable(bson.anyObject()),
          createdAt: bson.date(),
          updatedAt: bson.date(),
        }),
        [
          { key: { fromHost: 1, toHost: 1 }, name: 'hosts_unique', unique: true },
          // Approved moves are read on every playlist reply.
          { key: { status: 1 }, name: 'status' },
          {
            key: { 'legacy.id': 1 },
            name: 'legacy_id',
            partialFilterExpression: { 'legacy.id': { $type: 'string' } },
          },
        ],
      ),
  },
];
