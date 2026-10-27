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

/** The fields of a playlists row as 0005 stored it, for the validator. */
const firstFields = () => ({
  _id: bson.string(),
  deviceId: bson.string(),
  name: bson.string(),
  type: bson.enum(PLAYLIST_TYPES),
  url: nullableString(),
  xtream: bson.nullable(bson.anyObject()),
  stalker: bson.nullable(bson.anyObject()),
  code: bson.nullable(bson.anyObject()),
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

/** The current shape of a playlists row (0006 added account), for the validator. */
const playlistsSchema = () =>
  bson.object({ ...firstFields(), account: bson.nullable(bson.anyObject()) });

/** One name per device; case does not matter ("My List" and "my list" are the same name). */
export const PLAYLIST_NAME_INDEX = 'name_once_per_device';
const CASE_INSENSITIVE = { locale: 'en', strength: 2 };

/** The indexes 0005 created. An applied migration never changes, so 0005 and 0006 keep to these. */
const firstIndexes: IndexDescription[] = [
  // Every playlist read is by device (the old backends scanned the whole collection).
  { key: { deviceId: 1, createdAt: 1 }, name: 'device' },
  ...sameOnceIndexes,
  {
    key: { 'legacy.id': 1 },
    name: 'legacy_id',
    partialFilterExpression: { 'legacy.id': { $type: 'string' } },
  },
];

/** Added by 0007, only once older duplicate names are renamed. */
const nameIndex: IndexDescription = {
  key: { deviceId: 1, name: 1 },
  name: PLAYLIST_NAME_INDEX,
  unique: true,
  collation: CASE_INSENSITIVE,
};

/** Brand-database migrations owned by the playlists module. */
export const playlistsMigrations: readonly Migration[] = [
  {
    id: '0005-playlists',
    description: 'playlists: one collection for m3u, xtream, stalker and code playlists',
    up: (db) =>
      ensureCollection(db, PLAYLISTS_COLLECTION, bson.object(firstFields()), firstIndexes),
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
      await ensureCollection(db, PLAYLISTS_COLLECTION, playlistsSchema(), firstIndexes);
    },
  },
  {
    id: '0007-playlist-name-unique',
    description: 'playlists: one name per device (case does not matter); older duplicates renamed',
    up: async (db) => {
      const playlists = db.collection<{ _id: string; deviceId: string; name: string }>(
        PLAYLISTS_COLLECTION,
      );
      // Rows saved before the rule: the oldest keeps its name, the others get the first free
      // " (2)", " (3)", … on their device.
      const groups = await playlists
        .aggregate<{ _id: { deviceId: string }; ids: string[]; names: string[] }>(
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
      const taken = async (deviceId: string, name: string) =>
        (await playlists.countDocuments(
          { deviceId, name },
          { collation: CASE_INSENSITIVE, limit: 1 },
        )) > 0;
      for (const group of groups) {
        let suffix = 2;
        for (let i = 1; i < group.ids.length; i++) {
          const base = group.names[i]!.trim();
          while (await taken(group._id.deviceId, `${base} (${suffix})`)) suffix++;
          await playlists.updateOne(
            { _id: group.ids[i]! },
            { $set: { name: `${base} (${suffix})` } },
          );
          suffix++;
        }
      }
      await ensureCollection(db, PLAYLISTS_COLLECTION, playlistsSchema(), [
        ...firstIndexes,
        nameIndex,
      ]);
    },
  },
];
