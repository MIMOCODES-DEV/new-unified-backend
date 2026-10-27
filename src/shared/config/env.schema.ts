import { z } from 'zod';

/**
 * Every environment variable the service reads, validated at boot.
 * A missing or malformed value stops the process instead of running with `undefined`.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  MONGO_URI: z
    .string()
    .regex(/^mongodb(\+srv)?:\/\//, 'must be a mongodb:// or mongodb+srv:// URI'),
  MONGO_CENTRAL_DB: z.string().min(1).default('unified_central'),
  REDIS_URL: z.string().regex(/^rediss?:\/\//, 'must be a redis:// or rediss:// URL'),
  /** Master key for per-brand secrets: 32 random bytes, base64. Required by processes that read them. */
  TENANT_SECRETS_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes, base64-encoded')
    .optional(),
  /**
   * Keys the old apps ship with (their routes only work when set). The V4 device token key, and the
   * AES and signing secrets of the signed TV v3 and v2 routes.
   */
  LEGACY_DEVICE_TOKEN_KEY: z.string().min(8).optional(),
  LEGACY_TV_V3_AES_KEY: z.string().min(8).optional(),
  LEGACY_TV_V3_SIGNING_KEY: z.string().min(8).optional(),
  LEGACY_V2_AES_KEY: z.string().min(8).optional(),
  LEGACY_V2_SIGNING_KEY: z.string().min(8).optional(),
  /**
   * StarArcs, the partner the apps get their sports and guest login from: the V4 `device/add` route
   * registers the device there with this key (one for every brand, as in the old backends).
   */
  STARARCS_URL: z.url().default('https://backend.stararcs.com'),
  STARARCS_GUEST_TOKEN: z.string().min(8).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
