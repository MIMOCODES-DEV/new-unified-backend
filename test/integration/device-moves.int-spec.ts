import { Redis } from 'ioredis';
import type { Db } from 'mongodb';
import { ClsServiceManager } from 'nestjs-cls';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { centralMigrations, tenantMigrations } from '../../src/migrations.js';
import { DeviceIdentity } from '../../src/modules/devices/application/device-identity.js';
import { MongoPaidDeviceRepository } from '../../src/modules/devices/infrastructure/mongo-paid-device.repository.js';
import { MongoTrialDeviceRepository } from '../../src/modules/devices/infrastructure/mongo-trial-device.repository.js';
import { RedisDeviceLock } from '../../src/modules/devices/infrastructure/redis-device-lock.js';
import type { DomainMigration } from '../../src/modules/domain-migrations/domain/domain-migration.js';
import { MongoDomainMigrationRepository } from '../../src/modules/domain-migrations/infrastructure/mongo-domain-migration.repository.js';
import type { AppConfig } from '../../src/shared/config/app-config.js';
import { runMigrations } from '../../src/shared/database/migrations/migration-runner.js';
import { MongoClientPool } from '../../src/shared/database/mongo-client.pool.js';
import { TenantDbRegistry } from '../../src/shared/database/tenant-db.registry.js';
import { DEFAULT_TENANT_SETTINGS } from '../../src/shared/kernel/tenant-settings.js';
import { RedisLock } from '../../src/shared/redis/redis-lock.js';
import type { CurrentTenant } from '../../src/shared/tenancy/current-tenant.js';
import { TenantContext } from '../../src/shared/tenancy/tenant-context.js';
import { TenantDb } from '../../src/shared/tenancy/tenant-db.js';
import { paidDevice, trialDevice } from '../support/device-fakes.js';
import { startInfrastructure, type TestInfrastructure } from '../support/infrastructure.js';

