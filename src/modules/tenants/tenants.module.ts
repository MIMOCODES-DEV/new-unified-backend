import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { Db } from 'mongodb';
import { CENTRAL_DB } from '../../shared/database/database.tokens.js';
import { Clock, SystemClock } from '../../shared/kernel/clock.js';
import { REDIS } from '../../shared/redis/redis.connection.js';
import { SecretCipher } from './application/ports/secret-cipher.js';
import { TenantChangeBus } from './application/ports/tenant-change.bus.js';
import { TenantConfigRepository } from './application/ports/tenant-config.repository.js';
import { TenantSecretRepository } from './application/ports/tenant-secret.repository.js';
import { TenantRepository } from './application/ports/tenant.repository.js';
import { TenantConfigCache, TenantSecretCache } from './application/tenant-memory-cache.js';
import { AddTenantHostsUseCase } from './application/use-cases/add-tenant-hosts.use-case.js';
import { CreateTenantUseCase } from './application/use-cases/create-tenant.use-case.js';
import { DeleteTenantSecretUseCase } from './application/use-cases/delete-tenant-secret.use-case.js';
import { GetTenantConfigUseCase } from './application/use-cases/get-tenant-config.use-case.js';
import { GetTenantSecretUseCase } from './application/use-cases/get-tenant-secret.use-case.js';
import { GetTenantUseCase } from './application/use-cases/get-tenant.use-case.js';
import { ListTenantSecretsUseCase } from './application/use-cases/list-tenant-secrets.use-case.js';
import { ListTenantsUseCase } from './application/use-cases/list-tenants.use-case.js';
import { ResolveTenantUseCase } from './application/use-cases/resolve-tenant.use-case.js';
import { SeedTenantsUseCase } from './application/use-cases/seed-tenants.use-case.js';
import { SetTenantSecretUseCase } from './application/use-cases/set-tenant-secret.use-case.js';
import { UpdateTenantConfigUseCase } from './application/use-cases/update-tenant-config.use-case.js';
import { UpdateTenantSettingsUseCase } from './application/use-cases/update-tenant-settings.use-case.js';
import { EnvelopeSecretCipher } from './infrastructure/envelope-secret.cipher.js';
import { MongoTenantConfigRepository } from './infrastructure/mongo-tenant-config.repository.js';
import { MongoTenantSecretRepository } from './infrastructure/mongo-tenant-secret.repository.js';
import { MongoTenantRepository } from './infrastructure/mongo-tenant.repository.js';
import { RedisCachedTenantRepository } from './infrastructure/redis-cached-tenant.repository.js';
import { RedisTenantChangeBus } from './infrastructure/redis-tenant-change.bus.js';

const useCases = [
  ResolveTenantUseCase,
  CreateTenantUseCase,
  SeedTenantsUseCase,
  ListTenantsUseCase,
  GetTenantUseCase,
  AddTenantHostsUseCase,
  UpdateTenantSettingsUseCase,
  SetTenantSecretUseCase,
  DeleteTenantSecretUseCase,
  ListTenantSecretsUseCase,
  GetTenantSecretUseCase,
  GetTenantConfigUseCase,
  UpdateTenantConfigUseCase,
];

/** Needs DatabaseModule, RedisModule and ConfigModule (all global). */
@Module({
  providers: [
    ...useCases,
    {
      provide: TenantRepository,
      inject: [CENTRAL_DB, REDIS],
      useFactory: (db: Db, redis: Redis) =>
        new RedisCachedTenantRepository(new MongoTenantRepository(db), redis),
    },
    { provide: TenantSecretRepository, useClass: MongoTenantSecretRepository },
    { provide: TenantConfigRepository, useClass: MongoTenantConfigRepository },
    { provide: SecretCipher, useClass: EnvelopeSecretCipher },
    { provide: TenantChangeBus, useClass: RedisTenantChangeBus },
    TenantSecretCache,
    TenantConfigCache,
    { provide: Clock, useClass: SystemClock },
  ],
  exports: useCases,
})
export class TenantsModule {}
