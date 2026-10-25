import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../../shared/kernel/clock.js';
import { TenantMemoryCache } from './tenant-memory-cache.js';

describe('TenantMemoryCache', () => {
  it('expires entries after the TTL', () => {
    let now = new Date('2026-10-25T00:00:00Z');
    const clock = { now: () => now } as FixedClock;
    const cache = new TenantMemoryCache<string>(clock, 1_000);
    cache.set('a', 'k', 'v', cache.generation('a'));

    now = new Date(now.getTime() + 999);
    expect(cache.get('a', 'k')).toBe('v');
    now = new Date(now.getTime() + 1);
    expect(cache.get('a', 'k')).toBeUndefined();
  });

  it('empties only the brand that changed', () => {
    const cache = new TenantMemoryCache<string>(new FixedClock(new Date()), 60_000);
    cache.set('a', 'k', 'a-value', 0);
    cache.set('b', 'k', 'b-value', 0);

    cache.invalidate('a');

    expect(cache.get('a', 'k')).toBeUndefined();
    expect(cache.get('b', 'k')).toBe('b-value');
  });

  it('does not keep a value loaded before a change landed', () => {
    const cache = new TenantMemoryCache<string>(new FixedClock(new Date()), 60_000);
    const generation = cache.generation('a'); // a slow read starts…
    cache.invalidate('a'); // …the value changes meanwhile…
    cache.set('a', 'k', 'stale', generation); // …and the old value arrives.

    expect(cache.get('a', 'k')).toBeUndefined();
  });
});
