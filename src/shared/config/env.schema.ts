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
  /**
   * Key of the old apps' XOR device token (old TOKEN_KEY). Shared by all brands until per-brand
   * secrets exist (TEN-04). Optional: without it the legacy V4 routes answer 503.
   */
  LEGACY_TOKEN_KEY: z.string().min(8).optional(),
  /**
   * Secrets the old signed Android apps ship with (old ANDROID_SIGNING_SECRET / ANDROID_AES_NEW_SECRET):
   * HMAC key of the request signature and AES passphrase of request and response. Optional: without
   * them the signed Android route answers 503.
   */
  ANDROID_SIGNING_SECRET: z.string().min(8).optional(),
  ANDROID_AES_NEW_SECRET: z.string().min(8).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
