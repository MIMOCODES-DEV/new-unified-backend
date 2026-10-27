import type { Migration } from '../../../shared/database/migrations/migration.js';
import { bson, ensureCollection } from '../../../shared/database/migrations/ensure-collection.js';
import { ACTIVATION_SOURCES, LICENSE_TYPES } from '../domain/license.js';
import { LICENSES_COLLECTION } from './license.document.js';

/** Brand-database migrations owned by the licensing module. */
export const licensingMigrations: readonly Migration[] = [
  {
    id: '0004-licenses',
    description: 'licenses: one row per license, kept as history',
    up: (db) =>
      ensureCollection(
        db,
        LICENSES_COLLECTION,
        bson.object({
          _id: bson.string(),
          deviceId: bson.string(),
          type: bson.enum(LICENSE_TYPES),
          expiresAt: bson.nullable(bson.date()),
          revoked: bson.bool(),
          revokedAt: bson.nullable(bson.date()),
          activatedBy: bson.object({
            source: bson.enum(ACTIVATION_SOURCES),
            actorId: bson.nullable(bson.string()),
          }),
          creditCost: bson.number(),
          multiActivate: bson.bool(),
          sourceId: bson.nullable(bson.string()),
          createdAt: bson.date(),
        }),
        [
          { key: { deviceId: 1, createdAt: 1 }, name: 'device_history' },
          // Per device: one coupon pack or code batch may pay for several devices.
          {
            key: { deviceId: 1, sourceId: 1 },
            name: 'device_source_unique',
            unique: true,
            partialFilterExpression: { sourceId: { $type: 'string' } },
          },
        ],
      ),
  },
];
