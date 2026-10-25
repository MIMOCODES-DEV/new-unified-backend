import { Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { TenantsModule } from './modules/tenants/index.js';
import { ConfigModule } from './shared/config/config.module.js';
import { DatabaseModule } from './shared/database/database.module.js';
import { LoggerModule } from './shared/logger/logger.module.js';
import { RedisModule } from './shared/redis/redis.module.js';
import { TenancyModule } from './shared/tenancy/tenancy.module.js';

/** Root module for one-shot CLI commands (migrations, tenant provisioning, ETL). */
@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    ClsModule.forRoot({ global: true }),
    DatabaseModule,
    TenancyModule,
    // Brand changes made here must reach running APIs: host cache and change notices live in Redis.
    RedisModule,
    TenantsModule,
  ],
})
export class CliModule {}
