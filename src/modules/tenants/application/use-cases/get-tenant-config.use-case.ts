import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { TenantConfigRepository, type TenantDbRef } from '../ports/tenant-config.repository.js';
import { type TenantConfig, tenantConfigSchema } from '../tenant-config.js';
import { TenantConfigCache } from '../tenant-memory-cache.js';

/**
 * A brand's effective config: its stored values over the defaults. Pass the brand being served
 * (`TenantContext.current`). Cached per process; changes reach every process through the bus.
 */
@Injectable()
export class GetTenantConfigUseCase {
  constructor(
    private readonly configs: TenantConfigRepository,
    private readonly cache: TenantConfigCache,
  ) {}

  async execute(tenant: TenantDbRef): Promise<TenantConfig> {
    const cached = this.cache.get(tenant.id);
    if (cached) return cached;

    const generation = this.cache.generation(tenant.id);
    const parsed = tenantConfigSchema.safeParse((await this.configs.load(tenant)) ?? {});
    if (!parsed.success) {
      // Writes are validated, so this means the document was edited by hand.
      throw new Error(
        `Stored tenantConfig of ${tenant.dbName} is invalid:\n${z.prettifyError(parsed.error)}`,
      );
    }
    this.cache.set(tenant.id, '', parsed.data, generation);
    return parsed.data;
  }
}
