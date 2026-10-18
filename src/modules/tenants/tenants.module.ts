import { Module } from '@nestjs/common';
import { Clock, SystemClock } from '../../shared/kernel/clock.js';
import { TenantRepository } from './application/ports/tenant.repository.js';
import { CreateTenantUseCase } from './application/use-cases/create-tenant.use-case.js';
import { ResolveTenantUseCase } from './application/use-cases/resolve-tenant.use-case.js';
import { SeedTenantsUseCase } from './application/use-cases/seed-tenants.use-case.js';
import { MongoTenantRepository } from './infrastructure/mongo-tenant.repository.js';

@Module({
  providers: [
    ResolveTenantUseCase,
    CreateTenantUseCase,
    SeedTenantsUseCase,
    { provide: TenantRepository, useClass: MongoTenantRepository },
    { provide: Clock, useClass: SystemClock },
  ],
  exports: [ResolveTenantUseCase, CreateTenantUseCase, SeedTenantsUseCase],
})
export class TenantsModule {}