const A: CurrentTenant = {
  id: 'id-moves',
  slug: 'moves',
  name: 'moves',
  dbName: 'p4_moves',
  settings: DEFAULT_TENANT_SETTINGS,
};
const NOW = new Date('2026-10-27T10:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

function move(id: string, overrides: Partial<DomainMigration> = {}): DomainMigration {
  return {
    id,
    kind: 'migration',
    fromHost: 'old.example:8080',
    toHost: 'new.example:8080',
    fromScheme: 'http',
    toScheme: 'http',
    confirmations: [],
    source: 'user',
    status: 'pending',
    decidedBy: null,
    decidedAt: null,
    firstSeenAt: NOW,
    lastConfirmedAt: NOW,
    legacy: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const confirmation = (n: number, ipHash = `ip-${n}`) => ({
  tenantId: A.id,
  deviceId: `device-${n}`,
  ipHash,
  at: NOW,
});

/** Phase 4 · Moves and cleanup: the Mongo side of recovery, cleanup and provider moves. */
describe('Device moves on MongoDB and Redis', () => {
  let infra: TestInfrastructure;
  const pool = new MongoClientPool();
  let registry: TenantDbRegistry;
  let context: TenantContext;
  let redis: Redis;
  let central: Db;
  let trials: MongoTrialDeviceRepository;
  let paid: MongoPaidDeviceRepository;
  let identity: DeviceIdentity;
  let moves: MongoDomainMigrationRepository;

  beforeAll(async () => {
    infra = await startInfrastructure();
    registry = new TenantDbRegistry(pool, { env: { MONGO_URI: infra.mongoUri } } as AppConfig);
    context = new TenantContext(ClsServiceManager.getClsService());
    const tenantDb = new TenantDb(context, registry);
    redis = new Redis(infra.redisUrl);
    await runMigrations(await registry.getDb({ dbName: A.dbName }), tenantMigrations);
    central = await registry.getDb({ dbName: 'p4_central' });
    await runMigrations(central, centralMigrations);

    trials = new MongoTrialDeviceRepository(tenantDb);
    paid = new MongoPaidDeviceRepository(tenantDb);
    identity = new DeviceIdentity(trials, paid, new RedisDeviceLock(new RedisLock(redis), context));
    moves = new MongoDomainMigrationRepository(central);
  });

  afterAll(async () => {
    await redis?.quit();
    await pool.closeAll();
    await infra?.stop();
  });

  describe('recovery codes (REC-1, REC-2)', () => {
    it('sets a code on a device with no recovery record yet, and finds the device by it', async () => {
      await context.run(A, async () => {
        await paid.insert(paidDevice({ id: 'rec-1', macAddress: '40:00:00:00:00:01' }));
        const expiresAt = new Date('2026-10-27T10:30:00Z');

        expect(await paid.setRecoveryCode('rec-1', 'ABCD2345', expiresAt, NOW)).toBe('set');
        expect((await paid.findByRecoveryCode('ABCD2345'))?.recovery).toEqual({
          code: 'ABCD2345',
          expiresAt,
          enabled: false,
          recoveredFrom: null,
          recoveredAt: null,
        });
      });
    });

    it('replaces the code but keeps the rest of the record', async () => {
      await context.run(A, async () => {
        await paid.insert(
          paidDevice({
            id: 'rec-2',
            macAddress: '40:00:00:00:00:02',
            recovery: {
              code: 'OLDC2345',
              expiresAt: daysAgo(1),
              enabled: true,
              recoveredFrom: '40:00:00:00:00:99',
              recoveredAt: daysAgo(30),
            },
          }),
        );

        expect(await paid.setRecoveryCode('rec-2', 'NEWC2345', NOW, NOW)).toBe('set');
        expect((await paid.findById('rec-2'))?.recovery).toMatchObject({
          code: 'NEWC2345',
          enabled: true,
          recoveredFrom: '40:00:00:00:00:99',
        });
        expect(await paid.findByRecoveryCode('OLDC2345')).toBeNull();
      });
    });

    it('one code belongs to one device; a cleared code does not count', async () => {
      await context.run(A, async () => {
        expect(await paid.setRecoveryCode('rec-2', 'ABCD2345', NOW, NOW)).toBe('taken');
        expect(await paid.setRecoveryCode('missing', 'ZZZZ2345', NOW, NOW)).toBe('missing');
        // Two devices with no code (null) do not clash.
        await paid.insert(
          paidDevice({
            id: 'rec-3',
            macAddress: '40:00:00:00:00:03',
            recovery: {
              code: null,
              expiresAt: null,
              enabled: false,
              recoveredFrom: null,
              recoveredAt: null,
            },
          }),
        );
        await paid.insert(
          paidDevice({
            id: 'rec-4',
            macAddress: '40:00:00:00:00:04',
            recovery: {
              code: null,
              expiresAt: null,
              enabled: false,
              recoveredFrom: null,
              recoveredAt: null,
            },
          }),
        );
      });
    });
  });

  describe('stale trial devices (LIC-4)', () => {
    it('lists ended trials with no playlist not seen since the date, the longest ended first', async () => {
      await context.run(A, async () => {
        const trial = (id: string, n: number, ended: number, seen: number, count = 0) =>
          trials.insert(
            trialDevice({
              id,
              macAddress: `41:00:00:00:00:0${n}`,
              trialEndsAt: daysAgo(ended),
              lastSeenAt: daysAgo(seen),
              playlistCount: count,
            }),
          );
        await trial('old', 1, 400, 390);
        await trial('older', 2, 500, 490);
        await trial('seen', 3, 400, 5);
        await trial('used', 4, 400, 390, 2);

        const stale = await trials.listStale(NOW, daysAgo(180), 10);
        expect(stale.map((t) => t.id)).toEqual(['older', 'old']);
        expect((await trials.listStale(NOW, daysAgo(180), 1)).map((t) => t.id)).toEqual(['older']);
      });
    });

    it('deletes a trial device under its MAC lock only while the rule still holds', async () => {
      await context.run(A, async () => {
        const removed: string[] = [];
        const remember = (t: { id: string }) => {
          removed.push(t.id);
          return Promise.resolve();
        };
        const kept = await identity.deleteTrial('old', (t) => t.lastSeenAt > NOW, remember);
        expect(kept).toBe(false);
        expect(removed).toEqual([]);

        const gone = await identity.deleteTrial('old', () => true, remember);
        expect(gone).toBe(true);
        expect(removed).toEqual(['old']);
        expect(await trials.findById('old')).toBeNull();
      });
    });
  });

  describe('provider move confirmations (DOM-1)', () => {
    it('creates the move on the first confirmation and adds later ones in one write', async () => {
      expect(await moves.confirm(move('m-1'), confirmation(1))).toBe('created');
      expect(await moves.confirm(move('m-unused'), confirmation(2))).toBe('confirmed');

      const stored = await moves.findByHosts('old.example:8080', 'new.example:8080');
      expect(stored?.id).toBe('m-1');
      expect(stored?.status).toBe('pending');
      expect(stored?.confirmations.map((c) => c.deviceId)).toEqual(['device-1', 'device-2']);
    });

    it('refuses a second confirmation from the same IP or the same device', async () => {
      expect(await moves.confirm(move('m-x'), confirmation(3, 'ip-1'))).toBe('already');
      expect(await moves.confirm(move('m-x'), confirmation(1, 'ip-9'))).toBe('already');
      const stored = await moves.findByHosts('old.example:8080', 'new.example:8080');
      expect(stored?.confirmations).toHaveLength(2);
    });

    it('keeps every confirmation sent at the same time', async () => {
      const at = move('m-2', { fromHost: 'a.example', toHost: 'b.example' });
      const results = await Promise.all(
        [10, 11, 12, 13, 14].map((n) => moves.confirm({ ...at, id: `m-2-${n}` }, confirmation(n))),
      );

      expect(results.filter((r) => r === 'created')).toHaveLength(1);
      expect(results.filter((r) => r === 'confirmed')).toHaveLength(4);
      const stored = await moves.findByHosts('a.example', 'b.example');
      expect(stored?.confirmations).toHaveLength(5);
      expect(
        await central.collection('domainMigrations').countDocuments({ fromHost: 'a.example' }),
      ).toBe(1);
    });
  });
});
