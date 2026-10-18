import { tenantsMigrations } from './modules/tenants/index.js';
import type { Migration } from './shared/database/migrations/migration.js';

/** Every central-database migration, in the order modules contribute them. */
export const centralMigrations: readonly Migration[] = [...tenantsMigrations];
