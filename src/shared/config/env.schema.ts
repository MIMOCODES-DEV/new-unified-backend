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
  // Static Bearer token the CRPlayer TV app sends (TV_KEY_V4 in the old cr backend). It is
  // visible in the app's code, so it only identifies the app; it is not real authentication.
  // Moves to per-brand secrets with TEN-04. Unset → the TV v4 routes refuse every request.
  LEGACY_TV_API_TOKEN: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
