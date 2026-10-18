import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTenantRepository } from '../../../../../test/support/in-memory-tenant.repository.js';
import { HostName } from '../../domain/host-name.js';
import { Tenant } from '../../domain/tenant.entity.js';
import { ResolveTenantUseCase } from './resolve-tenant.use-case.js';

const host = (h: string): HostName => {
  const r = HostName.parse(h);
  if (!r.ok) throw r.error;
  return r.value;
};

const tenant = (slug: string, hosts: string[]): Tenant => {
  const r = Tenant.create({ id: slug, slug, name: slug, hosts: hosts.map(host), now: new Date(0) });
  if (!r.ok) throw r.error;
  return r.value;
};

describe('ResolveTenantUseCase', () => {
  let repository: InMemoryTenantRepository;
  let useCase: ResolveTenantUseCase;

  beforeEach(async () => {
    repository = new InMemoryTenantRepository();
    await repository.save(tenant('cr7', ['crtvplayer.com', 'cr7player.com']));
    await repository.save(tenant('ibox', ['xibo.app']));
    useCase = new ResolveTenantUseCase(repository);
  });

  it('finds the brand for an exact host, ignoring case and port', async () => {
    const result = await useCase.execute('CR7Player.com:443');

    expect(result.ok && result.value.slug).toBe('cr7');
  });

  it('refuses an unknown host instead of guessing a default brand', async () => {
    const result = await useCase.execute('unknown.example.com');

    expect(!result.ok && result.error.code).toBe('tenants.unknown_host');
  });

  it('never matches by substring (the old cr bug)', async () => {
    const result = await useCase.execute('api.crtvplayer.com');

    expect(!result.ok && result.error.code).toBe('tenants.unknown_host');
  });

  it('refuses a disabled brand', async () => {
    const cr7 = await repository.findBySlug('cr7');
    cr7?.disable();

    const result = await useCase.execute('crtvplayer.com');

    expect(!result.ok && result.error.code).toBe('tenants.disabled');
  });

  it('rejects a missing Host header', async () => {
    const result = await useCase.execute(undefined);

    expect(!result.ok && result.error.code).toBe('tenants.invalid_host');
  });
});
