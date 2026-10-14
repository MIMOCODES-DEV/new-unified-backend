import type { TenantSettings } from '../kernel/tenant-settings.js';

/** Key under which the request's brand is stored in the request context (AsyncLocalStorage). */
export const CURRENT_TENANT = 'currentTenant';

/** The brand a request belongs to, as every module sees it. */
export interface CurrentTenant {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly dbName: string;
  /** Per-brand flags and profiles: branch on these, never on `slug`. */
  readonly settings: TenantSettings;
}
