import { ClsServiceManager } from 'nestjs-cls';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ActivateDeviceUseCase } from '../../src/modules/devices/application/use-cases/activate-device.use-case.js';
import { RegisterOrGetDeviceUseCase } from '../../src/modules/devices/application/use-cases/register-or-get-device.use-case.js';
import { SetTrialDaysUseCase } from '../../src/modules/devices/application/use-cases/set-trial-days.use-case.js';
import { AppType } from '../../src/modules/devices/domain/app-type.js';
import { Device } from '../../src/modules/devices/domain/device.entity.js';
import { devicesMigrations } from '../../src/modules/devices/infrastructure/devices.migrations.js';
import {
  DEVICES_COLLECTION,
  MongoDeviceRepository,
  PENDING_DEVICES_COLLECTION,
} from '../../src/modules/devices/infrastructure/mongo-device.repository.js';
import { MongoDeviceSettings } from '../../src/modules/devices/infrastructure/mongo-device-settings.js';
import { TENANT_CONFIG_COLLECTION } from '../../src/modules/devices/infrastructure/mongo-device-settings.js';
import { CryptoRandomMacGenerator } from '../../src/modules/devices/infrastructure/random-mac.generator.js';
import { RandomDeviceKeyGenerator } from '../../src/modules/devices/infrastructure/random-device-key.generator.js';
import type { AppConfig } from '../../src/shared/config/app-config.js';
import { runMigrations } from '../../src/shared/database/migrations/migration-runner.js';
import { MongoClientPool } from '../../src/shared/database/mongo-client.pool.js';
import { TenantDbRegistry } from '../../src/shared/database/tenant-db.registry.js';
import { FixedClock } from '../../src/shared/kernel/clock.js';
import { MacAddress } from '../../src/shared/kernel/mac-address.js';
import type { CurrentTenant } from '../../src/shared/tenancy/current-tenant.js';
import { TenantContext } from '../../src/shared/tenancy/tenant-context.js';
import { TenantDb } from '../../src/shared/tenancy/tenant-db.js';
import { startInfrastructure, type TestInfrastructure } from '../support/infrastructure.js';

const brand = (slug: string): CurrentTenant => ({
  id: `id-${slug}`,
  slug,
  name: slug,
  dbName: slug,
});
const MAC = 'AA:BB:CC:00:00:01';

