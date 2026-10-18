// Public API of the tenants module: the only file other modules and interfaces may import.
export { TenantsModule } from './tenants.module.js';
export { TenantRepository } from './application/ports/tenant.repository.js';
export { ResolveTenantUseCase } from './application/use-cases/resolve-tenant.use-case.js';
export { CreateTenantUseCase } from './application/use-cases/create-tenant.use-case.js';
export {
  SeedTenantsUseCase,
  type SeedTenantEntry,
} from './application/use-cases/seed-tenants.use-case.js';
export { tenantsMigrations } from './infrastructure/tenants.migrations.js';
