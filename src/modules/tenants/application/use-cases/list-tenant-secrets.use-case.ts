import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { TenantNotFoundError } from '../../domain/tenant.errors.js';
import { TenantRepository } from '../ports/tenant.repository.js';
import {
  TenantSecretRepository,
  type TenantSecretSummary,
} from '../ports/tenant-secret.repository.js';

/** Which secrets a brand has, and when each changed. Values are never listed. */
@Injectable()
export class ListTenantSecretsUseCase {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly secrets: TenantSecretRepository,
  ) {}

  async execute(slug: string): Promise<Result<TenantSecretSummary[], TenantNotFoundError>> {
    const tenant = await this.tenants.findBySlug(slug.trim().toLowerCase());
    if (!tenant) return err(new TenantNotFoundError('No brand with this slug', { slug }));
    return ok(await this.secrets.list(tenant.id));
  }
}
