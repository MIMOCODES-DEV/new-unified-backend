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

/** One name per device; case does not matter ("My List" and "my list" are the same name). */
export const PLAYLIST_NAME_INDEX = 'name_once_per_device';
const CASE_INSENSITIVE = { locale: 'en', strength: 2 };

const playlistsIndexes: IndexDescription[] = [
  // Every playlist read is by device (the old backends scanned the whole collection).
  { key: { deviceId: 1, createdAt: 1 }, name: 'device' },
  ...sameOnceIndexes,
  {
    key: { deviceId: 1, name: 1 },
    name: PLAYLIST_NAME_INDEX,
    unique: true,
    collation: CASE_INSENSITIVE,
  },
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
  {
    id: '0007-playlist-name-unique',
    description: 'playlists: one name per device (case does not matter); older duplicates renamed',
    up: async (db) => {
      const playlists = db.collection<{ _id: string; deviceId: string; name: string }>(
        PLAYLISTS_COLLECTION,
      );
      // Rows saved before the rule: the oldest keeps its name, the others get " (2)", " (3)", …
      const groups = await playlists
        .aggregate<{ ids: string[]; names: string[] }>(
          [
            { $sort: { createdAt: 1, _id: 1 } },
            {
              $group: {
                _id: { deviceId: '$deviceId', name: { $toLower: { $trim: { input: '$name' } } } },
                ids: { $push: '$_id' },
                names: { $push: '$name' },
                count: { $sum: 1 },
              },
            },
            { $match: { count: { $gt: 1 } } },
          ],
          { collation: CASE_INSENSITIVE },
        )
        .toArray();
      for (const group of groups) {
        for (let i = 1; i < group.ids.length; i++) {
          await playlists.updateOne(
            { _id: group.ids[i]! },
            { $set: { name: `${group.names[i]!.trim()} (${i + 1})` } },
          );
        }
      }
      await ensureCollection(db, PLAYLISTS_COLLECTION, playlistsSchema(), playlistsIndexes);
    },
  },
];
