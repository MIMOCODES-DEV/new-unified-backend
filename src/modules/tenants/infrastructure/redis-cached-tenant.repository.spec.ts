import type { Redis } from 'ioredis';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTenantRepository } from '../../../../test/support/in-memory-tenant.repository.js';
import { FixedClock } from '../../../shared/kernel/clock.js';
import { CreateTenantUseCase } from '../application/use-cases/create-tenant.use-case.js';
import { HostName } from '../domain/host-name.js';
import { RedisCachedTenantRepository } from './redis-cached-tenant.repository.js';

/** Just enough of ioredis: get / set with EX / del, and a switch to simulate an outage. */
class FakeRedis {
  readonly store = new Map<string, { value: string; ttl: number }>();
  down = false;

  get(key: string): Promise<string | null> {
    return this.run(() => this.store.get(key)?.value ?? null);
  }
  set(key: string, value: string, _ex: 'EX', ttl: number): Promise<'OK'> {
    return this.run(() => {
      this.store.set(key, { value, ttl });
      return 'OK' as const;
    });
  }
  del(...keys: string[]): Promise<number> {
    return this.run(() => keys.filter((k) => this.store.delete(k)).length);
  }
  private run<T>(fn: () => T): Promise<T> {
    return this.down ? Promise.reject(new Error('connection lost')) : Promise.resolve(fn());
  }
}

class CountingRepository extends InMemoryTenantRepository {
  hostLookups = 0;
  override findByHost(host: HostName) {
    this.hostLookups++;
    return super.findByHost(host);
  }
}

const host = (value: string): HostName => {
  const parsed = HostName.parse(value);
  if (!parsed.ok) throw parsed.error;
  return parsed.value;
};

describe('RedisCachedTenantRepository', () => {
  let inner: CountingRepository;
  let redis: FakeRedis;
  let cached: RedisCachedTenantRepository;

  beforeEach(async () => {
    inner = new CountingRepository();
    redis = new FakeRedis();
    cached = new RedisCachedTenantRepository(inner, redis as unknown as Redis);
    await new CreateTenantUseCase(cached, new FixedClock(new Date())).execute({
      slug: 'cr7',
      name: 'CR7 Player',
      hosts: ['cr7player.com'],
    });
  });

  it('answers repeated lookups of a host from Redis', async () => {
    await cached.findByHost(host('cr7player.com'));
    const tenant = await cached.findByHost(host('cr7player.com'));

    expect(tenant?.slug).toBe('cr7');
    expect(tenant?.settings.playlistProfile).toBe('xc');
    expect(inner.hostLookups).toBe(1);
    expect(redis.store.get('tenants:host:cr7player.com')?.ttl).toBe(60);
  });

  it('remembers unknown hosts briefly, so junk Host headers do not hit the database', async () => {
    expect(await cached.findByHost(host('attacker.example'))).toBeNull();
    expect(await cached.findByHost(host('attacker.example'))).toBeNull();

    expect(inner.hostLookups).toBe(1);
    expect(redis.store.get('tenants:host:attacker.example')).toEqual({ value: '-', ttl: 10 });
  });

  it('drops cached hosts when a brand changes, including newly added ones', async () => {
    await cached.findByHost(host('cr7player.com'));
    await cached.findByHost(host('crtvplayer.com')); // unknown, cached as such
    const tenant = (await cached.findBySlug('cr7'))!;
    tenant.addHost(host('crtvplayer.com'));
    tenant.disable();

    await cached.save(tenant);

    expect((await cached.findByHost(host('cr7player.com')))?.isActive).toBe(false);
    expect((await cached.findByHost(host('crtvplayer.com')))?.slug).toBe('cr7');
  });

  it('falls back to the database when Redis is down', async () => {
    redis.down = true;

    expect((await cached.findByHost(host('cr7player.com')))?.slug).toBe('cr7');
  });

  it('treats an entry it cannot read as a miss', async () => {
    redis.store.set('tenants:host:cr7player.com', { value: '{"old":"shape"}', ttl: 60 });

    expect((await cached.findByHost(host('cr7player.com')))?.slug).toBe('cr7');
  });
});
