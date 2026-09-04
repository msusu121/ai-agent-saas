import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  WEB_ORIGIN: z.string().url(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().regex(/^[a-fA-F0-9]{64}$/, 'must be 32 bytes encoded as 64 hex characters'),
  CREDENTIAL_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/, 'must be 32 bytes encoded as 64 hex characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  COOKIE_SECURE: booleanString.default(false),
  TRUST_PROXY: booleanString.default(false),
  MINIO_ENDPOINT: z.string().min(1),
  MINIO_PORT: z.coerce.number().int().min(1).max(65_535).default(9000),
  MINIO_USE_SSL: booleanString.default(false),
  MINIO_ACCESS_KEY: z.string().min(3),
  MINIO_SECRET_KEY: z.string().min(12),
  MINIO_BUCKET: z.string().min(3).default('sales-agent-private'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
