import 'dotenv/config';
import { z } from 'zod';

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}, z.boolean());

const optionalUrl = z.preprocess((value) => value === '' ? undefined : value, z.string().url().optional());
const optionalString = z.preprocess((value) => value === '' ? undefined : value, z.string().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_NAME: z.string().trim().min(1).default('Carpivara'),
  APP_URL: optionalUrl,
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  TRUST_PROXY: z.coerce.number().int().min(0).max(2).default(1),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: booleanFromEnv.default(false),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('2h'),
  DATA_PROVIDER: z.enum(['mock', 'real']).default('mock'),
  VEHICLE_API_BASE_URL: optionalUrl,
  VEHICLE_API_LOGIN: optionalString,
  VEHICLE_API_PASSWORD: optionalString,
  VEHICLE_API_TOKEN: optionalString,
  VEHICLE_API_TIMEOUT_MS: z.coerce.number().int().positive().max(120000).default(15000),
  PAYMENT_PROVIDER: z.enum(['sandbox', 'asaas']).default('sandbox'),
  PAYMENT_API_BASE_URL: optionalUrl,
  PAYMENT_API_KEY: optionalString,
  PAYMENT_WEBHOOK_SECRET: optionalString,
  SANDBOX_SEED_ENABLED: booleanFromEnv.default(false),
  SANDBOX_CREDIT_PURCHASE_ENABLED: booleanFromEnv.default(false),
  QUERY_CACHE_ENABLED: booleanFromEnv.default(true),
  QUERY_CACHE_TTL_SECONDS: z.coerce.number().int().positive().max(604800).default(3600),
  QUERY_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(120000).default(20000),
  RATE_LIMIT_ENABLED: booleanFromEnv.default(true),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(120),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().max(100).default(10),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_SENSITIVE_DATA: booleanFromEnv.default(false),
  AUDIT_LOG_ENABLED: booleanFromEnv.default(true),
  STORE_RAW_PROVIDER_RESPONSE: booleanFromEnv.default(true)
});

export const env = envSchema.parse(process.env);
