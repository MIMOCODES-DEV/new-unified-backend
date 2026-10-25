import type { HostName } from '../../domain/host-name.js';
import type { Tenant } from '../../domain/tenant.entity.js';

/** What the tenant use cases need from storage. The MongoDB version lives in infrastructure/. */
export abstract class TenantRepository {
  abstract findByHost(host: HostName): Promise<Tenant | null>;
  abstract findBySlug(slug: string): Promise<Tenant | null>;
  /** Every tenant, enabled or not, ordered by slug. */
  abstract findAll(): Promise<Tenant[]>;
  /** Returns the subset of `hosts` already used by any tenant. */
  abstract findTakenHosts(hosts: readonly HostName[]): Promise<string[]>;
  abstract save(tenant: Tenant): Promise<void>;
}
