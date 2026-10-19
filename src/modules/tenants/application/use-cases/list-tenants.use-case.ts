import { Injectable } from '@nestjs/common';
import type { Tenant } from '../../domain/tenant.entity.js';
import { TenantRepository } from '../ports/tenant.repository.js';

/** Every brand, enabled or not, ordered by slug. Used to run per-brand work (migrations, jobs). */
@Injectable()
export class ListTenantsUseCase {
  constructor(private readonly tenants: TenantRepository) {}

  execute(): Promise<Tenant[]> {
    return this.tenants.findAll();
  }
}
