import type { HostName } from '../../src/modules/tenants/domain/host-name.js';
import type { Tenant } from '../../src/modules/tenants/domain/tenant.entity.js';
import { TenantRepository } from '../../src/modules/tenants/application/ports/tenant.repository.js';

/** Test double: keeps tenants in a Map. Used by the specs; never wired into the app. */
export class InMemoryTenantRepository extends TenantRepository {
  readonly items = new Map<string, Tenant>();

  findByHost(host: HostName): Promise<Tenant | null> {
    return Promise.resolve(
      [...this.items.values()].find((t) => t.hosts.some((h) => h.equals(host))) ?? null,
    );
  }

  findBySlug(slug: string): Promise<Tenant | null> {
    return Promise.resolve([...this.items.values()].find((t) => t.slug === slug) ?? null);
  }

  findAll(): Promise<Tenant[]> {
    return Promise.resolve([...this.items.values()].sort((a, b) => a.slug.localeCompare(b.slug)));
  }

  findTakenHosts(hosts: readonly HostName[]): Promise<string[]> {
    const used = new Set([...this.items.values()].flatMap((t) => t.hosts.map((h) => h.value)));
    return Promise.resolve(hosts.map((h) => h.value).filter((h) => used.has(h)));
  }

  save(tenant: Tenant): Promise<void> {
    this.items.set(tenant.id, tenant);
    return Promise.resolve();
  }
}
