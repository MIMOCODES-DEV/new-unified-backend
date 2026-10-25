import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { SecretName } from '../../domain/secret-name.js';
import {
  type InvalidTenantSecretError,
  TenantNotFoundError,
  TenantSecretNotFoundError,
} from '../../domain/tenant.errors.js';
import { TenantChangeBus } from '../ports/tenant-change.bus.js';
import { TenantRepository } from '../ports/tenant.repository.js';
import { TenantSecretRepository } from '../ports/tenant-secret.repository.js';
import { TenantSecretCache } from '../tenant-memory-cache.js';

export type DeleteTenantSecretError =
  TenantNotFoundError | InvalidTenantSecretError | TenantSecretNotFoundError;

@Injectable()
export class DeleteTenantSecretUseCase {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly secrets: TenantSecretRepository,
    private readonly cache: TenantSecretCache,
    private readonly bus: TenantChangeBus,
  ) {}

  async execute(input: {
    slug: string;
    name: string;
  }): Promise<Result<void, DeleteTenantSecretError>> {
    const name = SecretName.parse(input.name);
    if (!name.ok) return name;
    const tenant = await this.tenants.findBySlug(input.slug.trim().toLowerCase());
    if (!tenant) {
      return err(new TenantNotFoundError('No brand with this slug', { slug: input.slug }));
    }
    if (!(await this.secrets.delete(tenant.id, name.value.value))) {
      return err(new TenantSecretNotFoundError('No such secret', { name: name.value.value }));
    }
    this.cache.invalidate(tenant.id);
    await this.bus.publish({ kind: 'secrets', tenantId: tenant.id });
    return ok(undefined);
  }
}
