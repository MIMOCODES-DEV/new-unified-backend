import { Redis } from 'ioredis';
import type { Db } from 'mongodb';
import { ClsServiceManager } from 'nestjs-cls';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { centralMigrations, tenantMigrations } from '../../src/migrations.js';
import { DeviceIdentity } from '../../src/modules/devices/application/device-identity.js';
import { MongoCaptchaRepository } from '../../src/modules/devices/infrastructure/mongo-captcha.repository.js';
import { MongoPaidDeviceRepository } from '../../src/modules/devices/infrastructure/mongo-paid-device.repository.js';
import { MongoTrialDeviceRepository } from '../../src/modules/devices/infrastructure/mongo-trial-device.repository.js';
import { RedisDeviceLock } from '../../src/modules/devices/infrastructure/redis-device-lock.js';
import { MongoDomainMigrationRepository } from '../../src/modules/domain-migrations/infrastructure/mongo-domain-migration.repository.js';
import { MongoLicenseRepository } from '../../src/modules/licensing/infrastructure/mongo-license.repository.js';
import { MongoPlaylistRepository } from '../../src/modules/playlists/infrastructure/mongo-playlist.repository.js';
import type { Playlist } from '../../src/modules/playlists/domain/playlist.js';
import type { AppConfig } from '../../src/shared/config/app-config.js';
import { runMigrations } from '../../src/shared/database/migrations/migration-runner.js';
import { MongoClientPool } from '../../src/shared/database/mongo-client.pool.js';
import { TenantDbRegistry } from '../../src/shared/database/tenant-db.registry.js';
import { MacAddress } from '../../src/shared/kernel/mac-address.js';
import { DEFAULT_TENANT_SETTINGS } from '../../src/shared/kernel/tenant-settings.js';
import { LockUnavailableError, RedisLock } from '../../src/shared/redis/redis-lock.js';
import type { CurrentTenant } from '../../src/shared/tenancy/current-tenant.js';
import { TenantContext } from '../../src/shared/tenancy/tenant-context.js';
import { TenantDb } from '../../src/shared/tenancy/tenant-db.js';
import { trialDevice } from '../support/device-fakes.js';
import { startInfrastructure, type TestInfrastructure } from '../support/infrastructure.js';

const brand = (slug: string): CurrentTenant => ({
  id: `id-${slug}`,
  slug,
  name: slug,
  dbName: `p1_${slug}`,
  settings: DEFAULT_TENANT_SETTINGS,
});
const A = brand('a');
const B = brand('b');

const mac = (value: string) => {
  const parsed = MacAddress.parse(value);
  if (!parsed.ok) throw parsed.error;
  return parsed.value;
};

