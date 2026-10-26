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
});
