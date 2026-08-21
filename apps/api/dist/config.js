import 'dotenv/config';
import { z } from 'zod';
const booleanFromEnv = z.preprocess((value) => {
    if (typeof value !== 'string')
        return value;
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
    EMAIL_PROVIDER: z.enum(['disabled', 'smtp']).default('disabled'),
    SMTP_HOST: optionalString,
    SMTP_PORT: z.coerce.number().int().positive().max(65535).default(587),
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    SMTP_SECURE: booleanFromEnv.default(false),
    EMAIL_FROM: z.string().trim().email().default('no-reply@carpivara.casadf.com.br'),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(10).max(120).default(30),
    TRUST_PROXY: z.coerce.number().int().min(0).max(2).default(1),
    DATABASE_URL: z.string().min(1),
    DATABASE_SSL: booleanFromEnv.default(false),
    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.string().default('2h'),
    // Dados veiculares: o modo real só pode operar com contrato e credenciais válidos.
    DATA_PROVIDER: z.enum(['mock', 'real']).default('mock'),
    // FIPE: feature desligada por padrão; os tokens são exclusivos do backend.
    FEATURE_FREE_FIPE: booleanFromEnv.default(false),
    FEATURE_REPORT_PDF: booleanFromEnv.default(true),
    FIPE_PRIMARY_BASE_URL: optionalUrl.default('https://fipe.parallelum.com.br/api/v2'),
    FIPE_PRIMARY_TOKEN: optionalString,
    FIPE_SECONDARY_BASE_URL: optionalUrl.default('https://brasilapi.com.br/api'),
    FIPE_SECONDARY_TOKEN: optionalString,
    FIPE_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(120000).default(10000),
    FIPE_GUEST_DAILY_LIMIT: z.coerce.number().int().positive().max(100).default(3),
    FIPE_AUTH_DAILY_LIMIT: z.coerce.number().int().positive().max(500).default(10),
    FIPE_CACHE_TTL_DAYS: z.coerce.number().int().positive().max(31).default(31),
    VEHICLE_API_BASE_URL: optionalUrl,
    VEHICLE_API_QUERY_PATH: optionalString,
    VEHICLE_API_AUTH_SCHEME: z.enum(['bearer', 'basic']).default('bearer'),
    VEHICLE_API_QUERY_METHOD: z.enum(['get', 'post']).default('get'),
    VEHICLE_API_LOGIN: optionalString,
    VEHICLE_API_PASSWORD: optionalString,
    VEHICLE_API_TOKEN: optionalString,
    VEHICLE_API_DEVICE_TOKEN: optionalString,
    APIBRASIL_BEARER_TOKEN: optionalString,
    APIBRASIL_DEVICE_TOKEN: optionalString,
    VEHICLE_API_TIMEOUT_MS: z.coerce.number().int().positive().max(120000).default(15000),
    // Pagamentos: credenciais runtime-only; nunca disponibilizar no build ou frontend.
    PAYMENT_PROVIDER: z.enum(['sandbox', 'asaas', 'mercadopago']).default('sandbox'),
    PAYMENT_API_BASE_URL: optionalUrl,
    PAYMENT_API_KEY: optionalString,
    PAYMENT_WEBHOOK_SECRET: optionalString,
    MP_ACCESS_TOKEN: optionalString,
    MP_WEBHOOK_SECRET: optionalString,
    MP_TIMEOUT_MS: z.coerce.number().int().positive().max(120000).default(15000),
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
    STORE_RAW_PROVIDER_RESPONSE: booleanFromEnv.default(true),
    // Bootstrap administrativo: uso pontual, explicitamente habilitado e removido após a promoção auditada.
    SUPER_ADMIN_BOOTSTRAP_ENABLED: booleanFromEnv.default(false),
    SUPER_ADMIN_BOOTSTRAP_EMAIL: optionalString,
    // OIDC/OAuth: client secrets are runtime-only values and must never be committed or enabled at build time.
    OAUTH_STATE_TTL_SECONDS: z.coerce.number().int().min(60).max(1800).default(600),
    OAUTH_LOGIN_TICKET_TTL_SECONDS: z.coerce.number().int().min(30).max(600).default(120),
    OAUTH_GOOGLE_CLIENT_ID: optionalString,
    OAUTH_GOOGLE_CLIENT_SECRET: optionalString,
    OAUTH_MICROSOFT_CLIENT_ID: optionalString,
    OAUTH_MICROSOFT_CLIENT_SECRET: optionalString,
    OAUTH_MICROSOFT_TENANT: z.string().trim().min(1).max(200).default('common'),
    OAUTH_APPLE_CLIENT_ID: optionalString,
    OAUTH_APPLE_TEAM_ID: optionalString,
    OAUTH_APPLE_KEY_ID: optionalString,
    OAUTH_APPLE_PRIVATE_KEY: optionalString
});
export const env = envSchema.parse(process.env);
export function publicAppUrl() {
    return (env.APP_URL ?? env.WEB_ORIGIN).replace(/\/$/, '');
}
export function oauthCallbackUrl(provider) {
    return `${publicAppUrl()}/api/auth/oauth/${provider}/callback`;
}
