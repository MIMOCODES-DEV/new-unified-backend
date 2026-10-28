import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTenantRepository } from '../../../../../test/support/in-memory-tenant.repository.js';
import { FixedClock } from '../../../../shared/kernel/clock.js';
import { DEFAULT_TENANT_SETTINGS } from '../../../../shared/kernel/tenant-settings.js';
import { AddTenantHostsUseCase } from './add-tenant-hosts.use-case.js';
import { CreateTenantUseCase } from './create-tenant.use-case.js';
import { UpdateTenantSettingsUseCase } from './update-tenant-settings.use-case.js';

describe('UpdateTenantSettingsUseCase', () => {
  let repository: InMemoryTenantRepository;
  let useCase: UpdateTenantSettingsUseCase;

  beforeEach(async () => {
    repository = new InMemoryTenantRepository();
    useCase = new UpdateTenantSettingsUseCase(repository);
    await new CreateTenantUseCase(repository, new FixedClock(new Date())).execute({
      slug: 'ibostb',
      name: 'IBO STB',
      hosts: ['ibostb.com'],
    });
  });

  it('gives a new brand the default settings', async () => {
    expect((await repository.findBySlug('ibostb'))?.settings).toEqual(DEFAULT_TENANT_SETTINGS);
  });

  it('changes only the settings it is given', async () => {
    const result = await useCase.execute({
      slug: 'ibostb',
      patch: { legacy: { plainBodyAddRemove: true }, corsOrigins: ['https://ibostb.com'] },
    });

    expect(result.ok && result.value.settings).toEqual({
      ...DEFAULT_TENANT_SETTINGS,
      // Only the flag given changes; the other legacy settings keep their defaults.
      legacy: { ...DEFAULT_TENANT_SETTINGS.legacy, plainBodyAddRemove: true },
      corsOrigins: ['https://ibostb.com'],
    });
    expect((await repository.findBySlug('ibostb'))?.settings.legacy.plainBodyAddRemove).toBe(true);
  });

  it.each([
    { reason: 'a misspelled flag', patch: { features: { maintenanceMode: true } } },
    { reason: 'a wrong type', patch: { features: { maintenance: 'yes' } } },
    { reason: 'an unknown profile', patch: { playlistProfile: 'roku' } },
    { reason: 'an origin with a path', patch: { corsOrigins: ['https://ibostb.com/path'] } },
    { reason: 'a non-http URL', patch: { frontendUrl: 'javascript:alert(1)' } },
  ])('refuses $reason', async ({ patch }) => {
    const result = await useCase.execute({ slug: 'ibostb', patch });

    expect(!result.ok && result.error.code).toBe('tenants.invalid_settings');
  });

  it('refuses an unknown brand', async () => {
    const result = await useCase.execute({ slug: 'nope', patch: {} });

    expect(!result.ok && result.error.code).toBe('tenants.not_found');
  });
});

describe('AddTenantHostsUseCase', () => {
  let repository: InMemoryTenantRepository;
  let useCase: AddTenantHostsUseCase;

  beforeEach(async () => {
    repository = new InMemoryTenantRepository();
    useCase = new AddTenantHostsUseCase(repository);
    const create = new CreateTenantUseCase(repository, new FixedClock(new Date()));
    await create.execute({ slug: 'cr7', name: 'CR7', hosts: ['crtvplayer.com'] });
    await create.execute({ slug: 'smart', name: 'Smart', hosts: ['smartonepro.com'] });
  });

  it('adds normalized hosts and skips ones the brand already has', async () => {
    const result = await useCase.execute({
      slug: 'cr7',
      hosts: ['CR7Player.com:443', 'crtvplayer.com'],
    });

    expect(result.ok && result.value.hosts.map((h) => h.value)).toEqual([
      'crtvplayer.com',
      'cr7player.com',
    ]);
  });

  it('never takes a host from another brand', async () => {
    const result = await useCase.execute({ slug: 'cr7', hosts: ['smartonepro.com'] });

    expect(!result.ok && result.error.code).toBe('tenants.conflict');
    expect((await repository.findBySlug('cr7'))?.hosts).toHaveLength(1);
  });

  it('refuses an invalid host', async () => {
    const result = await useCase.execute({ slug: 'cr7', hosts: ['not a host'] });

    expect(!result.ok && result.error.code).toBe('tenants.invalid_host');
  });
});
