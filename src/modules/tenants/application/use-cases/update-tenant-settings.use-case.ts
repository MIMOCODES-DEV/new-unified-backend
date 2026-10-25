import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type { Tenant } from '../../domain/tenant.entity.js';
import { InvalidTenantSettingsError, TenantNotFoundError } from '../../domain/tenant.errors.js';
import { TenantRepository } from '../ports/tenant.repository.js';
import { tenantSettingsPatchSchema } from '../tenant-settings.schema.js';

export type UpdateTenantSettingsError = TenantNotFoundError | InvalidTenantSettingsError;

/** Changes some of a brand's settings (flags, profiles, CORS origins, …); the rest stay as they are. */
@Injectable()
export class UpdateTenantSettingsUseCase {
  constructor(private readonly tenants: TenantRepository) {}

  async execute(input: {
    slug: string;
    patch: unknown;
  }): Promise<Result<Tenant, UpdateTenantSettingsError>> {
    const patch = tenantSettingsPatchSchema.safeParse(input.patch);
    if (!patch.success) {
      return err(
        new InvalidTenantSettingsError('Invalid settings', {
          issues: z.prettifyError(patch.error),
        }),
      );
    }
    const tenant = await this.tenants.findBySlug(input.slug.trim().toLowerCase());
    if (!tenant) {
      return err(new TenantNotFoundError('No brand with this slug', { slug: input.slug }));
    }
    if (tenant.updateSettings(patch.data)) await this.tenants.save(tenant);
    return ok(tenant);
  }
}
