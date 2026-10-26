import { beforeEach, describe, expect, it } from 'vitest';
import {
  InMemoryTenantChangeBus,
  InMemoryTenantConfigRepository,
} from '../../../../../test/support/tenant-fakes.js';
import { InMemoryTenantRepository } from '../../../../../test/support/in-memory-tenant.repository.js';
import { FixedClock } from '../../../../shared/kernel/clock.js';
import type { Tenant } from '../../domain/tenant.entity.js';
import { TenantConfigCache } from '../tenant-memory-cache.js';
import { CreateTenantUseCase } from './create-tenant.use-case.js';
import { GetTenantConfigUseCase } from './get-tenant-config.use-case.js';
import { UpdateTenantConfigUseCase } from './update-tenant-config.use-case.js';

const clock = new FixedClock(new Date('2026-10-25T00:00:00Z'));

describe('tenant config', () => {
  let tenants: InMemoryTenantRepository;
  let configs: InMemoryTenantConfigRepository;
  let bus: InMemoryTenantChangeBus;
  let ibo: Tenant;
  let bob: Tenant;

  const process = () => {
    const cache = new TenantConfigCache(clock, bus);
    return {
      get: new GetTenantConfigUseCase(configs, cache),
      update: new UpdateTenantConfigUseCase(tenants, configs, cache, bus, clock),
    };
  };

  beforeEach(async () => {
    tenants = new InMemoryTenantRepository();
    configs = new InMemoryTenantConfigRepository();
    bus = new InMemoryTenantChangeBus();
    const create = new CreateTenantUseCase(tenants, clock);
    const created = [
      await create.execute({ slug: 'ibo', name: 'IBO', hosts: ['iboplayer.com'] }),
      await create.execute({ slug: 'bob', name: 'BOB', hosts: ['bobplayer.com'] }),
    ];
    [ibo, bob] = created.map((r) => {
      if (!r.ok) throw r.error;
      return r.value;
    }) as [Tenant, Tenant];
  });

  it('gives a brand without a stored config the defaults', async () => {
    const config = await process().get.execute(ibo);

    expect(config.trial.days).toBe(7);
    expect(config.currency.main).toBe('EUR');
    expect(config.payments.visible).toEqual({});
    expect(config.review.builds).toEqual([]);
  });

  it('merges a change into the stored config and keeps brands apart', async () => {
    const { get, update } = process();

    await update.execute({ slug: 'ibo', patch: { trial: { days: 3 } } });
    await update.execute({ slug: 'ibo', patch: { payments: { visible: { paypal: true } } } });
    await update.execute({ slug: 'ibo', patch: { payments: { visible: { stripe: false } } } });

    const config = await get.execute(ibo);
    expect(config.trial.days).toBe(3);
    expect(config.payments.visible).toEqual({ paypal: true, stripe: false });
    expect((await get.execute(bob)).trial.days).toBe(7);
  });

  it.each([
    [{ trial: { days: -1 } }],
    [{ trial: { dayz: 3 } }],
    [{ currency: { main: 'euro' } }],
    [{ contact: { email: 'not-an-email' } }],
    [{ app: { apkUrl: 'ftp://files' } }],
    [{ review: { builds: [{ platform: 'Samsung', version: '1.2.0' }] } }],
    [{ review: { builds: [{ platform: 'samsung' }] } }],
    [{ unknownSection: true }],
  ])('refuses the invalid change %j and stores nothing', async (patch) => {
    const result = await process().update.execute({ slug: 'ibo', patch });

    expect(!result.ok && result.error.code).toBe('tenants.invalid_config');
    expect(configs.items.size).toBe(0);
  });

  it('serves repeated reads from memory', async () => {
    const { get } = process();
    await get.execute(ibo);
    const reads = configs.reads;

    await get.execute(ibo);

    expect(configs.reads).toBe(reads);
  });

  it('a change made in one process is seen by the others at once', async () => {
    const api = process();
    const cli = process();
    expect((await api.get.execute(ibo)).trial.days).toBe(7); // cached in the API

    await cli.update.execute({ slug: 'ibo', patch: { trial: { days: 1 } } });

    expect((await api.get.execute(ibo)).trial.days).toBe(1);
    expect(bus.published).toEqual([{ kind: 'config', tenantId: ibo.id }]);
  });

  it('fails loudly on a stored config edited by hand into an invalid shape', async () => {
    configs.items.set('ibo', { trial: { days: 'seven' } });

    await expect(process().get.execute(ibo)).rejects.toThrow('tenantConfig of ibo is invalid');
  });
});
