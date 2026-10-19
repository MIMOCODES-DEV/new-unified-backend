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
  // Key of the XOR device tokens V4 apps get at login (TOKEN_KEY in the old backends). Must equal
  // the old key at cutover, or every logged-in TV must log in again. Unset → V4 login refused.
  LEGACY_DEVICE_TOKEN_KEY: z.string().min(8).optional(),
  // TV v3 (IBO app): AES passphrase and HMAC signing secret (TV_AES_NEW_SECRET / TV_SIGNING_SECRET
  // in the old ibo backend). Both ship inside the app, so they identify the app build only.
  // Move to per-brand secrets with TEN-04. Unset → TV v3 refuses every request.
  LEGACY_TV_V3_AES_KEY: z.string().min(8).optional(),
  LEGACY_TV_V3_SIGNING_KEY: z.string().min(8).optional(),
  // Signed v2 (Android apps, bob TV alias): ANDROID_AES_NEW_SECRET / ANDROID_SIGNING_SECRET in the
  // old backends. Shipped inside the apps, so they identify the app build only. Unset → v2 refused.
  LEGACY_V2_AES_KEY: z.string().min(8).optional(),
  LEGACY_V2_SIGNING_KEY: z.string().min(8).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
