import { z } from 'zod';
import {
  DEFAULT_TENANT_SETTINGS,
  mergeTenantSettings,
} from '../../../shared/kernel/tenant-settings.js';
import { tenantSettingsPatchSchema } from '../application/tenant-settings.schema.js';
import { HostName } from '../domain/host-name.js';
import { Tenant } from '../domain/tenant.entity.js';

/**
 * Stored shape of a tenant in the central database, checked on every read: data edited by hand
 * fails loudly instead of reaching business code. Settings saved before a flag existed take its
 * default.
 */
export const tenantDocumentSchema = z.object({
  _id: z.string(),
  slug: z.string(),
  name: z.string(),
  hosts: z.array(z.string()),
  status: z.enum(['active', 'disabled']),
  dbName: z.string().min(1),
  settings: tenantSettingsPatchSchema
    .optional()
    .transform((stored) => mergeTenantSettings(DEFAULT_TENANT_SETTINGS, stored ?? {})),
  // Coerced: documents also come back from the JSON cache in Redis.
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type TenantDocument = z.input<typeof tenantDocumentSchema>;

export function toTenantDocument(tenant: Tenant, updatedAt: Date): TenantDocument {
  return {
    _id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    hosts: tenant.hosts.map((h) => h.value),
    status: tenant.status,
    dbName: tenant.dbName,
    settings: tenant.settings,
    createdAt: tenant.createdAt,
    updatedAt,
  };
}

export function toTenant(raw: unknown): Tenant {
  const doc = tenantDocumentSchema.parse(raw);
  return Tenant.restore({
    id: doc._id,
    slug: doc.slug,
    name: doc.name,
    // Stored hosts were validated on save; a bad one here means the data was edited by hand.
    hosts: doc.hosts.map((h) => {
      const parsed = HostName.parse(h);
      if (!parsed.ok) throw parsed.error;
      return parsed.value;
    }),
    status: doc.status,
    dbName: doc.dbName,
    settings: doc.settings,
    createdAt: doc.createdAt,
  });
}
