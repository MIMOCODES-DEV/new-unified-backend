import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { HostName } from '../../domain/host-name.js';
import { Tenant } from '../../domain/tenant.entity.js';
import { TenantRepository } from '../ports/tenant.repository.js';

export interface SeedTenantEntry {
  slug: string;
  name: string;
  hosts: string[];
}

export interface SeedReport {
  created: string[];
  updated: string[];
  unchanged: string[];
  /** A host the seed wants for `slug` that already belongs to another tenant. Never moved automatically. */
  conflicts: { slug: string; host: string; ownedBy: string }[];
  errors: { slug: string; code: string; message: string }[];
}

/**
 * Loads a list of brands into the registry. Safe to run any number of times:
 * creates missing brands, updates names, adds missing hosts. It never removes a host or a brand,
 * and never moves a host that already belongs to another brand.
 */
@Injectable()
export class SeedTenantsUseCase {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly clock: Clock,
  ) {}

  async execute(entries: readonly SeedTenantEntry[]): Promise<SeedReport> {
    const report: SeedReport = {
      created: [],
      updated: [],
      unchanged: [],
      conflicts: [],
      errors: [],
    };

    for (const entry of entries) {
      const slug = entry.slug.trim().toLowerCase();
      const hosts: HostName[] = [];
      for (const raw of new Set(entry.hosts)) {
        const host = HostName.parse(raw);
        if (host.ok) hosts.push(host.value);
        else
          report.errors.push({
            slug,
            code: host.error.code,
            message: `${host.error.message}: ${raw}`,
          });
      }

      const existing = await this.tenants.findBySlug(slug);
      const free: HostName[] = [];
      for (const host of hosts) {
        if (existing?.hosts.some((h) => h.equals(host))) continue;
        const owner = await this.tenants.findByHost(host);
        if (owner && owner.id !== existing?.id) {
          report.conflicts.push({ slug, host: host.value, ownedBy: owner.slug });
        } else {
          free.push(host);
        }
      }

      if (!existing) {
        const created = Tenant.create({
          id: randomUUID(),
          slug,
          name: entry.name,
          hosts: free,
          now: this.clock.now(),
        });
        if (!created.ok) {
          report.errors.push({ slug, code: created.error.code, message: created.error.message });
          continue;
        }
        await this.tenants.save(created.value);
        report.created.push(slug);
        continue;
      }

      let changed = false;
      if (existing.name !== entry.name.trim()) {
        const renamed = existing.rename(entry.name);
        if (!renamed.ok)
          report.errors.push({ slug, code: renamed.error.code, message: renamed.error.message });
        else changed = true;
      }
      for (const host of free) {
        if (existing.addHost(host).ok) changed = true;
      }
      if (changed) {
        await this.tenants.save(existing);
        report.updated.push(slug);
      } else {
        report.unchanged.push(slug);
      }
    }
    return report;
  }
}
