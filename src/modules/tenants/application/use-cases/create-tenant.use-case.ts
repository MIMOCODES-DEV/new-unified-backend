import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { HostName, type InvalidHostNameError } from '../../domain/host-name.js';
import { Tenant } from '../../domain/tenant.entity.js';
import { TenantConflictError, type InvalidTenantError } from '../../domain/tenant.errors.js';
import { TenantRepository } from '../ports/tenant.repository.js';

export interface CreateTenantInput {
  slug: string;
  name: string;
  hosts: string[];
}

export type CreateTenantError = InvalidHostNameError | InvalidTenantError | TenantConflictError;

/** Registers a new brand with the host names it answers on. Used by the CLI today, admin API later. */
@Injectable()
export class CreateTenantUseCase {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: CreateTenantInput): Promise<Result<Tenant, CreateTenantError>> {
    const hosts: HostName[] = [];
    for (const raw of input.hosts) {
      const host = HostName.parse(raw);
      if (!host.ok) {
        return host;
      }
      hosts.push(host.value);
    }

    const created = Tenant.create({
      id: randomUUID(),
      slug: input.slug,
      name: input.name,
      hosts,
      now: this.clock.now(),
    });
    if (!created.ok) {
      return created;
    }
    const tenant = created.value;

    if (await this.tenants.findBySlug(tenant.slug)) {
      return err(
        new TenantConflictError('A tenant with this slug already exists', { slug: tenant.slug }),
      );
    }
    const taken = await this.tenants.findTakenHosts(tenant.hosts);
    if (taken.length > 0) {
      return err(new TenantConflictError('Host names already belong to another tenant', { taken }));
    }

    await this.tenants.save(tenant);
    return ok(tenant);
  }
}
