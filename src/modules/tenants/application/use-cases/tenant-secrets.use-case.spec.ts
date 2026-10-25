import { beforeEach, describe, expect, it } from 'vitest';
import {
  InMemoryTenantChangeBus,
  InMemoryTenantSecretRepository,
  testCipher,
} from '../../../../../test/support/tenant-fakes.js';
import { InMemoryTenantRepository } from '../../../../../test/support/in-memory-tenant.repository.js';
import { FixedClock } from '../../../../shared/kernel/clock.js';
import type { Tenant } from '../../domain/tenant.entity.js';
import { TenantSecretCache } from '../tenant-memory-cache.js';
import { CreateTenantUseCase } from './create-tenant.use-case.js';
import { DeleteTenantSecretUseCase } from './delete-tenant-secret.use-case.js';
import { GetTenantSecretUseCase } from './get-tenant-secret.use-case.js';
import { ListTenantSecretsUseCase } from './list-tenant-secrets.use-case.js';
import { SetTenantSecretUseCase } from './set-tenant-secret.use-case.js';

const clock = new FixedClock(new Date('2026-10-25T00:00:00Z'));

describe('tenant secrets', () => {
  let tenants: InMemoryTenantRepository;
  let secrets: InMemoryTenantSecretRepository;
  let bus: InMemoryTenantChangeBus;
  let a: Tenant;
  let b: Tenant;

  /** One API process: its own cache, sharing the database and the bus with the others. */
  const process = () => {
    const cache = new TenantSecretCache(clock, bus);
    const cipher = testCipher();
    return {
      set: new SetTenantSecretUseCase(tenants, secrets, cipher, cache, bus, clock),
      remove: new DeleteTenantSecretUseCase(tenants, secrets, cache, bus),
      get: new GetTenantSecretUseCase(secrets, cipher, cache),
    };
  };

  beforeEach(async () => {
    tenants = new InMemoryTenantRepository();
    secrets = new InMemoryTenantSecretRepository();
    bus = new InMemoryTenantChangeBus();
    const create = new CreateTenantUseCase(tenants, clock);
    const created = [
      await create.execute({ slug: 'ibo', name: 'IBO', hosts: ['iboplayer.com'] }),
      await create.execute({ slug: 'bob', name: 'BOB', hosts: ['bobplayer.com'] }),
    ];
    [a, b] = created.map((r) => {
      if (!r.ok) throw r.error;
      return r.value;
    }) as [Tenant, Tenant];
  });

  it('stores only ciphertext and gives the value back to the server', async () => {
    const { set, get } = process();

    expect((await set.execute({ slug: 'ibo', name: 'store.key', value: 's3cret' })).ok).toBe(true);

    expect(JSON.stringify([...secrets.items])).not.toContain('s3cret');
    expect(await get.execute(a.id, 'store.key')).toBe('s3cret');
  });

  it('keeps each brand to its own secrets', async () => {
    const { set, get } = process();
    await set.execute({ slug: 'ibo', name: 'store.key', value: 'ibo-key' });

    expect(await get.execute(b.id, 'store.key')).toBeNull();
  });

  it('refuses a ciphertext copied into another brand', async () => {
    const { set, get } = process();
    await set.execute({ slug: 'ibo', name: 'store.key', value: 'ibo-key' });
    const stolen = secrets.items.get(`${a.id}/store.key`)!;
    secrets.items.set(`${b.id}/store.key`, stolen);

    await expect(get.execute(b.id, 'store.key')).rejects.toThrow();
  });

  it('serves repeated reads from memory', async () => {
    const { set, get } = process();
    await set.execute({ slug: 'ibo', name: 'store.key', value: 'v1' });
    await get.execute(a.id, 'store.key');
    const reads = secrets.reads;

    await get.execute(a.id, 'store.key');
    await get.execute(a.id, 'store.key');

    expect(secrets.reads).toBe(reads);
  });

  it('a change made in one process is seen by the others at once', async () => {
    const api = process();
    const cli = process();
    await cli.set.execute({ slug: 'ibo', name: 'store.key', value: 'v1' });
    expect(await api.get.execute(a.id, 'store.key')).toBe('v1'); // now cached in the API

    await cli.set.execute({ slug: 'ibo', name: 'store.key', value: 'v2' });
    expect(await api.get.execute(a.id, 'store.key')).toBe('v2');

    await cli.remove.execute({ slug: 'ibo', name: 'store.key' });
    expect(await api.get.execute(a.id, 'store.key')).toBeNull();
  });

  it('lists names, never values', async () => {
    const { set } = process();
    await set.execute({ slug: 'ibo', name: 'paypal.clientSecret', value: 'pp' });
    await set.execute({ slug: 'ibo', name: 'store.key', value: 'sk' });

    const result = await new ListTenantSecretsUseCase(tenants, secrets).execute('ibo');

    expect(result.ok && result.value).toEqual([
      { name: 'paypal.clientSecret', updatedAt: clock.now() },
      { name: 'store.key', updatedAt: clock.now() },
    ]);
  });

  it.each(['', 'Store.Key', 'store key', 'store..key', '$where'])(
    'refuses the secret name %j',
    async (name) => {
      const result = await process().set.execute({ slug: 'ibo', name, value: 'x' });

      expect(!result.ok && result.error.code).toBe('tenants.invalid_secret');
    },
  );

  it('refuses an empty value and an unknown brand', async () => {
    const { set } = process();

    const empty = await set.execute({ slug: 'ibo', name: 'store.key', value: '' });
    const unknown = await set.execute({ slug: 'nope', name: 'store.key', value: 'x' });

    expect(!empty.ok && empty.error.code).toBe('tenants.invalid_secret');
    expect(!unknown.ok && unknown.error.code).toBe('tenants.not_found');
  });

  it('reports deleting a secret that does not exist', async () => {
    const result = await process().remove.execute({ slug: 'ibo', name: 'store.key' });

    expect(!result.ok && result.error.code).toBe('tenants.secret_not_found');
  });
});
