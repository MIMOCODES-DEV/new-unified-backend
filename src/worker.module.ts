import { Module } from '@nestjs/common';
import { JobsModule } from './jobs/jobs.module.js';
import { ConfigModule } from './shared/config/config.module.js';
import { DatabaseModule } from './shared/database/database.module.js';
import { LoggerModule } from './shared/logger/logger.module.js';
import { RedisModule } from './shared/redis/redis.module.js';

/** Root module of the worker process: BullMQ consumers and schedules. No HTTP. */
@Module({
  imports: [ConfigModule, LoggerModule, DatabaseModule, RedisModule, JobsModule],
})
export class WorkerModule {}
