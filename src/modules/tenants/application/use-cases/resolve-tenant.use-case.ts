import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { HostName, type InvalidHostNameError } from '../../domain/host-name.js';
import type { Tenant } from '../../domain/tenant.entity.js';
import { TenantDisabledError, UnknownHostError } from '../../domain/tenant.errors.js';
import { TenantRepository } from '../ports/tenant.repository.js';

export type ResolveTenantError = InvalidHostNameError | UnknownHostError | TenantDisabledError;

/** Answers "which brand is this request for?" from the Host header. Exact match only. */
@Injectable()
export class ResolveTenantUseCase {
  constructor(private readonly tenants: TenantRepository) {}

  async execute(rawHost: string | undefined): Promise<Result<Tenant, ResolveTenantError>> {
    const host = HostName.parse(rawHost ?? '');
    if (!host.ok) {
      return host;
    }

    const tenant = await this.tenants.findByHost(host.value);
    if (!tenant) {
      return err(
        new UnknownHostError('No brand is configured for this host', { host: host.value.value }),
      );
    }
    if (!tenant.isActive) {
      return err(new TenantDisabledError('This brand is disabled', { slug: tenant.slug }));
    }
    return ok(tenant);
  }
}
