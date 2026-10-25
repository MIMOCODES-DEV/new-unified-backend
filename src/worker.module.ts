import { Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { JobsModule } from './jobs/jobs.module.js';
import { ConfigModule } from './shared/config/config.module.js';
import { DatabaseModule } from './shared/database/database.module.js';
import { LoggerModule } from './shared/logger/logger.module.js';
import { RedisModule } from './shared/redis/redis.module.js';
import { TenancyModule } from './shared/tenancy/tenancy.module.js';

/** Root module of the worker process: BullMQ consumers and schedules. No HTTP. */
@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    ClsModule.forRoot({ global: true }),
    DatabaseModule,
    TenancyModule,
    RedisModule,
    JobsModule,
  ],
})
export class WorkerModule {}
