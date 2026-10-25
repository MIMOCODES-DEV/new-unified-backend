import type { TestingModuleBuilder } from '@nestjs/testing';
import type { EncryptedSecret } from '../../src/modules/tenants/application/ports/secret-cipher.js';
import { SecretCipher } from '../../src/modules/tenants/application/ports/secret-cipher.js';
import {
  TenantChangeBus,
  type TenantChangeEvent,
} from '../../src/modules/tenants/application/ports/tenant-change.bus.js';
import {
  TenantConfigRepository,
  type TenantDbRef,
} from '../../src/modules/tenants/application/ports/tenant-config.repository.js';
import {
  TenantSecretRepository,
  type TenantSecretSummary,
} from '../../src/modules/tenants/application/ports/tenant-secret.repository.js';
import { TenantRepository } from '../../src/modules/tenants/index.js';
import { EnvelopeSecretCipher } from '../../src/modules/tenants/infrastructure/envelope-secret.cipher.js';
import type { AppConfig } from '../../src/shared/config/app-config.js';
import { InMemoryTenantRepository } from './in-memory-tenant.repository.js';

/** A valid 32-byte master key, for tests only. */
export const TEST_SECRETS_KEY = Buffer.alloc(32, 7).toString('base64');

export const testCipher = (key = TEST_SECRETS_KEY): SecretCipher =>
  new EnvelopeSecretCipher({ env: { TENANT_SECRETS_KEY: key } } as AppConfig);

/** Stands in for Redis pub/sub: one instance shared by several "processes" delivers to all. */
export class InMemoryTenantChangeBus extends TenantChangeBus {
  readonly published: TenantChangeEvent[] = [];
  private readonly listeners: ((event: TenantChangeEvent) => void)[] = [];

  publish(event: TenantChangeEvent): Promise<void> {
    this.published.push(event);
    for (const listener of this.listeners) listener(event);
    return Promise.resolve();
  }

  subscribe(listener: (event: TenantChangeEvent) => void): void {
    this.listeners.push(listener);
  }
}

export class InMemoryTenantSecretRepository extends TenantSecretRepository {
  readonly items = new Map<string, { secret: EncryptedSecret; updatedAt: Date }>();
  reads = 0;

  find(tenantId: string, name: string): Promise<EncryptedSecret | null> {
    this.reads++;
    return Promise.resolve(this.items.get(`${tenantId}/${name}`)?.secret ?? null);
  }

  list(tenantId: string): Promise<TenantSecretSummary[]> {
    return Promise.resolve(
      [...this.items]
        .filter(([key]) => key.startsWith(`${tenantId}/`))
        .map(([key, item]) => ({ name: key.slice(tenantId.length + 1), updatedAt: item.updatedAt }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  save(tenantId: string, name: string, secret: EncryptedSecret, now: Date): Promise<void> {
    this.items.set(`${tenantId}/${name}`, { secret, updatedAt: now });
    return Promise.resolve();
  }

  delete(tenantId: string, name: string): Promise<boolean> {
    return Promise.resolve(this.items.delete(`${tenantId}/${name}`));
  }
}

export class InMemoryTenantConfigRepository extends TenantConfigRepository {
  readonly items = new Map<string, object>();
  reads = 0;

  load(tenant: TenantDbRef): Promise<unknown> {
    this.reads++;
    return Promise.resolve(this.items.get(tenant.dbName) ?? null);
  }

  save(tenant: TenantDbRef, config: object): Promise<void> {
    this.items.set(tenant.dbName, structuredClone(config));
    return Promise.resolve();
  }
}

export interface TenantFakes {
  tenants: InMemoryTenantRepository;
  secrets: InMemoryTenantSecretRepository;
  configs: InMemoryTenantConfigRepository;
  bus: InMemoryTenantChangeBus;
}

export function tenantFakes(): TenantFakes {
  return {
    tenants: new InMemoryTenantRepository(),
    secrets: new InMemoryTenantSecretRepository(),
    configs: new InMemoryTenantConfigRepository(),
    bus: new InMemoryTenantChangeBus(),
  };
}

/** Replaces every storage/Redis port of TenantsModule, so it runs without Mongo or Redis. */
export function overrideTenantPorts(
  builder: TestingModuleBuilder,
  fakes: TenantFakes,
): TestingModuleBuilder {
  return builder
    .overrideProvider(TenantRepository)
    .useValue(fakes.tenants)
    .overrideProvider(TenantSecretRepository)
    .useValue(fakes.secrets)
    .overrideProvider(TenantConfigRepository)
    .useValue(fakes.configs)
    .overrideProvider(TenantChangeBus)
    .useValue(fakes.bus)
    .overrideProvider(SecretCipher)
    .useValue(testCipher());
}
