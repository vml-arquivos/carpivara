import 'dotenv/config';
import { z } from 'zod';
const booleanFromEnv = z.preprocess((v) => {
    if (typeof v !== 'string')
        return v;
    return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}, z.boolean());
const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    APP_NAME: z.string().default('Carivara'),
    APP_URL: z.string().url().optional(),
    WEB_ORIGIN: z.string().default('http://localhost:5173'),
    TRUST_PROXY: z.coerce.number().int().min(0).max(2).default(1),
    DATABASE_URL: z.string().min(1),
    DATABASE_SSL: booleanFromEnv.default(false),
    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.string().default('2h'),
    DATA_PROVIDER: z.enum(['mock', 'real']).default('mock'),
    VEHICLE_API_BASE_URL: z.string().optional(),
    VEHICLE_API_LOGIN: z.string().optional(),
    VEHICLE_API_PASSWORD: z.string().optional(),
    VEHICLE_API_TOKEN: z.string().optional(),
    VEHICLE_API_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
    PAYMENT_PROVIDER: z.enum(['sandbox', 'asaas']).default('sandbox'),
    PAYMENT_WEBHOOK_SECRET: z.string().optional(),
    SANDBOX_SEED_ENABLED: booleanFromEnv.default(true),
    SANDBOX_CREDIT_PURCHASE_ENABLED: booleanFromEnv.default(true)
});
export const env = envSchema.parse(process.env);
