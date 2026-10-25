import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { SeedTenantEntry } from './modules/tenants/index.js';

/** Shape of seeds/tenants.seed.json. Unknown top-level keys (description, sources, unresolved) are allowed. */
export const tenantSeedFileSchema = z.object({
  tenants: z
    .array(
      z.object({
        slug: z.string().min(1),
        name: z.string().min(1),
        hosts: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1),
});

/**
 * Adds the host variants every brand needs:
 * - `www.` for two-label domains (`cr7player.com` → also `www.cr7player.com`), since matching is exact;
 * - `<slug>.localhost` in development, so each developer reaches any brand locally without DNS setup.
 */
export function expandHosts(slug: string, hosts: readonly string[], dev: boolean): string[] {
  const all = new Set<string>();
  for (const host of hosts) {
    const h = host.trim().toLowerCase();
    all.add(h);
    if (h.split('.').length === 2) all.add(`www.${h}`);
  }
  if (dev) all.add(`${slug}.localhost`);
  return [...all];
}

export async function loadTenantSeed(file: string, dev: boolean): Promise<SeedTenantEntry[]> {
  const parsed = tenantSeedFileSchema.parse(JSON.parse(await readFile(file, 'utf8')));
  return parsed.tenants.map((t) => ({
    slug: t.slug,
    name: t.name,
    hosts: expandHosts(t.slug, t.hosts, dev),
  }));
}
