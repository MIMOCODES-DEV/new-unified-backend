import type { Db } from 'mongodb';

/**
 * A versioned, forward-only change to a database: indexes, collection options, data fixes.
 * Indexes are created here, never by `autoIndex`. `id` is ordered: `0001-...`, `0002-...`.
 */
export interface Migration {
  readonly id: string;
  readonly description: string;
  up(db: Db): Promise<void>;
}
