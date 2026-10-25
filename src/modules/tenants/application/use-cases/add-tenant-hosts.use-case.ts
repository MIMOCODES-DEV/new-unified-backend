import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { HostName, type InvalidHostNameError } from '../../domain/host-name.js';
import type { Tenant } from '../../domain/tenant.entity.js';
import {
  type InvalidTenantError,
  TenantConflictError,
  TenantNotFoundError,
} from '../../domain/tenant.errors.js';
import { TenantRepository } from '../ports/tenant.repository.js';

export type AddTenantHostsError =
  TenantNotFoundError | InvalidHostNameError | InvalidTenantError | TenantConflictError;

/** Lets a brand answer on more host names. A host owned by another brand is never moved. */
@Injectable()
export class AddTenantHostsUseCase {
  constructor(private readonly tenants: TenantRepository) {}

  async execute(input: {
    slug: string;
    hosts: string[];
  }): Promise<Result<Tenant, AddTenantHostsError>> {
    const tenant = await this.tenants.findBySlug(input.slug.trim().toLowerCase());
    if (!tenant) {
      return err(new TenantNotFoundError('No brand with this slug', { slug: input.slug }));
    }

    const hosts: HostName[] = [];
    for (const raw of new Set(input.hosts)) {
      const host = HostName.parse(raw);
      if (!host.ok) return host;
      if (!tenant.hosts.some((h) => h.equals(host.value))) hosts.push(host.value);
    }
    if (hosts.length === 0) return ok(tenant);

    const taken = await this.tenants.findTakenHosts(hosts);
    if (taken.length > 0) {
      return err(new TenantConflictError('Host names already belong to another tenant', { taken }));
    }
    for (const host of hosts) {
      const added = tenant.addHost(host);
      if (!added.ok) return added;
    }
    await this.tenants.save(tenant);
    return ok(tenant);
  }
}
