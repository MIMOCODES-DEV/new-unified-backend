import type { IndexDescription } from 'mongodb';
import type { Migration } from '../../../shared/database/migrations/migration.js';
import { bson, ensureCollection } from '../../../shared/database/migrations/ensure-collection.js';
import { CAPTCHA_KINDS } from '../domain/captcha.js';
import { API_VERSIONS, PLATFORMS } from '../domain/device.js';
import { CAPTCHAS_COLLECTION } from './captcha.document.js';
import { PAID_DEVICES_COLLECTION, TRIAL_DEVICES_COLLECTION } from './device.document.js';

const nullableString = () => bson.nullable(bson.string());
const nullableDate = () => bson.nullable(bson.date());

const deviceBase = {
  _id: bson.string(),
  macAddress: bson.string(),
  appDeviceId: nullableString(),
  platform: bson.enum(PLATFORMS),
  deviceKey: bson.string(),
  uid: nullableString(),
  stalkerEnabled: bson.bool(),
  parentPin: nullableString(),
  apiVersion: bson.enum(API_VERSIONS),
  appVersion: nullableString(),
  ip: bson.string(),
  lastSeenAt: bson.date(),
  legacy: bson.nullable(bson.anyObject()),
  createdAt: bson.date(),
  updatedAt: bson.date(),
};

/** Indexes both device collections share. MAC uniqueness across the two is kept by DeviceIdentity. */
const deviceIndexes: IndexDescription[] = [
  { key: { macAddress: 1 }, name: 'mac_unique', unique: true },
  {
    key: { appDeviceId: 1 },
    name: 'app_device_id_unique',
    unique: true,
    partialFilterExpression: { appDeviceId: { $type: 'string' } },
  },
  { key: { uid: 1 }, name: 'uid', partialFilterExpression: { uid: { $type: 'string' } } },
  {
    key: { 'legacy.id': 1 },
    name: 'legacy_id',
    partialFilterExpression: { 'legacy.id': { $type: 'string' } },
  },
];

/** Brand-database migrations owned by the devices module. */
export const devicesMigrations: readonly Migration[] = [
  {
    id: '0001-trial-devices',
    description: 'trialDevices: devices that never paid, one per MAC',
    up: (db) =>
      ensureCollection(
        db,
        TRIAL_DEVICES_COLLECTION,
        bson.object({
          ...deviceBase,
          trialStartedAt: bson.date(),
          trialEndsAt: bson.date(),
          playlistCount: bson.number(),
          firstPlaylistAt: nullableDate(),
        }),
        [
          ...deviceIndexes,
          // The cleanup job looks for ended trials that never added a playlist.
          { key: { trialEndsAt: 1, playlistCount: 1 }, name: 'trial_cleanup' },
        ],
      ),
  },
  {
    id: '0002-devices',
    description: 'devices: devices that paid at least once, one per MAC',
    up: (db) =>
      ensureCollection(
        db,
        PAID_DEVICES_COLLECTION,
        bson.object({
          ...deviceBase,
          currentLicenseId: bson.string(),
          activatedAt: bson.date(),
          resellerId: nullableString(),
          customerId: nullableString(),
          switch: bson.nullable(bson.anyObject()),
          recovery: bson.nullable(bson.anyObject()),
        }),
        [...deviceIndexes, { key: { currentLicenseId: 1 }, name: 'current_license' }],
      ),
  },
  {
    id: '0003-captchas',
    description: 'captchas: unanswered ones expire, solved ones are kept for their MAC',
    up: (db) =>
      ensureCollection(
        db,
        CAPTCHAS_COLLECTION,
        bson.object({
          _id: bson.string(),
          token: bson.string(),
          kind: bson.enum(CAPTCHA_KINDS),
          macAddress: nullableString(),
          appDeviceId: nullableString(),
          platform: nullableString(),
          answerHash: bson.string(),
          verifiedAt: nullableDate(),
          expiresAt: nullableDate(),
          createdAt: bson.date(),
        }),
        [
          { key: { token: 1 }, name: 'token_unique', unique: true },
          { key: { macAddress: 1, kind: 1 }, name: 'mac_kind' },
          // Rows without expiresAt (solved captchas) are never removed.
          { key: { expiresAt: 1 }, name: 'expires_ttl', expireAfterSeconds: 0 },
        ],
      ),
  },
  {
    id: '0008-device-recovery-code',
    description: 'devices: a recovery code belongs to one device, and the device is found by it',
    up: async (db) => {
      await db.collection(PAID_DEVICES_COLLECTION).createIndex(
        { 'recovery.code': 1 },
        {
          name: 'recovery_code_unique',
          unique: true,
          partialFilterExpression: { 'recovery.code': { $type: 'string' } },
        },
      );
    },
  },
  {
    id: '0010-devices-customer',
    description: 'devices: a customer account lists its linked devices (CUS-3)',
    up: async (db) => {
      await db
        .collection(PAID_DEVICES_COLLECTION)
        .createIndex(
          { customerId: 1 },
          { name: 'customer', partialFilterExpression: { customerId: { $type: 'string' } } },
        );
    },
  },
];
