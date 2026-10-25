import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type { Tenant } from '../../domain/tenant.entity.js';
import { TenantNotFoundError } from '../../domain/tenant.errors.js';
import { TenantRepository } from '../ports/tenant.repository.js';

/** One brand by slug, enabled or not. */
@Injectable()
export class GetTenantUseCase {
  constructor(private readonly tenants: TenantRepository) {}

  async execute(slug: string): Promise<Result<Tenant, TenantNotFoundError>> {
    const tenant = await this.tenants.findBySlug(slug.trim().toLowerCase());
    return tenant ? ok(tenant) : err(new TenantNotFoundError('No brand with this slug', { slug }));
  }
}
