import { Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { DevicesModule } from './modules/devices/index.js';
import { TenantsModule } from './modules/tenants/index.js';
import { ConfigModule } from './shared/config/config.module.js';
import { DatabaseModule } from './shared/database/database.module.js';
import { LoggerModule } from './shared/logger/logger.module.js';
import { TenancyModule } from './shared/tenancy/tenancy.module.js';

/** Root module for one-shot CLI commands (migrations, tenant provisioning, ETL). */
@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    ClsModule.forRoot({ global: true }),
    DatabaseModule,
    TenancyModule,
    TenantsModule,
    DevicesModule,
  ],
})
export class CliModule {}
