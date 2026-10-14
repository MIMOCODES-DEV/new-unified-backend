import { MongoClient } from 'mongodb';

/**
 * One pooled MongoClient per URI per process, created lazily.
 * Concurrent callers share the same in-flight connection promise, so a burst of
 * requests can never open duplicate connections; a failed connect is evicted and retried.
 */
export class MongoClientPool {
  private readonly clients = new Map<string, Promise<MongoClient>>();

  get(uri: string): Promise<MongoClient> {
    let client = this.clients.get(uri);
    if (!client) {
      client = MongoClient.connect(uri, {
        appName: 'unified-backend',
        serverSelectionTimeoutMS: 5_000,
      }).catch((error: unknown) => {
        this.clients.delete(uri);
        throw error;
      });
      this.clients.set(uri, client);
    }
    return client;
  }

  async closeAll(): Promise<void> {
    const pending = [...this.clients.values()];
    this.clients.clear();
    await Promise.allSettled(pending.map(async (client) => (await client).close()));
  }
}
