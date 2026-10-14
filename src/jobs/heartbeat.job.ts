import { Injectable, Logger } from '@nestjs/common';
import type { JobHandler } from './job-handler.js';

/** Sample scheduled job: proves the worker runs scheduled work exactly once per interval. */
@Injectable()
export class HeartbeatJob implements JobHandler {
  readonly name = 'heartbeat';
  readonly everyMs = 60_000;
  private readonly logger = new Logger(HeartbeatJob.name);

  handle(): Promise<void> {
    this.logger.log('worker alive');
    return Promise.resolve();
  }
}
