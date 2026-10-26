import { z } from 'zod';

const httpUrl = z.url({ protocol: /^https?$/ });

/**
 * The brand's business settings: one typed document in its own database (`tenantConfig`),
 * replacing the old key/value `settings` rows. Every value has a default, so a brand without a
 * stored document still has a complete config. Modules add their section here as they are built;
 * secrets never go here (they belong in tenant secrets).
 */
export const tenantConfigSchema = z.strictObject({
  trial: z.strictObject({ days: z.number().int().min(0).max(365).default(7) }).prefault({}),
  currency: z
    .strictObject({
      main: z
        .string()
        .regex(/^[A-Z]{3}$/, 'ISO 4217 code')
        .default('EUR'),
    })
    .prefault({}),
  contact: z
    .strictObject({
      email: z.email().nullable().default(null),
      phone: z.string().trim().min(1).max(32).nullable().default(null),
      whatsapp: z.string().trim().min(1).max(32).nullable().default(null),
    })
    .prefault({}),
  app: z
    .strictObject({
      demoUrl: httpUrl.nullable().default(null),
      apkUrl: httpUrl.nullable().default(null),
    })
    .prefault({}),
  review: z
    .strictObject({
      /**
       * App builds in store review (Samsung, LG, …), answered as lifetime so the reviewer sees a
       * working app. Exact platform + version; staff remove a build when its review is done.
       */
      builds: z
        .array(
          z.strictObject({
            platform: z.string().regex(/^[a-z_]+$/),
            version: z.string().trim().min(1).max(32),
          }),
        )
        .max(50)
        .default([]),
    })
    .prefault({}),
  payments: z
    .strictObject({
      /** Which payment providers the brand shows, by provider code (`paypal`, `stripe`, …). */
      visible: z.record(z.string().regex(/^[a-z][a-z0-9]*$/), z.boolean()).default({}),
    })
    .prefault({}),
});

export type TenantConfig = z.output<typeof tenantConfigSchema>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Deep-merges a partial change into a config: objects merge key by key, anything else replaces. */
export function mergeConfigPatch(base: unknown, patch: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch;
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch))
    merged[key] = mergeConfigPatch(base[key], value);
  return merged;
}
