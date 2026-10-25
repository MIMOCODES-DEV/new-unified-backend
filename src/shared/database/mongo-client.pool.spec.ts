import type { MongoClient } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { MongoClientPool } from './mongo-client.pool.js';

interface FakeClient {
  uri: string;
  closed: boolean;
  healthy: boolean;
}

function setup() {
  let now = 0;
  const opened: FakeClient[] = [];
  const pool = new MongoClientPool(
    () => now,
    (uri) => {
      if (uri.includes('unreachable')) return Promise.reject(new Error('connect failed'));
      const client: FakeClient = { uri, closed: false, healthy: true };
      opened.push(client);
      return Promise.resolve({
        close: () => {
          client.closed = true;
          return Promise.resolve();
        },
        db: () => ({
          command: () =>
            client.healthy ? Promise.resolve({ ok: 1 }) : Promise.reject(new Error('down')),
        }),
      } as unknown as MongoClient);
    },
  );
  return { pool, opened, advance: (ms: number) => (now += ms) };
}

describe('MongoClientPool', () => {
  it('opens one client per URI, even for concurrent callers', async () => {
    const { pool, opened } = setup();

    const [a, b] = await Promise.all([pool.get('mongodb://one'), pool.get('mongodb://one')]);

    expect(a).toBe(b);
    expect(opened).toHaveLength(1);
  });

  it('forgets a failed connection so the next caller retries', async () => {
    const { pool } = setup();

    await expect(pool.get('mongodb://unreachable')).rejects.toThrow('connect failed');

    expect((await pool.health()).open).toBe(0);
  });

  it('closes clients idle for too long, but never the kept ones', async () => {
    const { pool, opened, advance } = setup();
    await pool.get('mongodb://central');
    await pool.get('mongodb://other-cluster');

    advance(10_000);
    await pool.get('mongodb://other-cluster'); // used again: stays open
    expect(await pool.closeIdle(5_000, new Set(['mongodb://central']))).toBe(0);

    advance(10_000);
    expect(await pool.closeIdle(5_000, new Set(['mongodb://central']))).toBe(1);
    expect(opened.map((c) => [c.uri, c.closed])).toEqual([
      ['mongodb://central', false],
      ['mongodb://other-cluster', true],
    ]);
  });

  it('reconnects after an idle client was closed', async () => {
    const { pool, opened, advance } = setup();
    await pool.get('mongodb://other-cluster');
    advance(10_000);
    await pool.closeIdle(5_000, new Set());

    await pool.get('mongodb://other-cluster');

    expect(opened).toHaveLength(2);
  });

  it('reports clients that do not answer a ping', async () => {
    const { pool, opened } = setup();
    await pool.get('mongodb://one');
    await pool.get('mongodb://two');
    opened[1]!.healthy = false;

    expect(await pool.health()).toEqual({ open: 2, down: 1 });
  });
});
