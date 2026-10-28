import { Redis } from 'ioredis';
import type { Db } from 'mongodb';
import { ClsServiceManager } from 'nestjs-cls';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { centralMigrations, tenantMigrations } from '../../src/migrations.js';
import { MongoCustomerRepository } from '../../src/modules/customers/infrastructure/mongo-customer.repository.js';
import { MongoCustomerTokenRepository } from '../../src/modules/customers/infrastructure/mongo-customer-token.repository.js';
import { SyncPermissionsUseCase } from '../../src/modules/staff/application/use-cases/permissions.use-cases.js';
import {
  MongoPermissionRepository,
  MongoRoleRepository,
  MongoStaffUserRepository,
} from '../../src/modules/staff/infrastructure/mongo-staff.repositories.js';
import type { AppConfig } from '../../src/shared/config/app-config.js';
import { runMigrations } from '../../src/shared/database/migrations/migration-runner.js';
import { MongoClientPool } from '../../src/shared/database/mongo-client.pool.js';
import { TenantDbRegistry } from '../../src/shared/database/tenant-db.registry.js';
import { SystemClock } from '../../src/shared/kernel/clock.js';
import { EmailAddress } from '../../src/shared/kernel/email-address.js';
import { DEFAULT_TENANT_SETTINGS } from '../../src/shared/kernel/tenant-settings.js';
import { RedisSessionStore } from '../../src/shared/redis/redis-session.store.js';
import type { CurrentTenant } from '../../src/shared/tenancy/current-tenant.js';
import { TenantContext } from '../../src/shared/tenancy/tenant-context.js';
import { TenantDb } from '../../src/shared/tenancy/tenant-db.js';
import { customer, role, staffUser } from '../support/account-fakes.js';
import { startInfrastructure, type TestInfrastructure } from '../support/infrastructure.js';

const brand = (slug: string): CurrentTenant => ({
  id: `id-${slug}`,
  slug,
  name: slug,
  dbName: `p5_${slug}`,
  settings: DEFAULT_TENANT_SETTINGS,
});
const A = brand('a');
const B = brand('b');

const email = (value: string) => {
  const parsed = EmailAddress.parse(value);
  if (!parsed.ok) throw parsed.error;
  return parsed.value;
};

