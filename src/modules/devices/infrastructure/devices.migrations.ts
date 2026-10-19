import type { Migration } from '../../../shared/database/migrations/migration.js';
import { CAPTCHAS_COLLECTION } from './mongo-captcha.repository.js';
import { DEVICES_COLLECTION } from './mongo-device.repository.js';

/** Brand-database migrations owned by the devices module. Run with `pnpm cli migrate:tenants`. */
export const devicesMigrations: readonly Migration[] = [
  {
    id: '0001-devices-indexes',
    description: 'One device per MAC per brand; fast lookup by device key',
    up: async (db) => {
      const devices = db.collection(DEVICES_COLLECTION);
      await devices.createIndex({ macAddress: 1 }, { unique: true, name: 'macAddress_unique' });
      await devices.createIndex({ deviceKey: 1 }, { name: 'deviceKey' });
    },
  },
  {
    id: '0002-captchas-ttl',
    description: 'Delete unanswered captchas when they expire (verified ones have no expiresAt)',
    up: async (db) => {
      await db
        .collection(CAPTCHAS_COLLECTION)
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'expiresAt_ttl' });
    },
  },
];
