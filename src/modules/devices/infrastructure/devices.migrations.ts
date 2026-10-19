import type { Migration } from '../../../shared/database/migrations/migration.js';
import { CAPTCHA_TTL_SECONDS, CAPTCHAS_COLLECTION } from './mongo-captcha.store.js';
import { DEVICES_COLLECTION, PENDING_DEVICES_COLLECTION } from './mongo-device.repository.js';

/** Brand-database migrations owned by the devices module (`pnpm cli migrate:tenants`). */
export const devicesMigrations: readonly Migration[] = [
  {
    id: '0001-devices-indexes',
    description: 'One device per MAC and per device key, in pendingDevices and in devices',
    up: async (db) => {
      for (const name of [PENDING_DEVICES_COLLECTION, DEVICES_COLLECTION]) {
        const collection = db.collection(name);
        await collection.createIndex({ macAddress: 1 }, { unique: true, name: 'mac_unique' });
        await collection.createIndex({ deviceKey: 1 }, { unique: true, name: 'device_key_unique' });
      }
    },
  },
  {
    id: '0002-captchas-ttl',
    description: 'V4 captchas expire after 5 minutes; lookups by MAC and purpose',
    up: async (db) => {
      const captchas = db.collection(CAPTCHAS_COLLECTION);
      await captchas.createIndex(
        { createdAt: 1 },
        { expireAfterSeconds: CAPTCHA_TTL_SECONDS, name: 'captcha_ttl' },
      );
      await captchas.createIndex({ macAddress: 1, purpose: 1 }, { name: 'mac_purpose' });
    },
  },
  {
    id: '0003-app-device-id',
    description: 'Devices without a usable MAC are found by app_device_id, one device per install',
    up: async (db) => {
      for (const name of [PENDING_DEVICES_COLLECTION, DEVICES_COLLECTION]) {
        await db.collection(name).createIndex(
          { appDeviceId: 1 },
          {
            unique: true,
            name: 'app_device_id_unique',
            partialFilterExpression: { appDeviceId: { $type: 'string' } },
          },
        );
      }
    },
  },
];
