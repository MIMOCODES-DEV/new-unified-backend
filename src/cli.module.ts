import { Module } from '@nestjs/common';
import { TenantsModule } from './modules/tenants/index.js';
import { ConfigModule } from './shared/config/config.module.js';
import { DatabaseModule } from './shared/database/database.module.js';
import { LoggerModule } from './shared/logger/logger.module.js';

/** Root module for one-shot CLI commands (migrations, tenant provisioning, ETL). */
@Module({
  imports: [ConfigModule, LoggerModule, DatabaseModule, TenantsModule],
})
export class CliModule {}
