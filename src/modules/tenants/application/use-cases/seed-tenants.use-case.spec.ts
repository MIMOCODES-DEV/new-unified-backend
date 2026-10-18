import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTenantRepository } from '../../../../../test/support/in-memory-tenant.repository.js';
import { FixedClock } from '../../../../shared/kernel/clock.js';
import { SeedTenantsUseCase } from './seed-tenants.use-case.js';

describe('SeedTenantsUseCase', () => {
  let repository: InMemoryTenantRepository;
  let seed: SeedTenantsUseCase;

  beforeEach(() => {
    repository = new InMemoryTenantRepository();
    seed = new SeedTenantsUseCase(repository, new FixedClock(new Date('2026-10-15T00:00:00Z')));
  });

  it('creates missing brands', async () => {
    const report = await seed.execute([
      { slug: 'cr7', name: 'CR7 Player', hosts: ['cr7player.com', 'crtvplayer.com'] },
      { slug: 'family', name: 'Family 4K Player', hosts: ['family4kplayer.com'] },
    ]);

    expect(report.created).toEqual(['cr7', 'family']);
    expect(repository.items.size).toBe(2);
  });

  it('is a no-op when run twice', async () => {
    const entries = [{ slug: 'cr7', name: 'CR7 Player', hosts: ['cr7player.com'] }];
    await seed.execute(entries);

    const report = await seed.execute(entries);

    expect(report).toMatchObject({ created: [], updated: [], unchanged: ['cr7'] });
  });

  it('adds new hosts and renames, but never removes a host', async () => {
    await seed.execute([{ slug: 'cr7', name: 'CR7', hosts: ['cr7player.com', 'old-cr7.com'] }]);

    const report = await seed.execute([
      { slug: 'cr7', name: 'CR7 Player', hosts: ['cr7player.com', 'cr7tvplayer.com'] },
    ]);

    const cr7 = await repository.findBySlug('cr7');
    expect(report.updated).toEqual(['cr7']);
    expect(cr7?.name).toBe('CR7 Player');
    expect(cr7?.hosts.map((h) => h.value).sort()).toEqual([
      'cr7player.com',
      'cr7tvplayer.com',
      'old-cr7.com',
    ]);
  });

  it('never moves a host that belongs to another brand', async () => {
    await seed.execute([{ slug: 'iptvibo', name: 'IPTV IBO', hosts: ['ibovpnplayer.com'] }]);

    const report = await seed.execute([
      { slug: 'ibovpnplayer', name: 'IBO VPN', hosts: ['ibovpnplayer.com', 'other.example'] },
    ]);

    expect(report.conflicts).toEqual([
      { slug: 'ibovpnplayer', host: 'ibovpnplayer.com', ownedBy: 'iptvibo' },
    ]);
    expect(report.created).toEqual(['ibovpnplayer']);
    expect((await repository.findBySlug('iptvibo'))?.hosts.map((h) => h.value)).toEqual([
      'ibovpnplayer.com',
    ]);
  });

  it('reports invalid hosts and skips a brand left with no host', async () => {
    const report = await seed.execute([{ slug: 'bad', name: 'Bad', hosts: ['not a host'] }]);

    expect(report.errors.map((e) => e.code)).toEqual(['tenants.invalid_host', 'tenants.invalid']);
    expect(repository.items.size).toBe(0);
  });
});
