/** BullMQ queue names. Jobs are consumed only by the worker process. */
export const QueueName = {
  Maintenance: 'maintenance',
} as const;

export type QueueName = (typeof QueueName)[keyof typeof QueueName];