function m3u(id: string, deviceId: string): Playlist {
  const at = new Date('2026-10-25T10:00:00Z');
  return {
    id,
    deviceId,
    name: 'List',
    type: 'm3u',
    url: 'http://provider.example/list.m3u',
    xtream: null,
    stalker: null,
    code: null,
    account: null,
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
}

describe('Device core on MongoDB and Redis', () => {
  let infra: TestInfrastructure;
  const pool = new MongoClientPool();
  let registry: TenantDbRegistry;
  let context: TenantContext;
  let redis: Redis;
  let central: Db;
  let trials: MongoTrialDeviceRepository;
  let paid: MongoPaidDeviceRepository;
  let identity: DeviceIdentity;

  beforeAll(async () => {
    infra = await startInfrastructure();
    registry = new TenantDbRegistry(pool, { env: { MONGO_URI: infra.mongoUri } } as AppConfig);
    context = new TenantContext(ClsServiceManager.getClsService());
    const tenantDb = new TenantDb(context, registry);
    redis = new Redis(infra.redisUrl);
    await redis.ping();

    for (const b of [A, B]) {
      await runMigrations(await registry.getDb({ dbName: b.dbName }), tenantMigrations);
    }
    central = await registry.getDb({ dbName: 'p1_central' });
    await runMigrations(central, centralMigrations);

    trials = new MongoTrialDeviceRepository(tenantDb);
    paid = new MongoPaidDeviceRepository(tenantDb);
    identity = new DeviceIdentity(trials, paid, new RedisDeviceLock(new RedisLock(redis), context));
  });

  afterAll(async () => {
    await redis?.quit();
    await pool.closeAll();
    await infra?.stop();
  });

  describe('migrations (SCH-1)', () => {
    it('creates the five brand collections and domainMigrations, and running again changes nothing', async () => {
      const db = await registry.getDb({ dbName: A.dbName });
      const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);

      expect(names).toEqual(
        expect.arrayContaining(['trialDevices', 'devices', 'licenses', 'playlists', 'captchas']),
      );
      expect(await central.listCollections({ name: 'domainMigrations' }).hasNext()).toBe(true);
      expect(await runMigrations(db, tenantMigrations)).toEqual([]);
    });

    it('creates the indexes, including the TTL on captchas', async () => {
      const db = await registry.getDb({ dbName: A.dbName });
      const names = async (c: string) => (await db.collection(c).indexes()).map((i) => i.name);

      expect(await names('trialDevices')).toEqual(
        expect.arrayContaining([
          'mac_unique',
          'app_device_id_unique',
          'uid',
          'legacy_id',
          'trial_cleanup',
        ]),
      );
      expect(await names('devices')).toEqual(
        expect.arrayContaining(['mac_unique', 'current_license']),
      );
      expect(await names('licenses')).toEqual(
        expect.arrayContaining(['device_history', 'device_source_unique']),
      );
      expect(await names('playlists')).toEqual(
        expect.arrayContaining([
          'device',
          'm3u_once_per_device',
          'xtream_once_per_device',
          'code_once_per_device',
        ]),
      );
      const ttl = (await db.collection('captchas').indexes()).find((i) => i.name === 'expires_ttl');
      expect(ttl?.expireAfterSeconds).toBe(0);
    });

    it('refuses a hand-written row that breaks the validator', async () => {
      const db = await registry.getDb({ dbName: A.dbName });

      await expect(
        db
          .collection('trialDevices')
          .insertOne({ _id: 'bad' as never, macAddress: 'x', platform: 'Samsung' }),
      ).rejects.toMatchObject({ code: 121 });
    });

    it('refuses the same playlist twice for one device, but not for another device', async () => {
      await context.run(A, async () => {
        const playlists = new MongoPlaylistRepository(new TenantDb(context, registry));
        await playlists.insert(m3u('pl-1', 'device-1'));

        await expect(playlists.insert(m3u('pl-2', 'device-1'))).resolves.toBe('duplicate');
        await expect(playlists.insert(m3u('pl-3', 'device-2'))).resolves.toBe('inserted');
        // Editing another playlist into a copy of pl-1 is refused the same way.
        await playlists.insert({
          ...m3u('pl-4', 'device-1'),
          name: 'Other',
          url: 'http://other.example/list',
        });
        await expect(
          playlists.update({
            ...m3u('pl-4', 'device-1'),
            name: 'Other',
            url: m3u('pl-1', 'device-1').url,
          }),
        ).resolves.toBe('duplicate');
        await expect(playlists.update(m3u('pl-missing', 'device-1'))).resolves.toBe('missing');
        // One name per device, whatever the case.
        await expect(
          playlists.insert({ ...m3u('pl-5', 'device-1'), name: 'LIST', url: 'http://n.example/x' }),
        ).resolves.toBe('name_taken');
      });
    });
  });

  describe('repositories (SCH-2)', () => {
    it('counts playlists on a trial device in one write each, never below 0', async () => {
      const device = trialDevice({ id: 'count-1', macAddress: '10:00:00:00:00:21' });
      const at = new Date('2026-10-26T10:00:00Z');
      await context.run(A, async () => {
        await trials.insert(device);
        // Five adds at once all count.
        await Promise.all([1, 2, 3, 4, 5].map(() => trials.changePlaylistCount('count-1', 1, at)));
        await trials.changePlaylistCount('count-1', -9, new Date(at.getTime() + 1000));

        expect(await trials.findById('count-1')).toMatchObject({
          playlistCount: 0,
          firstPlaylistAt: at,
        });
        expect(await trials.changePlaylistCount('nobody', 1, at)).toBe(false);
      });
    });

    it('keeps each brand to its own database', async () => {
      const device = trialDevice({
        id: 'iso-1',
        macAddress: '10:00:00:00:00:01',
        legacy: { id: 'old-1' },
      });
      await context.run(A, () => trials.insert(device));

      const inA = await context.run(A, () => trials.findByMac(mac(device.macAddress)));
      const inB = await context.run(B, () => trials.findByMac(mac(device.macAddress)));
      const byOldId = await context.run(A, () => trials.findByLegacyId('old-1'));

      expect(inA).toEqual(device);
      expect(inB).toBeNull();
      expect(byOldId?.id).toBe('iso-1');
    });

    it('cannot be used outside a brand', async () => {
      await expect(trials.findById('iso-1')).rejects.toThrow('No tenant in context');
    });

    it('finds playlists on a host as text, never as a pattern (PL-8)', async () => {
      await context.run(A, async () => {
        const playlists = new MongoPlaylistRepository(new TenantDb(context, registry));
        const on = (id: string, url: string) => ({ ...m3u(id, 'host-dev'), name: id, url });
        await playlists.insert(on('h1', 'http://line.example.com:8080/a.m3u'));
        await playlists.insert(on('h2', 'https://user:pass@LINE.example.com/b.m3u'));
        await playlists.insert(on('h3', 'http://lineXexample.com/c.m3u'));
        await playlists.insert(on('h4', 'http://sub.line.example.com/d.m3u'));
        await playlists.insert(on('h5', 'http://other.example.com/line.example.com'));

        const found = await playlists.listOnHost('line.example.com', ['host-dev']);
        const none = await playlists.listOnHost('line.example.com', ['someone-else']);

        expect(found.map((p) => p.id).sort()).toEqual(['h1', 'h2']);
        expect(none).toEqual([]);
      });
    });

    it('reads and writes licenses, playlists and captchas for the current brand', async () => {
      const tenantDb = new TenantDb(context, registry);
      await context.run(B, async () => {
        const licenses = new MongoLicenseRepository(tenantDb);
        const captchas = new MongoCaptchaRepository(tenantDb);
        const at = new Date('2026-10-25T10:00:00Z');
        await licenses.insert({
          id: 'lic-1',
          deviceId: 'device-9',
          type: 'lifetime',
          expiresAt: null,
          revoked: false,
          revokedAt: null,
          activatedBy: { source: 'admin', actorId: 'staff-1' },
          creditCost: 2,
          multiActivate: false,
          sourceId: 'tx-1',
          createdAt: at,
        });
        await captchas.insert({
          id: 'cap-1',
          token: 'tok-1',
          kind: 'v4',
          macAddress: '10:00:00:00:00:09',
          appDeviceId: null,
          platform: 'lg',
          answerHash: 'hash',
          verifiedAt: at,
          expiresAt: null,
          createdAt: at,
        });

        expect((await licenses.listByDevice('device-9')).map((l) => l.id)).toEqual(['lic-1']);
        expect((await licenses.findBySource('device-9', 'tx-1'))?.id).toBe('lic-1');
        expect((await captchas.findSolved(mac('10:00:00:00:00:09'), 'v4'))?.token).toBe('tok-1');

        // An open captcha: found while open, solved only once, then kept with no expiry.
        await captchas.insert({
          id: 'cap-2',
          token: 'tok-2',
          kind: 'v4',
          macAddress: '10:00:00:00:00:0a',
          appDeviceId: null,
          platform: 'lg',
          answerHash: 'hash',
          verifiedAt: null,
          expiresAt: new Date(at.getTime() + 5 * 60_000),
          createdAt: at,
        });
        const tv = mac('10:00:00:00:00:0a');
        expect((await captchas.findOpen(tv, 'v4', at))?.id).toBe('cap-2');
        expect(await captchas.findOpen(tv, 'v4', new Date(at.getTime() + 6 * 60_000))).toBeNull();
        expect(await captchas.markSolved('cap-2', at)).toBe(true);
        expect(await captchas.markSolved('cap-2', at)).toBe(false);
        expect(await captchas.findByToken('tok-2')).toMatchObject({
          verifiedAt: at,
          expiresAt: null,
        });
        expect(await captchas.delete('cap-2')).toBe(true);
        expect(await captchas.delete('cap-2')).toBe(false);
      });
    });

    it('stores provider moves in the central database, one row per pair of hosts', async () => {
      const moves = new MongoDomainMigrationRepository(central);
      const at = new Date('2026-10-25T10:00:00Z');
      const move = {
        id: 'mv-1',
        kind: 'migration' as const,
        fromHost: 'old.example:8080',
        toHost: 'new.example:8080',
        fromScheme: 'http' as const,
        toScheme: 'http' as const,
        confirmations: [],
        source: 'user' as const,
        status: 'pending' as const,
        decidedBy: null,
        decidedAt: null,
        firstSeenAt: at,
        lastConfirmedAt: at,
        legacy: null,
        createdAt: at,
        updatedAt: at,
      };
      await moves.insert(move);

      expect((await moves.findByHosts('old.example:8080', 'new.example:8080'))?.id).toBe('mv-1');
      await expect(moves.insert({ ...move, id: 'mv-2' })).rejects.toMatchObject({ code: 11000 });
    });
  });

  describe('one MAC, one device (UNQ)', () => {
    it('creates exactly one device when ten sign-ups for one MAC arrive together', async () => {
      const results = await context.run(A, () =>
        Promise.all(
          Array.from({ length: 10 }, (_, i) =>
            identity.claimTrial(trialDevice({ id: `race-${i}`, macAddress: '20:00:00:00:00:01' })),
          ),
        ),
      );

      expect(results.filter((r) => r.created)).toHaveLength(1);
      const count = await context.run(
        A,
        async () =>
          await (
            await registry.getDb({ dbName: A.dbName })
          )
            .collection('trialDevices')
            .countDocuments({
              macAddress: '20:00:00:00:00:01',
            }),
      );
      expect(count).toBe(1);
    });

    it('moves a device to devices keeping its id, and the MAC is in only one collection after', async () => {
      await context.run(A, async () => {
        const { found } = await identity.claimTrial(
          trialDevice({ id: 'pay-1', macAddress: '20:00:00:00:00:02' }),
        );
        const moved = await identity.moveToPaid(found.device.id, {
          currentLicenseId: 'lic-x',
          activatedAt: new Date('2026-10-26T09:00:00Z'),
          resellerId: null,
          customerId: null,
        });

        expect(moved.ok && moved.value.id).toBe('pay-1');
        expect(await trials.findByMac(mac('20:00:00:00:00:02'))).toBeNull();
        expect((await identity.findByMac(mac('20:00:00:00:00:02')))?.paid).toBe(true);
      });
    });

    it('still finds existing devices with Redis down, but refuses to create new ones', async () => {
      const down = new Redis('redis://127.0.0.1:1', { lazyConnect: true, maxRetriesPerRequest: 0 });
      const offline = new DeviceIdentity(
        trials,
        paid,
        new RedisDeviceLock(new RedisLock(down), context),
      );

      await context.run(A, async () => {
        expect((await offline.findByMac(mac('20:00:00:00:00:01')))?.device.macAddress).toBe(
          '20:00:00:00:00:01',
        );
        await expect(
          offline.claimTrial(trialDevice({ id: 'new-1', macAddress: '20:00:00:00:00:03' })),
        ).rejects.toBeInstanceOf(LockUnavailableError);
      });
      down.disconnect();
    });
  });
});
