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
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
