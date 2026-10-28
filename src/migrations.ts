import { customersMigrations } from './modules/customers/index.js';
import { devicesMigrations } from './modules/devices/index.js';
import { domainMigrationsMigrations } from './modules/domain-migrations/index.js';
import { licensingMigrations } from './modules/licensing/index.js';
import { playlistsMigrations } from './modules/playlists/index.js';
import { staffMigrations } from './modules/staff/index.js';
import { tenantsMigrations } from './modules/tenants/index.js';
import type { Migration } from './shared/database/migrations/migration.js';

/** Every central-database migration, in the order modules contribute them. */
export const centralMigrations: readonly Migration[] = [
  ...tenantsMigrations,
  ...domainMigrationsMigrations,
  ...staffMigrations,
];

/**
 * Every brand-database migration (devices, playlists, …), applied to each brand's own database
 * by `pnpm cli migrate:tenants`. Modules add theirs here as they are built.
 */
export const tenantMigrations: readonly Migration[] = [
  ...devicesMigrations,
  ...licensingMigrations,
  ...playlistsMigrations,
  ...customersMigrations,
];
