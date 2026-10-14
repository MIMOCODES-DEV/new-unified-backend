import type { Job } from 'bullmq';

/** One kind of background job. Register it in `jobs.module.ts` with a schedule if it repeats. */
export interface JobHandler {
  readonly name: string;
  /** Repeat interval in ms for scheduled jobs; omit for jobs that are only enqueued. */
  readonly everyMs?: number;
  handle(job: Job): Promise<void>;
}
