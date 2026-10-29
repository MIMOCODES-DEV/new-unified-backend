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
      /**
       * EGP for one EUR: the store prices in EGP with it (old `euro_to_egp` in validate-mac-address).
       * Set by hand until the payments phase keeps it current.
       */
      eurToEgp: z.number().positive().max(10_000).nullable().default(null),
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
  macSwitch: z
    .strictObject({
      /** How many times a paid device may switch to a new MAC (DEV-7); 0 turns switching off. */
      maxPerDevice: z.number().int().min(0).max(100).default(1),
    })
    .prefault({}),
  email: z
    .strictObject({
      /** Sender of the brand's emails, e.g. `IBO Player <no-reply@iboplayer.com>`; the server is the secret `smtp.url`. */
      from: z.string().trim().min(3).max(200).nullable().default(null),
    })
    .prefault({}),
  stararcs: z
    .strictObject({
      /** The name StarArcs knows this brand's app by (`iboplayer`, `bobplayer`); null = not set up. */
      appName: z.string().trim().min(1).max(64).nullable().default(null),
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
