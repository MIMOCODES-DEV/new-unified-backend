import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cli, type E2eEnv, startE2eEnv } from './support/e2e-env.js';

/**
 * Device registration end to end, through the real CLI processes and a real MongoDB:
 * a new device waits in pendingDevices and moves into devices only when it pays.
 */
describe('Device registration (e2e)', () => {
  let e2e: E2eEnv;
  let client: MongoClient;

  const brandDb = () => client.db('shop');

  beforeAll(async () => {
    e2e = await startE2eEnv();
    expect((await cli(e2e.env, 'migrate:central')).exitCode).toBe(0);
    expect((await cli(e2e.env, 'tenant:create', 'shop', 'Shop Player', 'shop.test')).exitCode).toBe(
      0,
    );
    const migrated = await cli(e2e.env, 'migrate:tenants');
    expect(migrated.messages).toContain(
      'shop (shop): 0001-devices-indexes, 0002-captchas-ttl, 0003-app-device-id',
    );
    client = await MongoClient.connect(e2e.infra.mongoUri);
  });

  afterAll(async () => {
    await client?.close();
    await e2e?.infra.stop();
  });

  it('registers, returns the same device, then moves it to devices when it pays', async () => {
    const created = await cli(e2e.env, 'device:register', 'shop', 'AA-BB-CC-00-00-01', 'samsung');
    expect(created.exitCode).toBe(0);
    const [line] = created.messages;
    expect(line).toMatch(/^created shop aa:bb:cc:00:00:01 · key \d{6} · pending · trial until /);
    const key = /key (\d{6})/.exec(line ?? '')?.[1];

    const again = await cli(e2e.env, 'device:register', 'shop', 'aabb.cc00.0001', 'samsung');
    expect(again.messages[0]).toMatch(
      new RegExp(`^existing shop aa:bb:cc:00:00:01 · key ${key} · pending`),
    );
    expect(await brandDb().collection('pendingDevices').countDocuments()).toBe(1);
    expect(await brandDb().collection('devices').countDocuments()).toBe(0);

    const activated = await cli(e2e.env, 'device:activate', 'shop', 'AA:BB:CC:00:00:01');
    expect(activated.messages[0]).toMatch(
      new RegExp(`^activated shop aa:bb:cc:00:00:01 · key ${key} · paid since `),
    );
    expect(await brandDb().collection('pendingDevices').countDocuments()).toBe(0);
    expect(await brandDb().collection('devices').countDocuments()).toBe(1);

    const afterPay = await cli(e2e.env, 'device:register', 'shop', 'AA:BB:CC:00:00:01', 'samsung');
    expect(afterPay.messages[0]).toMatch(
      new RegExp(`^existing shop aa:bb:cc:00:00:01 · key ${key} · paid`),
    );

    const twice = await cli(e2e.env, 'device:activate', 'shop', 'AA:BB:CC:00:00:01');
    expect(twice.messages[0]).toMatch(/^already_paid /);
  });

  it('uses the trial length set for the brand with device:trial-days', async () => {
    expect((await cli(e2e.env, 'device:trial-days', 'shop')).messages).toEqual([
      'shop trial: 7 days',
    ]);
    const set = await cli(e2e.env, 'device:trial-days', 'shop', '30');
    expect(set.messages).toEqual(['shop trial set to 30 days (new devices only)']);

    const before = Date.now();
    const created = await cli(e2e.env, 'device:register', 'shop', 'AA:BB:CC:00:00:30', 'roku');
    const until = /trial until (\S+)/.exec(created.messages[0] ?? '')?.[1] ?? '';
    const days = (new Date(until).getTime() - before) / 86_400_000;

    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
    expect((await cli(e2e.env, 'device:trial-days', 'shop', '0')).exitCode).toBe(1);
  });

  it('registers a device without a MAC by its app_device_id, with its own random MAC', async () => {
    const first = await cli(e2e.env, 'device:register', 'shop', '-', 'vidaa', 'tv-install-7');
    const again = await cli(
      e2e.env,
      'device:register',
      'shop',
      '52:54:00:12:34:57',
      'vidaa',
      'tv-install-7',
    );
    const missing = await cli(e2e.env, 'device:register', 'shop', '-', 'vidaa');

    expect(first.messages[0]).toMatch(
      /^created shop [0-9a-f]{2}(:[0-9a-f]{2}){5} · key \d{6} · pending/,
    );
    const mac = first.messages[0]?.split(' ')[2];
    expect(again.messages[0]).toMatch(new RegExp(`^existing shop ${mac} `));
    expect(missing).toMatchObject({
      exitCode: 1,
      messages: [expect.stringMatching(/^devices\.identity_required: /)],
    });
  });

  it('fails with a clear error and exit code 1 for bad input', async () => {
    const unknownDevice = await cli(e2e.env, 'device:activate', 'shop', 'AA:BB:CC:00:00:99');
    const badMac = await cli(e2e.env, 'device:register', 'shop', 'nope', 'samsung');
    const unknownBrand = await cli(
      e2e.env,
      'device:register',
      'nobrand',
      'AA:BB:CC:00:00:01',
      'samsung',
    );

    expect(unknownDevice).toMatchObject({
      exitCode: 1,
      messages: ['devices.not_found: No device with this MAC'],
    });
    expect(badMac).toMatchObject({
      exitCode: 1,
      messages: ['kernel.invalid_mac_address: Invalid MAC address'],
    });
    expect(unknownBrand).toMatchObject({ exitCode: 1, messages: ['Unknown tenant: nobrand'] });
  });
});