describe('Devices on MongoDB', () => {
  let infra: TestInfrastructure;
  const pool = new MongoClientPool();
  let context: TenantContext;
  let tenantDb: TenantDb;
  let repo: MongoDeviceRepository;
  let register: RegisterOrGetDeviceUseCase;
  let activate: ActivateDeviceUseCase;
  let settings: MongoDeviceSettings;

  const inA = <T>(fn: () => Promise<T>) => context.run(brand('a'), fn);
  const count = (collection: string) =>
    inA(async () => (await tenantDb.collection(collection)).countDocuments());

  beforeAll(async () => {
    infra = await startInfrastructure();
    const config = { env: { MONGO_URI: infra.mongoUri } } as AppConfig;
    const registry = new TenantDbRegistry(pool, config);
    context = new TenantContext(ClsServiceManager.getClsService());
    tenantDb = new TenantDb(context, registry);
    for (const slug of ['a', 'b']) {
      await runMigrations(await registry.getDb({ dbName: slug }), devicesMigrations);
    }
    const clock = new FixedClock(new Date('2026-10-19T10:00:00Z'));
    repo = new MongoDeviceRepository(tenantDb);
    settings = new MongoDeviceSettings(tenantDb);
    register = new RegisterOrGetDeviceUseCase(
      repo,
      new RandomDeviceKeyGenerator(),
      clock,
      settings,
      new CryptoRandomMacGenerator(),
    );
    activate = new ActivateDeviceUseCase(repo, clock);
  });

  beforeEach(async () => {
    for (const slug of ['a', 'b']) {
      await context.run(brand(slug), async () => {
        await (await tenantDb.collection(PENDING_DEVICES_COLLECTION)).deleteMany({});
        await (await tenantDb.collection(DEVICES_COLLECTION)).deleteMany({});
        await (await tenantDb.collection(TENANT_CONFIG_COLLECTION)).deleteMany({});
      });
    }
  });

  afterAll(async () => {
    await pool.closeAll();
    await infra?.stop();
  });

  it("uses the brand's trial length from tenantConfig, 7 days by default, per brand", async () => {
    expect((await inA(() => settings.trialDays())).days).toBe(7);
    const set = await inA(() => new SetTrialDaysUseCase(settings).execute({ days: 21 }));
    expect(set.ok).toBe(true);

    const a = await inA(() => register.execute({ macAddress: MAC, appType: 'samsung' }));
    const b = await context.run(brand('b'), () =>
      register.execute({ macAddress: MAC, appType: 'samsung' }),
    );

    if (!a.ok || !b.ok) throw new Error('expected ok');
    expect(a.value.device.trialExpiresAt).toEqual(new Date('2026-11-09T10:00:00Z'));
    expect(b.value.device.trialExpiresAt).toEqual(new Date('2026-10-26T10:00:00Z'));
  });

  it('stores one device per app_device_id for two concurrent no-MAC requests, with a random MAC', async () => {
    const [first, second] = await inA(() =>
      Promise.all([
        register.execute({ appDeviceId: 'vidaa-install-1', appType: 'vidaa' }),
        register.execute({
          macAddress: '52:54:00:12:34:57',
          appDeviceId: 'vidaa-install-1',
          appType: 'vidaa',
        }),
      ]),
    );

    if (!first.ok || !second.ok) throw new Error('expected ok');
    expect(second.value.device.id).toBe(first.value.device.id);
    expect(first.value.device.macAddress.value).toMatch(/^[0-9a-f][26ae]:/);
    expect(await count(PENDING_DEVICES_COLLECTION)).toBe(1);
  });

  it('creates the indexes', async () => {
    for (const name of [PENDING_DEVICES_COLLECTION, DEVICES_COLLECTION]) {
      const indexes = await inA(async () => (await tenantDb.collection(name)).indexes());
      const byName = new Map(indexes.map((i) => [i.name, i]));

      expect(byName.get('mac_unique')?.unique).toBe(true);
      expect(byName.get('device_key_unique')?.unique).toBe(true);
      expect(byName.get('app_device_id_unique')?.unique).toBe(true);
      expect(indexes.some((i) => i.expireAfterSeconds !== undefined)).toBe(false);
    }
  });

  it('stores one pending device for two concurrent first requests', async () => {
    const [first, second] = await inA(() =>
      Promise.all([
        register.execute({ macAddress: MAC, appType: 'samsung' }),
        register.execute({ macAddress: MAC, appType: 'samsung' }),
      ]),
    );

    if (!first.ok || !second.ok) throw new Error('expected ok');
    expect(second.value.device.id).toBe(first.value.device.id);
    expect(await count(PENDING_DEVICES_COLLECTION)).toBe(1);
    expect(await count(DEVICES_COLLECTION)).toBe(0);
  });

  it('keeps brands apart', async () => {
    const a = await inA(() => register.execute({ macAddress: MAC, appType: 'samsung' }));
    const b = await context.run(brand('b'), () =>
      register.execute({ macAddress: MAC, appType: 'samsung' }),
    );

    if (!a.ok || !b.ok) throw new Error('expected ok');
    expect(a.value.device.id).not.toBe(b.value.device.id);
    expect(await count(PENDING_DEVICES_COLLECTION)).toBe(1);
    const inB = await context.run(brand('b'), async () =>
      (await tenantDb.collection(PENDING_DEVICES_COLLECTION)).countDocuments(),
    );
    expect(inB).toBe(1);
  });

  it('moves a device to devices on activation', async () => {
    const created = await inA(() => register.execute({ macAddress: MAC, appType: 'samsung' }));
    const activated = await inA(() => activate.execute({ macAddress: MAC }));

    if (!created.ok || !activated.ok) throw new Error('expected ok');
    expect(activated.value.outcome).toBe('activated');
    expect(await count(PENDING_DEVICES_COLLECTION)).toBe(0);
    const stored = await inA(async () =>
      (await tenantDb.collection(DEVICES_COLLECTION)).findOne({ macAddress: 'aa:bb:cc:00:00:01' }),
    );
    expect(stored?._id).toBe(created.value.device.id);
    expect(stored?.deviceKey).toBe(created.value.device.deviceKey);
    expect(stored?.activatedAt).toBeInstanceOf(Date);
  });

  it('activates once under concurrent activations', async () => {
    await inA(() => register.execute({ macAddress: MAC, appType: 'samsung' }));

    const results = await inA(() =>
      Promise.all([activate.execute({ macAddress: MAC }), activate.execute({ macAddress: MAC })]),
    );

    const outcomes = results.map((r) => (r.ok ? r.value.outcome : r.error.code)).sort();
    expect(outcomes).toEqual(['activated', 'already_paid']);
    expect(await count(DEVICES_COLLECTION)).toBe(1);
    expect(await count(PENDING_DEVICES_COLLECTION)).toBe(0);
  });

  it('backs out when a paid device takes the same key during the insert', async () => {
    // Forces the race: right after our pending insert, another device holding the same key
    // finishes moving into devices.
    const racingDb = {
      db: () => tenantDb.db(),
      collection: async (name: string) => {
        const real = await tenantDb.collection(name);
        if (name !== PENDING_DEVICES_COLLECTION) return real;
        return new Proxy(real, {
          get(target, prop, receiver) {
            if (prop === 'insertOne') {
              return async (doc: { deviceKey: string }, options?: object) => {
                const inserted = await target.insertOne(doc, options);
                await (
                  await tenantDb.collection(DEVICES_COLLECTION)
                ).insertOne({
                  macAddress: 'aa:bb:cc:00:00:77',
                  deviceKey: doc.deviceKey,
                });
                return inserted;
              };
            }
            const value: unknown = Reflect.get(target, prop, receiver);
            return typeof value === 'function'
              ? (value as (...args: unknown[]) => unknown).bind(target)
              : value;
          },
        });
      },
    } as unknown as TenantDb;
    const mac = MacAddress.parse('AA:BB:CC:00:00:03');
    const app = AppType.parse('samsung');
    if (!mac.ok || !app.ok) throw new Error('bad fixture');
    const device = Device.registerTrial({
      id: 'race1',
      macAddress: mac.value,
      appType: app.value,
      deviceKey: '654321',
      now: new Date('2026-10-19T10:00:00Z'),
    });

    const result = await inA(() => new MongoDeviceRepository(racingDb).insertPending(device));

    expect(result).toBe('key_taken');
    expect(await count(PENDING_DEVICES_COLLECTION)).toBe(0);
  });

  it("never gives a new trial device a paid device's key", async () => {
    await inA(async () =>
      (await tenantDb.collection(DEVICES_COLLECTION)).insertOne({
        macAddress: 'aa:bb:cc:00:00:99',
        deviceKey: '123456',
      }),
    );
    const mac = MacAddress.parse('AA:BB:CC:00:00:02');
    const app = AppType.parse('samsung');
    if (!mac.ok || !app.ok) throw new Error('bad fixture');
    const device = Device.registerTrial({
      id: 'x1',
      macAddress: mac.value,
      appType: app.value,
      deviceKey: '123456',
      now: new Date('2026-10-19T10:00:00Z'),
    });

    expect(await inA(() => repo.insertPending(device))).toBe('key_taken');
  });
});
