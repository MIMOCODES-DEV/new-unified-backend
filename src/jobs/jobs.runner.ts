import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { type Job, Queue, Worker } from 'bullmq';
import { AppConfig } from '../shared/config/app-config.js';
import { QueueName } from '../shared/queue/queue.names.js';
import { createRedisConnection } from '../shared/redis/redis.connection.js';
import type { JobHandler } from './job-handler.js';

export const JOB_HANDLERS = Symbol('JOB_HANDLERS');

/**
 * Owns the maintenance queue in the worker process: registers schedules (BullMQ job
 * schedulers run once cluster-wide, unlike the old per-worker setInterval crons) and
 * dispatches each job to its handler.
 */
@Injectable()
export class JobsRunner implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JobsRunner.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    private readonly config: AppConfig,
    @Inject(JOB_HANDLERS) private readonly handlers: readonly JobHandler[],
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // BullMQ requires maxRetriesPerRequest: null on its blocking connections.
    const connection = () =>
      createRedisConnection(this.config.env.REDIS_URL, { maxRetriesPerRequest: null });
    const byName = new Map(this.handlers.map((h) => [h.name, h]));

    this.queue = new Queue(QueueName.Maintenance, { connection: connection() });
    for (const handler of this.handlers) {
      if (handler.everyMs) {
        await this.queue.upsertJobScheduler(
          handler.name,
          { every: handler.everyMs },
          { name: handler.name },
        );
      }
    }

    this.worker = new Worker(
      QueueName.Maintenance,
      async (job: Job) => {
        const handler = byName.get(job.name);
        if (!handler) {
          throw new Error(`No handler for job "${job.name}"`);
        }
        await handler.handle(job);
      },
      { connection: connection() },
    );
    this.worker.on('failed', (job, error) =>
      this.logger.error(`Job ${job?.name ?? '?'} failed: ${error.message}`),
    );
    this.logger.log(
      `Worker listening on "${QueueName.Maintenance}" (${this.handlers.length} handlers)`,
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
