import { describe, expect, it } from 'vitest';
import { HostName } from '../../src/modules/tenants/domain/host-name.js';
import { expandHosts, loadTenantSeed } from '../../src/tenant-seed.js';

const SEED = 'seeds/tenants.seed.json';

describe('seeds/tenants.seed.json', () => {
  it('is valid and every host is a real host name', async () => {
    const entries = await loadTenantSeed(SEED, true);

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      for (const host of entry.hosts)
        expect(HostName.parse(host).ok, `${entry.slug}: ${host}`).toBe(true);
    }
  });

  it('never gives the same host to two brands', async () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const entry of await loadTenantSeed(SEED, true)) {
      for (const host of entry.hosts) {
        const previous = owner.get(host);
        if (previous && previous !== entry.slug)
          clashes.push(`${host}: ${previous} / ${entry.slug}`);
        owner.set(host, entry.slug);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('has unique slugs', async () => {
    const slugs = (await loadTenantSeed(SEED, false)).map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('expandHosts', () => {
  it('adds www. to two-label domains only, and a dev host when asked', () => {
    expect(expandHosts('messi', ['messitvplayer.com', 'pay.bopay.info'], true)).toEqual([
      'messitvplayer.com',
      'www.messitvplayer.com',
      'pay.bopay.info',
      'messi.localhost',
    ]);
    expect(expandHosts('messi', ['Messitvplayer.com'], false)).toEqual([
      'messitvplayer.com',
      'www.messitvplayer.com',
    ]);
  });
});
