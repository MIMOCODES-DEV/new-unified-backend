import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ClsModule } from 'nestjs-cls';
import { AccountsHttpModule } from './interfaces/http/accounts/accounts-http.module.js';
import { DevHttpModule } from './interfaces/http/dev/dev-http.module.js';
import { SiteHttpModule } from './interfaces/http/site/site-http.module.js';
import { StoreHttpModule } from './interfaces/http/store/store-http.module.js';
import { LegacyHttpModule } from './interfaces/http/legacy/legacy-http.module.js';
import { HealthModule } from './interfaces/http/health/health.module.js';
import { TenantHttpModule } from './interfaces/http/tenant/tenant-http.module.js';
import { AccessGuard } from './shared/auth/access.guard.js';
import { ConfigModule } from './shared/config/config.module.js';
import { DatabaseModule } from './shared/database/database.module.js';
import { GlobalExceptionFilter } from './shared/errors/global-exception.filter.js';
import {
  DevicesWithBrandConfig,
  DomainMigrationsWithDevices,
  LicensingWithDevices,
  PlaylistsWithDevices,
} from './module-settings.js';
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
    // The old apps' routes (same paths and formats as the old backends).
    LegacyHttpModule,
    StoreHttpModule,
    // Customer accounts and staff (Phase 5); also gives the guard its staff check.
    AccountsHttpModule,
    // The brand site's device dashboard and public tools (Phase 6).
    SiteHttpModule,
    // Dev-only routes to try the device rules (404 in production).
    DevHttpModule,
    DevicesWithBrandConfig,
    LicensingWithDevices,
    PlaylistsWithDevices,
    DomainMigrationsWithDevices,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class ApiModule {}
