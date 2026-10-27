import { Redis } from 'ioredis';
import { ClsServiceManager } from 'nestjs-cls';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { centralMigrations, tenantMigrations } from '../../src/migrations.js';
import { DeviceIdentity } from '../../src/modules/devices/application/device-identity.js';
import { SeedDeviceExamples } from '../../src/modules/devices/application/seed-device-examples.js';
import { MongoCaptchaRepository } from '../../src/modules/devices/infrastructure/mongo-captcha.repository.js';
import { MongoPaidDeviceRepository } from '../../src/modules/devices/infrastructure/mongo-paid-device.repository.js';
import { MongoTrialDeviceRepository } from '../../src/modules/devices/infrastructure/mongo-trial-device.repository.js';
import { RedisDeviceLock } from '../../src/modules/devices/infrastructure/redis-device-lock.js';
import { SeedDomainMigrationExamples } from '../../src/modules/domain-migrations/application/seed-domain-migration-examples.js';
import { MongoDomainMigrationRepository } from '../../src/modules/domain-migrations/infrastructure/mongo-domain-migration.repository.js';
import { SeedLicenseExamples } from '../../src/modules/licensing/application/seed-license-examples.js';
import { MongoLicenseRepository } from '../../src/modules/licensing/infrastructure/mongo-license.repository.js';
import { SeedPlaylistExamples } from '../../src/modules/playlists/application/seed-playlist-examples.js';
import { MongoPlaylistRepository } from '../../src/modules/playlists/infrastructure/mongo-playlist.repository.js';
import type { AppConfig } from '../../src/shared/config/app-config.js';
import { runMigrations } from '../../src/shared/database/migrations/migration-runner.js';
import { MongoClientPool } from '../../src/shared/database/mongo-client.pool.js';
import { TenantDbRegistry } from '../../src/shared/database/tenant-db.registry.js';
import { SystemClock } from '../../src/shared/kernel/clock.js';
import { DEFAULT_TENANT_SETTINGS } from '../../src/shared/kernel/tenant-settings.js';
import { RedisLock } from '../../src/shared/redis/redis-lock.js';
import type { CurrentTenant } from '../../src/shared/tenancy/current-tenant.js';
import { TenantContext } from '../../src/shared/tenancy/tenant-context.js';
import { TenantDb } from '../../src/shared/tenancy/tenant-db.js';
import { startInfrastructure, type TestInfrastructure } from '../support/infrastructure.js';

const brand: CurrentTenant = {
  id: 'id-seed',
  slug: 'seed',
  name: 'seed',
  dbName: 'p1_seed',
  settings: DEFAULT_TENANT_SETTINGS,
};

describe('seed:examples (npm run seed)', () => {
  let infra: TestInfrastructure;
  const pool = new MongoClientPool();
  let registry: TenantDbRegistry;
  let context: TenantContext;
  let redis: Redis;
  let seedBrand: () => Promise<Record<string, number>>;
  let seedCentral: () => Promise<Record<string, number>>;

  beforeAll(async () => {
    infra = await startInfrastructure();
    registry = new TenantDbRegistry(pool, { env: { MONGO_URI: infra.mongoUri } } as AppConfig);
    context = new TenantContext(ClsServiceManager.getClsService());
    redis = new Redis(infra.redisUrl);
    await redis.ping();
    await runMigrations(await registry.getDb({ dbName: brand.dbName }), tenantMigrations);
    const central = await registry.getDb({ dbName: 'p1_seed_central' });
    await runMigrations(central, centralMigrations);

    const tenantDb = new TenantDb(context, registry);
    const clock = new SystemClock();
    const trials = new MongoTrialDeviceRepository(tenantDb);
    const paid = new MongoPaidDeviceRepository(tenantDb);
    const identity = new DeviceIdentity(
      trials,
      paid,
      new RedisDeviceLock(new RedisLock(redis), context),
    );
    const devices = new SeedDeviceExamples(
      identity,
      trials,
      paid,
      new MongoCaptchaRepository(tenantDb),
      clock,
    );
    const licenses = new SeedLicenseExamples(new MongoLicenseRepository(tenantDb), clock);
    const playlists = new SeedPlaylistExamples(new MongoPlaylistRepository(tenantDb), clock);
    const moves = new SeedDomainMigrationExamples(
      new MongoDomainMigrationRepository(central),
      clock,
    );

    seedBrand = () =>
      context.run(brand, async () => ({
        ...(await devices.execute()),
        ...(await licenses.execute()),
        ...(await playlists.execute()),
      }));
    seedCentral = () => moves.execute();
  });

  afterAll(async () => {
    await redis?.quit();
    await pool.closeAll();
    await infra?.stop();
  });

  it('writes an example of every Phase 1 collection, and a second run changes no counts', async () => {
    const first = { ...(await seedBrand()), ...(await seedCentral()) };
    const second = { ...(await seedBrand()), ...(await seedCentral()) };

    expect(first).toEqual({
      trialDevices: 5,
      devices: 4,
      captchas: 4,
      licenses: 5,
      playlists: 5,
      domainMigrations: 3,
    });
    expect(second).toEqual(first);

    const db = await registry.getDb({ dbName: brand.dbName });
    for (const [collection, count] of Object.entries({
      trialDevices: 5,
      devices: 4,
      captchas: 4,
      licenses: 5,
      playlists: 5,
    })) {
      expect(await db.collection(collection).countDocuments()).toBe(count);
    }
  });

  it('keeps every MAC in one collection and points every paid device at its license', async () => {
    const db = await registry.getDb({ dbName: brand.dbName });
    const trialMacs = await db.collection('trialDevices').distinct('macAddress');
    const paidDevices = await db.collection('devices').find().toArray();

    expect(paidDevices.filter((d) => trialMacs.includes(d['macAddress']))).toHaveLength(0);
    for (const device of paidDevices) {
      expect(
        await db.collection('licenses').countDocuments({ _id: device['currentLicenseId'] }),
      ).toBe(1);
    }
  });
});
