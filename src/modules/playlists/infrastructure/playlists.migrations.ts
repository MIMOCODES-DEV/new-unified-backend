import type { IndexDescription } from 'mongodb';
import type { Migration } from '../../../shared/database/migrations/migration.js';
import { bson, ensureCollection } from '../../../shared/database/migrations/ensure-collection.js';
import { ADDED_VIA, PLAYLIST_TYPES, type PlaylistType } from '../domain/playlist.js';
import { PLAYLISTS_COLLECTION } from './playlist.document.js';

const nullableString = () => bson.nullable(bson.string());

/** One unique key per playlist type, so the same playlist cannot be saved twice for a device. */
const sameOnceKeys: Record<PlaylistType, Record<string, 1>> = {
  m3u: { deviceId: 1, url: 1 },
  xtream: { deviceId: 1, 'xtream.server': 1, 'xtream.username': 1 },
  stalker: { deviceId: 1, 'stalker.portalUrl': 1, 'stalker.mac': 1 },
  code: { deviceId: 1, 'code.code': 1 },
};
const sameOnceIndexes: IndexDescription[] = PLAYLIST_TYPES.map((type) => ({
  key: sameOnceKeys[type],
  name: `${type}_once_per_device`,
  unique: true,
  partialFilterExpression: { type },
}));

/** The current shape of a playlists row, for the validator. */
const playlistsSchema = () =>
  bson.object({
    _id: bson.string(),
    deviceId: bson.string(),
    name: bson.string(),
    type: bson.enum(PLAYLIST_TYPES),
    url: nullableString(),
    xtream: bson.nullable(bson.anyObject()),
    stalker: bson.nullable(bson.anyObject()),
    code: bson.nullable(bson.anyObject()),
    account: bson.nullable(bson.anyObject()),
    epgUrl: nullableString(),
    backup: bson.object({ enabled: bson.bool(), hosts: bson.array(bson.string()) }),
    protected: bson.bool(),
    pinEnc: nullableString(),
    provider: bson.nullable(bson.anyObject()),
    addedBy: bson.object({ via: bson.enum(ADDED_VIA), resellerId: nullableString() }),
    legacy: bson.nullable(bson.anyObject()),
    createdAt: bson.date(),
    updatedAt: bson.date(),
  });

const playlistsIndexes: IndexDescription[] = [
  // Every playlist read is by device (the old backends scanned the whole collection).
  { key: { deviceId: 1, createdAt: 1 }, name: 'device' },
  ...sameOnceIndexes,
  {
    key: { 'legacy.id': 1 },
    name: 'legacy_id',
    partialFilterExpression: { 'legacy.id': { $type: 'string' } },
  },
];

/** Brand-database migrations owned by the playlists module. */
export const playlistsMigrations: readonly Migration[] = [
  {
    id: '0005-playlists',
    description: 'playlists: one collection for m3u, xtream, stalker and code playlists',
    up: (db) => ensureCollection(db, PLAYLISTS_COLLECTION, playlistsSchema(), playlistsIndexes),
  },
  {
    id: '0006-playlist-account',
    description:
      'playlists: the provider account status moves from code to account, for every playlist type',
    up: async (db) => {
      const playlists = db.collection(PLAYLISTS_COLLECTION);
      // A code playlist that had a status or expiry keeps it, as its account.
      await playlists.updateMany(
        {
          type: 'code',
          $or: [{ 'code.status': { $type: 'string' } }, { 'code.expiresAt': { $type: 'date' } }],
        },
        [
          {
            $set: {
              account: {
                status: { $ifNull: ['$code.status', null] },
                expiresAt: { $ifNull: ['$code.expiresAt', null] },
                checkedAt: '$updatedAt',
              },
            },
          },
        ],
      );
      await playlists.updateMany({ account: { $exists: false } }, { $set: { account: null } });
      await playlists.updateMany(
        { type: 'code' },
        { $unset: { 'code.status': '', 'code.expiresAt': '' } },
      );
      await ensureCollection(db, PLAYLISTS_COLLECTION, playlistsSchema(), playlistsIndexes);
    },
  },
];
