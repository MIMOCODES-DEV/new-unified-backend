import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { SecretName } from '../../domain/secret-name.js';
import { InvalidTenantSecretError, TenantNotFoundError } from '../../domain/tenant.errors.js';
import { SecretCipher } from '../ports/secret-cipher.js';
import { TenantChangeBus } from '../ports/tenant-change.bus.js';
import { TenantRepository } from '../ports/tenant.repository.js';
import { TenantSecretRepository } from '../ports/tenant-secret.repository.js';
import { TenantSecretCache } from '../tenant-memory-cache.js';
import { secretContext } from './get-tenant-secret.use-case.js';

const MAX_VALUE_LENGTH = 8_192;

export type SetTenantSecretError = TenantNotFoundError | InvalidTenantSecretError;

/** Stores (or replaces) one brand secret, encrypted. The value is never logged or echoed back. */
@Injectable()
export class SetTenantSecretUseCase {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly secrets: TenantSecretRepository,
    private readonly cipher: SecretCipher,
    private readonly cache: TenantSecretCache,
    private readonly bus: TenantChangeBus,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    slug: string;
    name: string;
    value: string;
  }): Promise<Result<void, SetTenantSecretError>> {
    const name = SecretName.parse(input.name);
    if (!name.ok) return name;
    if (input.value.length === 0 || input.value.length > MAX_VALUE_LENGTH) {
      return err(
        new InvalidTenantSecretError(`A secret value must be 1-${MAX_VALUE_LENGTH} characters`, {
          name: name.value.value,
        }),
      );
    }
    const tenant = await this.tenants.findBySlug(input.slug.trim().toLowerCase());
    if (!tenant) {
      return err(new TenantNotFoundError('No brand with this slug', { slug: input.slug }));
    }

    const encrypted = this.cipher.encrypt(input.value, secretContext(tenant.id, name.value.value));
    await this.secrets.save(tenant.id, name.value.value, encrypted, this.clock.now());
    this.cache.invalidate(tenant.id);
    await this.bus.publish({ kind: 'secrets', tenantId: tenant.id });
    return ok(undefined);
  }
}
