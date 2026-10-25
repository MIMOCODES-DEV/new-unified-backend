import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { TenantRepository } from '../application/ports/tenant.repository.js';
import type { HostName } from '../domain/host-name.js';
import type { Tenant } from '../domain/tenant.entity.js';
import { toTenant, toTenantDocument } from './tenant.document.js';

const KEY_PREFIX = 'tenants:host:';
/** Marks a host that belongs to no brand, so random Host headers do not each cost a database query. */
const UNKNOWN = '-';
const KNOWN_TTL_SECONDS = 60;
const UNKNOWN_TTL_SECONDS = 10;

/**
 * Host → brand lookups (every request) answered from Redis, shared by all API instances.
 * Saving a brand drops the entries of all its hosts, before and after the change, so every
 * instance sees the change on its next request; the TTL only bounds edits made outside the app.
 * If Redis is unreachable, lookups fall back to the database instead of failing the request.
 */
export class RedisCachedTenantRepository extends TenantRepository {
  private readonly logger = new Logger(RedisCachedTenantRepository.name);

  constructor(
    private readonly inner: TenantRepository,
    private readonly redis: Redis,
  ) {
    super();
  }

  async findByHost(host: HostName): Promise<Tenant | null> {
    const key = KEY_PREFIX + host.value;
    const cached = await this.attempt(() => this.redis.get(key));
    if (cached === UNKNOWN) return null;
    const hit = cached ? this.fromCache(cached) : null;
    if (hit) return hit;

    const tenant = await this.inner.findByHost(host);
    await this.attempt(() =>
      tenant
        ? this.redis.set(
            key,
            JSON.stringify(toTenantDocument(tenant, new Date())),
            'EX',
            KNOWN_TTL_SECONDS,
          )
        : this.redis.set(key, UNKNOWN, 'EX', UNKNOWN_TTL_SECONDS),
    );
    return tenant;
  }

  findBySlug(slug: string): Promise<Tenant | null> {
    return this.inner.findBySlug(slug);
  }

  findAll(): Promise<Tenant[]> {
    return this.inner.findAll();
  }

  findTakenHosts(hosts: readonly HostName[]): Promise<string[]> {
    return this.inner.findTakenHosts(hosts);
  }

  async save(tenant: Tenant): Promise<void> {
    const before = await this.inner.findBySlug(tenant.slug);
    await this.inner.save(tenant);
    const hosts = new Set([...(before?.hosts ?? []), ...tenant.hosts].map((h) => h.value));
    await this.attempt(() => this.redis.del(...[...hosts].map((h) => KEY_PREFIX + h)));
  }

  /** An entry an older release wrote in another shape is a miss, not an error. */
  private fromCache(cached: string): Tenant | null {
    try {
      return toTenant(JSON.parse(cached));
    } catch {
      return null;
    }
  }

  private async attempt<T>(operation: () => Promise<T>): Promise<T | null> {
    try {
      return await operation();
    } catch (error) {
      this.logger.warn(`Tenant host cache unavailable: ${(error as Error).message}`);
      return null;
    }
  }
}
