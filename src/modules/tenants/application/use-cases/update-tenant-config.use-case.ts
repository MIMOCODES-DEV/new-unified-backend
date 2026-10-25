import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Clock } from '../../../../shared/kernel/clock.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { InvalidTenantConfigError, TenantNotFoundError } from '../../domain/tenant.errors.js';
import { TenantChangeBus } from '../ports/tenant-change.bus.js';
import { TenantConfigRepository } from '../ports/tenant-config.repository.js';
import { TenantRepository } from '../ports/tenant.repository.js';
import { mergeConfigPatch, type TenantConfig, tenantConfigSchema } from '../tenant-config.js';
import { TenantConfigCache } from '../tenant-memory-cache.js';

export type UpdateTenantConfigError = TenantNotFoundError | InvalidTenantConfigError;

/** Changes part of a brand's config; the result is validated as a whole before it is stored. */
@Injectable()
export class UpdateTenantConfigUseCase {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly configs: TenantConfigRepository,
    private readonly cache: TenantConfigCache,
    private readonly bus: TenantChangeBus,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    slug: string;
    patch: unknown;
  }): Promise<Result<TenantConfig, UpdateTenantConfigError>> {
    const tenant = await this.tenants.findBySlug(input.slug.trim().toLowerCase());
    if (!tenant) {
      return err(new TenantNotFoundError('No brand with this slug', { slug: input.slug }));
    }

    const stored = (await this.configs.load(tenant)) ?? {};
    const parsed = tenantConfigSchema.safeParse(mergeConfigPatch(stored, input.patch));
    if (!parsed.success) {
      return err(
        new InvalidTenantConfigError('Invalid config', { issues: z.prettifyError(parsed.error) }),
      );
    }

    await this.configs.save(tenant, parsed.data, this.clock.now());
    this.cache.invalidate(tenant.id);
    await this.bus.publish({ kind: 'config', tenantId: tenant.id });
    return ok(parsed.data);
  }
}
