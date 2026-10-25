import { MongoClient } from 'mongodb';

interface PooledClient {
  client: Promise<MongoClient>;
  lastUsedAt: number;
}

/**
 * One pooled MongoClient per URI per process, created lazily.
 * Concurrent callers share the same in-flight connection promise, so a burst of
 * requests can never open duplicate connections; a failed connect is evicted and retried.
 * Clients nobody asked for in a while are closed by `closeIdle` (brands on other clusters).
 */
export class MongoClientPool {
  private readonly clients = new Map<string, PooledClient>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly connect: (uri: string) => Promise<MongoClient> = (uri) =>
      MongoClient.connect(uri, { appName: 'unified-backend', serverSelectionTimeoutMS: 5_000 }),
  ) {}

  get(uri: string): Promise<MongoClient> {
    const pooled = this.clients.get(uri);
    if (pooled) {
      pooled.lastUsedAt = this.now();
      return pooled.client;
    }
    const client = this.connect(uri).catch((error: unknown) => {
      this.clients.delete(uri);
      throw error;
    });
    this.clients.set(uri, { client, lastUsedAt: this.now() });
    return client;
  }

  /** Closes clients unused for `maxIdleMs`, except those in `keep`. Returns how many were closed. */
  async closeIdle(maxIdleMs: number, keep: ReadonlySet<string>): Promise<number> {
    const cutoff = this.now() - maxIdleMs;
    const idle = [...this.clients].filter(
      ([uri, pooled]) => !keep.has(uri) && pooled.lastUsedAt <= cutoff,
    );
    for (const [uri] of idle) this.clients.delete(uri);
    await Promise.allSettled(idle.map(async ([, pooled]) => (await pooled.client).close()));
    return idle.length;
  }

  /** Pings every open client. `down` counts clients that failed to connect or do not answer. */
  async health(): Promise<{ open: number; down: number }> {
    const results = await Promise.allSettled(
      [...this.clients.values()].map(async (pooled) =>
        (await pooled.client).db('admin').command({ ping: 1 }),
      ),
    );
    return {
      open: results.length,
      down: results.filter((r) => r.status === 'rejected').length,
    };
  }

  async closeAll(): Promise<void> {
    const pending = [...this.clients.values()];
    this.clients.clear();
    await Promise.allSettled(pending.map(async (pooled) => (await pooled.client).close()));
  }
}
