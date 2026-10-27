import { z } from 'zod';
import type { TenantSettingsPatch } from '../../../shared/kernel/tenant-settings.js';

/** `https://example.com` — scheme, host and optional port, nothing else. */
function isOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.origin === value;
  } catch {
    return false;
  }
}

/**
 * Shape of a settings change, and of the settings stored on a tenant (missing keys take defaults).
 * Strict: a misspelled flag is an error, not silently ignored.
 */
export const tenantSettingsPatchSchema = z
  .strictObject({
    features: z
      .strictObject({ maintenance: z.boolean(), rawPlaylistsForAndroid44: z.boolean() })
      .partial(),
    legacy: z
      .strictObject({
        plainBodyAddRemove: z.boolean(),
        raspEnforce: z.boolean().nullable(),
        notificationFields: z.boolean(),
        notificationInterval: z.string().regex(/^\d{1,10}$/, 'whole seconds, as text'),
      })
      .partial(),
    playlistProfile: z.enum(['xc', 'general']),
    corsOrigins: z
      .array(z.string().refine(isOrigin, 'must be an origin like https://example.com'))
      .max(50)
      .readonly(),
    frontendUrl: z.url({ protocol: /^https?$/ }).nullable(),
    partners: z
      .strictObject({ starArcsAppName: z.string().trim().min(1).max(64).nullable() })
      .partial(),
  })
  .partial() satisfies z.ZodType<TenantSettingsPatch>;
