import { tenantsMigrations } from './modules/tenants/index.js';
import type { Migration } from './shared/database/migrations/migration.js';

/** Every central-database migration, in the order modules contribute them. */
export const centralMigrations: readonly Migration[] = [...tenantsMigrations];

/**
 * Every brand-database migration (devices, playlists, …), applied to each brand's own database
 * by `pnpm cli migrate:tenants`. Modules add theirs here as they are built.
 */
export const tenantMigrations: readonly Migration[] = [];
