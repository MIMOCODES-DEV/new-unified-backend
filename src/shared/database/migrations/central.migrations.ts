import type { Migration } from './migration.js';

/** Migrations for the central DB, in order. Tenant DB migrations get their own list (TEN-03). */
export const centralMigrations: readonly Migration[] = [];
