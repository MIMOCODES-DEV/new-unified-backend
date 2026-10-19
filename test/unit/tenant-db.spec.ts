import { setTimeout as sleep } from 'node:timers/promises';
import type { Db } from 'mongodb';
import { ClsServiceManager } from 'nestjs-cls';
import { describe, expect, it } from 'vitest';
import type { TenantDbRegistry } from '../../src/shared/database/tenant-db.registry.js';
import type { CurrentTenant } from '../../src/shared/tenancy/current-tenant.js';
import { TenantContext } from '../../src/shared/tenancy/tenant-context.js';
import { TenantDb } from '../../src/shared/tenancy/tenant-db.js';

const brand = (slug: string): CurrentTenant => ({
  id: `id-${slug}`,
  slug,
  name: slug,
  dbName: slug,
});

// Fake registry: returns a stand-in Db that only knows its name.
const registry = {
  getDb: ({ dbName }: { dbName: string }) => Promise.resolve({ databaseName: dbName } as Db),
} as unknown as TenantDbRegistry;

const context = new TenantContext(ClsServiceManager.getClsService());
const tenantDb = new TenantDb(context, registry);

describe('TenantDb', () => {
  it('refuses to guess a brand outside a request or run()', async () => {
    await expect(tenantDb.db()).rejects.toThrow('No tenant in context');
  });

  it('gives the database of the brand being served', async () => {
    const db = await context.run(brand('cr7'), () => tenantDb.db());

    expect(db.databaseName).toBe('cr7');
  });

  it('keeps concurrent requests for different brands apart', async () => {
    const serve = (slug: string, delay: number) =>
      context.run(brand(slug), async () => {
        await sleep(delay); // the other request runs meanwhile
        return (await tenantDb.db()).databaseName;
      });

    expect(await Promise.all([serve('bob', 20), serve('messi', 5), serve('ibo', 10)])).toEqual([
      'bob',
      'messi',
      'ibo',
    ]);
  });

  it('restores the outer brand after a nested run()', async () => {
    const seen = await context.run(brand('bob'), async () => {
      const inner = await context.run(brand('cr7'), () => tenantDb.db());
      const outer = await tenantDb.db();
      return [inner.databaseName, outer.databaseName];
    });

    expect(seen).toEqual(['cr7', 'bob']);
  });
});
