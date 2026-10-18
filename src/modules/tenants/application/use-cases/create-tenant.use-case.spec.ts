import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTenantRepository } from '../../../../../test/support/in-memory-tenant.repository.js';
import { FixedClock } from '../../../../shared/kernel/clock.js';
import { CreateTenantUseCase } from './create-tenant.use-case.js';

describe('CreateTenantUseCase', () => {
  let repository: InMemoryTenantRepository;
  let useCase: CreateTenantUseCase;

  beforeEach(() => {
    repository = new InMemoryTenantRepository();
    useCase = new CreateTenantUseCase(repository, new FixedClock(new Date('2026-10-15T00:00:00Z')));
  });

  it('creates an active tenant with normalized hosts and its own database name', async () => {
    const result = await useCase.execute({
      slug: 'King4K',
      name: 'King 4K',
      hosts: ['King4kPlayer.com', 'www.king4kplayer.com:443'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.slug).toBe('king4k');
    expect(result.value.hosts.map((h) => h.value)).toEqual([
      'king4kplayer.com',
      'www.king4kplayer.com',
    ]);
    expect(result.value.dbName).toBe('tenant_king4k');
    expect(result.value.isActive).toBe(true);
    expect(repository.items.size).toBe(1);
  });

  it('refuses a slug that already exists', async () => {
    await useCase.execute({ slug: 'cr7', name: 'CR7', hosts: ['crtvplayer.com'] });

    const result = await useCase.execute({ slug: 'cr7', name: 'Other', hosts: ['other.com'] });

    expect(!result.ok && result.error.code).toBe('tenants.conflict');
  });

  it('refuses a host that another tenant already answers on', async () => {
    await useCase.execute({ slug: 'cr7', name: 'CR7', hosts: ['crtvplayer.com'] });

    const result = await useCase.execute({
      slug: 'smart',
      name: 'Smart',
      hosts: ['crtvplayer.com'],
    });

    expect(!result.ok && result.error.code).toBe('tenants.conflict');
    expect(repository.items.size).toBe(1);
  });

  it('refuses a tenant without hosts or with an invalid host', async () => {
    expect((await useCase.execute({ slug: 'a', name: 'A', hosts: [] })).ok).toBe(false);
    expect((await useCase.execute({ slug: 'b', name: 'B', hosts: ['not a host'] })).ok).toBe(false);
  });
});
