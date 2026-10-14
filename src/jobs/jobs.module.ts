import { Module } from '@nestjs/common';
import { HeartbeatJob } from './heartbeat.job.js';
import type { JobHandler } from './job-handler.js';
import { JOB_HANDLERS, JobsRunner } from './jobs.runner.js';

const handlers = [HeartbeatJob];

@Module({
  providers: [
    ...handlers,
    {
      provide: JOB_HANDLERS,
      inject: handlers,
      useFactory: (...instances: JobHandler[]) => instances,
    },
    JobsRunner,
  ],
})
export class JobsModule {}