describe('Accounts on MongoDB and Redis', () => {
  let infra: TestInfrastructure;
  const pool = new MongoClientPool();
  let registry: TenantDbRegistry;
  let context: TenantContext;
  let redis: Redis;
  let central: Db;
  let customers: MongoCustomerRepository;
  let tokens: MongoCustomerTokenRepository;

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
    central = await registry.getDb({ dbName: 'p5_central' });
    await runMigrations(central, centralMigrations);
    customers = new MongoCustomerRepository(tenantDb);
    tokens = new MongoCustomerTokenRepository(tenantDb);
  });

  afterAll(async () => {
    await redis?.quit();
    await pool.closeAll();
    await infra?.stop();
  });

  describe('migrations (ACC-1)', () => {
    it('creates customers and customerTokens in each brand, with their indexes', async () => {
      const db = await registry.getDb({ dbName: A.dbName });
      const names = async (c: string) => (await db.collection(c).indexes()).map((i) => i.name);
      expect(await names('customers')).toEqual(
        expect.arrayContaining(['email_unique', 'legacy_id']),
      );
      expect(await names('customerTokens')).toEqual(
        expect.arrayContaining(['customer_kind', 'expires_ttl']),
      );
      expect(await names('devices')).toEqual(expect.arrayContaining(['customer']));
    });

    it('creates the three central collections, with super_admin and the day-one roles', async () => {
      const names = async (c: string) => (await central.collection(c).indexes()).map((i) => i.name);
      expect(await names('staffUsers')).toEqual(expect.arrayContaining(['email_unique', 'role']));
      expect(await names('roles')).toEqual(expect.arrayContaining(['name_unique']));
      expect(await names('permissions')).toEqual(expect.arrayContaining(['group']));
      const roles = await new MongoRoleRepository(central).list();
      expect(roles.map((r) => [r.id, r.system])).toEqual(
        expect.arrayContaining([
          ['super_admin', true],
          ['support', false],
          ['billing', false],
          ['content_editor', false],
        ]),
      );
      expect(await runMigrations(central, centralMigrations)).toEqual([]);
    });
  });

  describe('customers per brand', () => {
    it('the same email is two accounts on two brands, and unique within one', async () => {
      await context.run(A, () =>
        customers.insert(customer({ id: 'ca', email: 'same@example.com' })),
      );
      const onB = await context.run(B, () =>
        customers.insert(customer({ id: 'cb', email: 'same@example.com' })),
      );
      expect(onB).toBe('inserted');
      const again = await context.run(A, () =>
        customers.insert(customer({ id: 'ca2', email: 'same@example.com' })),
      );
      expect(again).toBe('email_taken');
      const foundOnB = await context.run(B, () => customers.findByEmail(email('same@example.com')));
      expect(foundOnB?.id).toBe('cb');
    });

    it('a one-time link is taken once, even by two calls at the same time', async () => {
      const now = new Date();
      await context.run(A, () =>
        tokens.insert({
          id: 'f'.repeat(64),
          customerId: 'ca',
          kind: 'verifyEmail',
          email: 'same@example.com',
          expiresAt: new Date(now.getTime() + 60_000),
          createdAt: now,
        }),
      );
      const taken = await context.run(A, () =>
        Promise.all([1, 2, 3].map(() => tokens.take('f'.repeat(64), 'verifyEmail', now))),
      );
      expect(taken.filter(Boolean)).toHaveLength(1);
    });
  });

  describe('staff', () => {
    it('one staff account per email, case-insensitive role names', async () => {
      const staff = new MongoStaffUserRepository(central);
      expect(await staff.insert(staffUser({ id: 's1' }))).toBe('inserted');
      expect(await staff.insert(staffUser({ id: 's2' }))).toBe('email_taken');
      const roles = new MongoRoleRepository(central);
      expect(await roles.insert(role({ id: 'r1', name: 'SUPPORT' }))).toBe('name_taken');
      expect(await roles.delete('super_admin')).toBe(false);
      expect(await roles.update(role({ id: 'super_admin', name: 'Root' }))).toBe('missing');
    });

    it('the permission sync is safe on several servers at once (PRM-1)', async () => {
      const permissions = new MongoPermissionRepository(central);
      const roles = new MongoRoleRepository(central);
      const sync = new SyncPermissionsUseCase(permissions, roles, new SystemClock());
      await permissions.edit('devices.view', { label: { en: 'See TVs', ar: null } });
      const declared = [
        { key: 'devices.view', group: 'devices', label: 'View devices' },
        { key: 'staff.manage', group: 'staff', label: 'Manage staff' },
      ];
      await Promise.all([sync.execute(declared), sync.execute(declared), sync.execute(declared)]);

      const all = await permissions.list();
      expect(all.map((p) => [p.key, p.active])).toEqual([
        ['devices.activate', false],
        ['devices.view', true],
        ['staff.manage', true],
      ]);
      expect(all.find((p) => p.key === 'devices.view')!.label.en).toBe('See TVs');
      const billing = await roles.findById('billing');
      expect(billing!.permissions).toEqual(['devices.view']);
    });
  });

  describe('sessions in Redis', () => {
    it('ends every session of a staff member at once, on any server', async () => {
      const serverOne = new RedisSessionStore(redis);
      const serverTwo = new RedisSessionStore(new Redis(infra.redisUrl));
      const subject = { kind: 'staff' as const, id: 'p5-staff', tenantId: null };
      const first = await serverOne.create(subject, 60_000);
      const second = await serverTwo.create(subject, 60_000);
      expect(await serverTwo.find(first)).toEqual(subject);
      expect(await serverOne.revokeAll(subject)).toBe(2);
      expect(await serverOne.find(first)).toBeNull();
      expect(await serverTwo.find(second)).toBeNull();
      await (serverTwo as unknown as { redis: Redis }).redis.quit();
    });

    it('one logout ends only that session; tokens are not stored in clear', async () => {
      const store = new RedisSessionStore(redis);
      const subject = { kind: 'customer' as const, id: 'p5-cust', tenantId: A.id };
      const a = await store.create(subject, 60_000);
      const b = await store.create(subject, 60_000);
      await store.revoke(a);
      expect(await store.find(a)).toBeNull();
      expect(await store.find(b)).toEqual(subject);
      expect(await redis.exists(`session:${b}`)).toBe(0);
    });
  });
});
