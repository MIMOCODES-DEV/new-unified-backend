import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { playlistsMigrations } from '../../src/modules/playlists/index.js';
import { startInfrastructure, type TestInfrastructure } from '../support/infrastructure.js';

describe('migration 0006-playlist-account on MongoDB', () => {
  let infra: TestInfrastructure;
  let client: MongoClient;

  beforeAll(async () => {
    infra = await startInfrastructure();
    client = await new MongoClient(infra.mongoUri).connect();
  });

  afterAll(async () => {
    await client?.close();
    await infra?.stop();
  });

  it('moves a code playlist status to account and gives every other playlist account null', async () => {
    const db = client.db(`p1_account_${Date.now()}`);
    const [create, move] = playlistsMigrations;
    await create!.up(db);
    const at = new Date('2026-10-20T10:00:00Z');
    const expires = new Date('2027-01-01T00:00:00Z');
    const base = {
      deviceId: 'd1',
      url: null,
      xtream: null,
      stalker: null,
      epgUrl: null,
      backup: { enabled: false, hosts: [] },
      protected: false,
      pinEnc: null,
      provider: null,
      addedBy: { via: 'app', resellerId: null },
      legacy: null,
      createdAt: at,
      updatedAt: at,
    };
    // Rows as the first playlists migration stored them: status inside code, no account.
    await db.collection('playlists').insertMany(
      [
        {
          _id: 'c1' as never,
          ...base,
          name: 'Code',
          type: 'code',
          code: { code: '1', status: 'Active', expiresAt: expires },
        },
        {
          _id: 'c2' as never,
          ...base,
          name: 'Bare code',
          type: 'code',
          code: { code: '2', status: null, expiresAt: null },
        },
        {
          _id: 'm1' as never,
          ...base,
          name: 'List',
          type: 'm3u',
          url: 'http://x.example/l.m3u',
          code: null,
        },
      ],
      { bypassDocumentValidation: true },
    );

    await move!.up(db);

    const rows = await db
      .collection('playlists')
      .find({}, { sort: { _id: 1 } })
      .toArray();
    expect(rows.map((r): unknown[] => [r._id, r['code'], r['account']])).toEqual([
      ['c1', { code: '1' }, { status: 'Active', expiresAt: expires, checkedAt: at }],
      ['c2', { code: '2' }, null],
      ['m1', null, null],
    ]);
    await db.dropDatabase();
  });

  it('0005 → 0006 → 0007 on duplicate names: renamed, then one name per device is enforced', async () => {
    const db = client.db(`p1_names_${Date.now()}`);
    const [create, move, unique] = playlistsMigrations;
    await create!.up(db);
    const at = (minute: number) => new Date(Date.UTC(2026, 9, 20, 10, minute));
    // Rows as 0005 stored them: no account field yet.
    const row = (id: string, deviceId: string, name: string, minute: number, url: string) => ({
      _id: id as never,
      deviceId,
      name,
      type: 'm3u',
      url,
      xtream: null,
      stalker: null,
      code: null,
      epgUrl: null,
      backup: { enabled: false, hosts: [] },
      protected: false,
      pinEnc: null,
      provider: null,
      addedBy: { via: 'app', resellerId: null },
      legacy: null,
      createdAt: at(minute),
      updatedAt: at(minute),
    });
    // Saved before the rule: three "Sports" on one device next to a real "Sports (2)", one on another.
    await db
      .collection('playlists')
      .insertMany([
        row('a', 'd1', 'Sports', 1, 'http://x.example/1.m3u'),
        row('b', 'd1', 'sports ', 2, 'http://x.example/2.m3u'),
        row('c', 'd1', 'SPORTS', 3, 'http://x.example/3.m3u'),
        row('d', 'd2', 'Sports', 4, 'http://x.example/4.m3u'),
        row('e', 'd1', 'Sports (2)', 5, 'http://x.example/5.m3u'),
      ]);

    await move!.up(db);
    await unique!.up(db);

    const names = await db
      .collection('playlists')
      .find({}, { sort: { _id: 1 } })
      .toArray();
    expect(names.map((r): unknown[] => [r._id, r['name'], r['account']])).toEqual([
      ['a', 'Sports', null],
      ['b', 'sports (3)', null],
      ['c', 'SPORTS (4)', null],
      ['d', 'Sports', null],
      ['e', 'Sports (2)', null],
    ]);
    await expect(
      db
        .collection('playlists')
        .insertOne({ ...row('f', 'd1', 'sPoRtS', 6, 'http://x.example/6.m3u'), account: null }),
    ).rejects.toMatchObject({ code: 11000 });
    await db.dropDatabase();
  });
});
