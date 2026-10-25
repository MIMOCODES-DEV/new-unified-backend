import { ClsServiceManager } from 'nestjs-cls';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppConfig } from '../../src/shared/config/app-config.js';
import { MongoClientPool } from '../../src/shared/database/mongo-client.pool.js';
import { TenantDbRegistry } from '../../src/shared/database/tenant-db.registry.js';
import { DEFAULT_TENANT_SETTINGS } from '../../src/shared/kernel/tenant-settings.js';
import type { CurrentTenant } from '../../src/shared/tenancy/current-tenant.js';
import { TenantContext } from '../../src/shared/tenancy/tenant-context.js';
import { TenantDb } from '../../src/shared/tenancy/tenant-db.js';
import { startInfrastructure, type TestInfrastructure } from '../support/infrastructure.js';

const brand = (slug: string): CurrentTenant => ({
  id: `id-${slug}`,
  slug,
  name: slug,
  dbName: slug,
  settings: DEFAULT_TENANT_SETTINGS,
});

describe('TenantDb on MongoDB', () => {
  let infra: TestInfrastructure;
  const pool = new MongoClientPool();
  let context: TenantContext;
  let tenantDb: TenantDb;

  beforeAll(async () => {
    infra = await startInfrastructure();
    const config = { env: { MONGO_URI: infra.mongoUri } } as AppConfig;
    context = new TenantContext(ClsServiceManager.getClsService());
    tenantDb = new TenantDb(context, new TenantDbRegistry(pool, config));
  });

  afterAll(async () => {
    await pool.closeAll();
    await infra?.stop();
  });

  it('writes to the brand’s own database, invisible to other brands', async () => {
    await context.run(brand('a'), async () => {
      await (await tenantDb.collection('devices')).insertOne({ mac: '00:1a:2b:3c:4d:5e' });
    });

    const inA = await context.run(brand('a'), async () =>
      (await tenantDb.collection('devices')).countDocuments(),
    );
    const inB = await context.run(brand('b'), async () =>
      (await tenantDb.collection('devices')).countDocuments(),
    );

    expect(inA).toBe(1);
    expect(inB).toBe(0);
  });
});
