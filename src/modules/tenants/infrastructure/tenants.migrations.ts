import type { Migration } from '../../../shared/database/migrations/migration.js';
import { DEFAULT_TENANT_SETTINGS } from '../../../shared/kernel/tenant-settings.js';
import { TENANT_SECRETS_COLLECTION } from './mongo-tenant-secret.repository.js';
import { TENANTS_COLLECTION } from './mongo-tenant.repository.js';

/** Central-database migrations owned by the tenants module. */
export const tenantsMigrations: readonly Migration[] = [
  {
    id: '0001-tenants-indexes',
    description: 'Unique tenant slug; a host name can belong to only one tenant',
    up: async (db) => {
      const tenants = db.collection(TENANTS_COLLECTION);
      await tenants.createIndex({ slug: 1 }, { unique: true, name: 'slug_unique' });
      // Multikey unique index: no two tenant documents may list the same host.
      await tenants.createIndex({ hosts: 1 }, { unique: true, name: 'hosts_unique' });
    },
  },
  {
    id: '0002-tenant-secrets-indexes',
    description: 'One secret per tenant and name',
    up: async (db) => {
      await db
        .collection(TENANT_SECRETS_COLLECTION)
        .createIndex({ tenantId: 1, name: 1 }, { unique: true, name: 'tenant_name_unique' });
    },
  },
  {
    id: '0003-tenant-settings-defaults',
    description: 'Store the default settings on brands saved before settings existed',
    up: async (db) => {
      // Reads already fill in defaults; this only makes the stored documents match what the code sees.
      await db
        .collection(TENANTS_COLLECTION)
        .updateMany(
          { settings: { $exists: false } },
          { $set: { settings: DEFAULT_TENANT_SETTINGS, updatedAt: new Date() } },
        );
    },
  },
];
