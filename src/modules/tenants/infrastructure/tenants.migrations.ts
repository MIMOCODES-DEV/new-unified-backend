import type { Migration } from '../../../shared/database/migrations/migration.js';
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
];
