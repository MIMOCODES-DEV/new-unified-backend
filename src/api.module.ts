import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ClsModule } from 'nestjs-cls';
import { HealthModule } from './interfaces/http/health/health.module.js';
import { LegacyAppsModule } from './interfaces/legacy/apps/legacy-apps.module.js';
import { LegacyV4Module } from './interfaces/legacy/v4/legacy-v4.module.js';
import { TenantHttpModule } from './interfaces/http/tenant/tenant-http.module.js';
import { AccessGuard } from './shared/auth/access.guard.js';
import { ConfigModule } from './shared/config/config.module.js';
import { DatabaseModule } from './shared/database/database.module.js';
import { GlobalExceptionFilter } from './shared/errors/global-exception.filter.js';
import { LoggerModule } from './shared/logger/logger.module.js';
import { RedisModule } from './shared/redis/redis.module.js';
import { TenancyModule } from './shared/tenancy/tenancy.module.js';

/** Root module of the HTTP process. No jobs run here. */
@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    ClsModule.forRoot({ global: true, middleware: { mount: true, generateId: true } }),
    DatabaseModule,
    TenancyModule,
    RedisModule,
    HealthModule,
    TenantHttpModule,
    LegacyV4Module,
    LegacyAppsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class ApiModule {}
