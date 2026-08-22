import crypto from 'node:crypto';

import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { auth, issueSession, revokeSession, type AuthUser } from './auth.js';
import { completeAuthorization, consumeLoginTicket, createAuthorizationRequest, oauthErrorUrl, oauthSuccessUrl, socialProviderStatus, type OAuthProvider } from './oauth.js';
import { env } from './config.js';
import { sendPasswordResetEmail, isEmailConfigured } from './email.js';
import { pool, tx } from './db.js';
import { normalizeBdrp } from './normalizer.js';
import { hasPermission, permissionsFor, requirePermission } from './permissions.js';
import { getProvider } from './providers/index.js';
import { getFipeProvider, quoteWithFallback, type FipeCatalogProvider } from './providers/fipeProvider.js';
import { fipePdf, fipePrintHtml, makeFipeQuote, reportSnapshot, type ReportBranding } from './fipeReport.js';
import { getPaymentProvider, getPaymentProviderFor, type PaymentProviderName } from './payments/index.js';
import { ensureSchema } from './schema.js';
import { performAdminLookup } from './adminLookup.js';
import { executeVehicleLookup } from './vehicleLookup.js';
import { calculateAffiliateCommission, calculateCouponDiscount, couponHasCapacity, couponWindowIsOpen } from './commercial.js';
import type { FipeQuote, FipeSelectionItem, FipeVehicleDetails, FipeVehicleType, NormalizedVehicle } from './types.js';

await ensureSchema();

const app = express();
const api = express.Router();
const plateSchema = z.string().trim().min(7).max(16).transform((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, '')).refine((value) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(value), 'INVALID_PLATE');
const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(10).max(128),
  acceptTerms: z.literal(true),
  acceptPrivacy: z.literal(true),
  marketingOptIn: z.boolean().optional().default(false),
  affiliateCode: z.string().trim().min(3).max(40).optional()
});
const oauthTicketSchema = z.object({ ticket: z.string().regex(/^[A-Za-z0-9_-]{30,160}$/) });
const loginSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) });
const requestQuerySchema = z.object({ plate: plateSchema, productId: z.string().trim().min(1).max(80) });
const fipeVehicleTypeSchema = z.enum(['cars', 'motorcycles', 'trucks']);
const fipeItemSchema = z.object({ code: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(180) });
const fipeSelectionSchema = z.object({
  vehicleType: fipeVehicleTypeSchema.optional(),
  brand: fipeItemSchema.optional(),
  model: fipeItemSchema.optional(),
  year: fipeItemSchema.optional(),
  plate: z.string().trim().max(16).optional()
}).refine((input) => Boolean(input.plate) || Boolean(input.vehicleType && input.brand && input.model && input.year), 'FIPE_SELECTION_REQUIRED');
const sandboxCreditSchema = z.object({ credits: z.number().int().min(10).max(10000) });
const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128).optional(), newPassword: z.string().min(10).max(128) });
const profileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  cpfCnpj: z.string().trim().max(30).optional(),
  phone: z.string().trim().max(30).optional(),
  companyName: z.string().trim().max(160).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().regex(/^[A-Za-z]{2}$/).optional(),
  marketingOptIn: z.boolean().optional()
});
const forgotPasswordSchema = z.object({ email: z.string().trim().email().max(254) });
const resetPasswordSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{30,160}$/), newPassword: z.string().min(10).max(128) });
const productUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().min(2).max(400).optional(),
  creditCost: z.number().int().min(0).max(100000).optional(),
  active: z.boolean().optional()
}).refine((input) => Object.keys(input).length > 0, 'EMPTY_UPDATE');
const adminUserUpdateSchema = z.object({
  active: z.boolean().optional(),
  role: z.enum(['OPERADOR', 'ADMIN', 'CLIENTE']).optional()
}).refine((input) => Object.keys(input).length > 0, 'EMPTY_UPDATE');
const adminWalletAdjustmentSchema = z.object({
  amount: z.number().int().min(-100000).max(100000).refine((value) => value !== 0, 'ZERO_ADJUSTMENT'),
  description: z.string().trim().min(8).max(280)
});
  const checkoutSchema = z.object({ packageSlug: z.string().trim().min(2).max(80), couponCode: z.string().trim().min(3).max(40).optional(), affiliateCode: z.string().trim().min(3).max(40).optional() });
  const couponFieldsSchema = z.object({ code: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/), discountType: z.enum(['PERCENT', 'FIXED']), discountValue: z.number().int().positive().max(100000), maxRedemptions: z.number().int().positive().max(1000000).nullable().optional(), startsAt: z.string().datetime().nullable().optional(), expiresAt: z.string().datetime().nullable().optional(), active: z.boolean().optional().default(true) });
  const couponCreateSchema = couponFieldsSchema.superRefine((value, ctx) => { if (value.discountType === 'PERCENT' && value.discountValue > 100) ctx.addIssue({ code: z.ZodIssueCode.too_big, maximum: 100, type: 'number', inclusive: true, path: ['discountValue'], message: 'PERCENT_MAX_100' }); });
  const couponUpdateSchema = couponFieldsSchema.partial().refine((input) => Object.keys(input).length > 0, 'EMPTY_UPDATE');
  const affiliateCreateSchema = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(254).optional().or(z.literal('')), code: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/), commissionBps: z.number().int().min(0).max(5000), active: z.boolean().optional().default(true) });
  const affiliateUpdateSchema = affiliateCreateSchema.partial().refine((input) => Object.keys(input).length > 0, 'EMPTY_UPDATE');
  const affiliateActivationSchema = z.object({ code: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/).optional() });
  const organizationBrandingSchema = z.object({ name: z.string().trim().min(2).max(160), document: z.string().trim().max(30).optional().nullable(), slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/).optional().nullable(), primaryColor: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(), accentColor: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(), logoUrl: z.string().url().max(500).optional().nullable(), customDomain: z.string().trim().max(255).optional().nullable(), settings: z.record(z.string(), z.string().trim().max(280)).optional(), active: z.boolean().optional() });
  const organizationMemberSchema = z.object({ userId: z.string().uuid(), role: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']).default('MEMBER') });
  const planInterestSchema = z.object({ email: z.string().trim().email().max(254), plan: z.enum(['PREMIUM', 'RISK']) });
  const safeSettingsSchema = z.object({
    siteTagline: z.string().trim().max(180).nullable().optional(),
    supportEmail: z.string().trim().email().max(254).nullable().optional(),
    maintenanceNotice: z.string().trim().max(280).nullable().optional(),
    defaultAffiliateRateBps: z.number().int().min(0).max(5000).optional(),
    fipeGuestDailyLimit: z.number().int().min(1).max(100000).optional()
  }).refine((input) => Object.keys(input).length > 0, 'EMPTY_UPDATE');

type AppError = Error & { code?: string; http?: number; expose?: boolean };
type RawBodyRequest = Request & { rawBody?: Buffer };
type FipeStoredResult = { __type: 'FIPE_QUOTE'; quote: FipeQuote };
type QueryRow = { id: string; status: string; credits_cost: number; product_id?: string; normalized: NormalizedVehicle | FipeStoredResult | null };

function appError(message: string, options: Pick<AppError, 'code' | 'http' | 'expose'> = {}): AppError {
  const error = new Error(message) as AppError;
  Object.assign(error, options);
  return error;
}

function asyncRoute(handler: RequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function requestId(req: Request): string {
  return String(req.res?.locals.requestId ?? 'unknown');
}

function log(level: 'info' | 'warn' | 'error', event: string, metadata: Record<string, unknown>): void {
  const permitted = Object.fromEntries(Object.entries(metadata).filter(([key]) => !/password|token|authorization|document|chassis|renavam/i.test(key)));
  const payload = { timestamp: new Date().toISOString(), level, event, ...permitted };
  if (level === 'error') console.error(JSON.stringify(payload));
  else if (level === 'warn') console.warn(JSON.stringify(payload));
  else console.info(JSON.stringify(payload));
}

async function audit(userId: string | null, action: string, entity: string, entityId: string | null, metadata: Record<string, unknown> = {}): Promise<void> {
  if (!env.AUDIT_LOG_ENABLED) return;
  await pool.query('INSERT INTO audit_logs(user_id,action,entity,entity_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)', [userId, action, entity, entityId, JSON.stringify(metadata)]);
}

function publicUser(row: { id: string; email: string; name: string; role: string }): AuthUser {
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

function toSafeQueryError(error: unknown): { status: number; code: string; message: string } {
  const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  if (code === 'NOT_FOUND') return { status: 404, code: 'PLACA_NAO_ENCONTRADA_SANDBOX', message: 'Esta placa não está disponível no ambiente de testes.' };
  if (code === 'PROVIDER_TIMEOUT') return { status: 502, code: 'QUERY_REFUNDED', message: 'Não foi possível concluir a consulta agora. Seus créditos foram devolvidos.' };
  if (code === 'INVALID_PLATE') return { status: 400, code, message: 'Informe uma placa válida no padrão brasileiro.' };
  if (code === 'INSUFFICIENT_CREDITS') return { status: 402, code, message: 'Seu saldo não é suficiente para esta consulta.' };
  if (code === 'DATA_PROVIDER_NOT_CONFIGURED') return { status: 503, code, message: 'A consulta oficial está em ativação. Tente novamente quando a fonte de dados estiver disponível.' };
  if (code === 'DATA_PROVIDER_AUTH_FAILED' || code === 'DATA_PROVIDER_UNAVAILABLE' || code === 'DATA_PROVIDER_INVALID_RESPONSE') return { status: 502, code: 'QUERY_REFUNDED', message: 'A fonte oficial não respondeu de forma válida. Seus créditos foram devolvidos.' };
  if (code === 'PRODUCT_NOT_FOUND') return { status: 404, code, message: 'Este produto de consulta não está disponível.' };
  return { status: 502, code: 'QUERY_REFUNDED', message: 'Não foi possível concluir a consulta agora. Seus créditos foram devolvidos.' };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(appError('PROVIDER_TIMEOUT', { code: 'PROVIDER_TIMEOUT' })), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function diagnostic(result: NormalizedVehicle): { level: 'CLEAR' | 'ATTENTION' | 'HIGH_RISK'; title: string; reason: string } {
  const debts = result.debts.filter((item) => item.hasDebt);
  const restrictions = result.restrictions.filter((item) => item.alert);
  if (restrictions.length > 0) {
    const names = restrictions.slice(0, 2).map((item) => item.label.toLowerCase()).join(' e ');
    return { level: 'HIGH_RISK', title: 'Atenção necessária', reason: `Foram identificadas ocorrências em ${names}. Analise os detalhes antes de seguir.` };
  }
  if (debts.length > 0) return { level: 'ATTENTION', title: 'Há débitos a regularizar', reason: `Foram identificados ${debts.length === 1 ? 'um débito' : `${debts.length} débitos`} no retorno do provedor.` };
  return { level: 'CLEAR', title: 'Sem alertas relevantes', reason: 'Não foram identificadas ocorrências relevantes nos dados retornados por esta consulta.' };
}

function serializeQuery(row: QueryRow & Record<string, unknown>): Record<string, unknown> {
  const normalized = row.normalized;
  const isFipe = Boolean(normalized && typeof normalized === 'object' && '__type' in normalized && normalized.__type === 'FIPE_QUOTE');
  const vehicle = !isFipe && normalized ? normalized as NormalizedVehicle : null;
  const result = isFipe
    ? { fipe: publicFipeQuote((normalized as FipeStoredResult).quote), blocks: (normalized as FipeStoredResult).quote.blocks, diagnostic: { level: 'CLEAR', title: 'Valor FIPE consultado', reason: 'A Tabela FIPE foi consultada; a situação documental não está incluída nesta modalidade.' } }
    : vehicle ? { ...vehicle, coverage: vehicle.coverage ?? { identification: vehicle.identification ? 'FOUND' : 'NOT_QUERIED', debts: vehicle.debts.length ? 'FOUND' : 'NOT_QUERIED', restrictions: vehicle.restrictions.length ? 'FOUND' : 'NOT_QUERIED', recall: vehicle.recall ? 'FOUND' : 'NOT_QUERIED' }, diagnostic: diagnostic(vehicle) } : null;
  return {
    id: row.id,
    plate: row.plate,
    productId: row.product_id,
    productName: row.product_name,
    status: row.status,
    creditsCost: row.credits_cost,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    verificationCode: !isFipe ? String(row.id).slice(0, 8).toUpperCase() : undefined,
    result
  };
}

app.set('trust proxy', env.TRUST_PROXY);
app.disable('x-powered-by');
app.use((req, res, next) => {
  const id = typeof req.headers['x-request-id'] === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(req.headers['x-request-id'])
    ? req.headers['x-request-id']
    : crypto.randomUUID();
  res.locals.requestId = id;
  res.setHeader('X-Request-Id', id);
  const started = performance.now();
  res.on('finish', () => log('info', 'request_complete', { requestId: id, method: req.method, path: req.path, status: res.statusCode, durationMs: Math.round(performance.now() - started) }));
  next();
});
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-origin' } }));
app.use(cors({ origin: env.NODE_ENV === 'production' ? false : env.WEB_ORIGIN, credentials: false }));
app.use(express.json({
  limit: '256kb',
  type: 'application/json',
  verify: (req, _res, body) => {
    if (req.url?.split('?')[0] === '/api/payments/mercadopago/webhook') {
      (req as RawBodyRequest).rawBody = Buffer.from(body);
    }
  }
}));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));
if (env.RATE_LIMIT_ENABLED) {
  app.use(rateLimit({ windowMs: env.RATE_LIMIT_WINDOW_MS, limit: env.RATE_LIMIT_MAX_REQUESTS, standardHeaders: true, legacyHeaders: false, skip: (req) => req.path === '/health' }));
}

app.get('/health', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, app: env.APP_NAME, database: 'ok' });
}));

const loginRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TOO_MANY_ATTEMPTS', message: 'Muitas tentativas. Aguarde alguns minutos para tentar novamente.' }
});
const passwordResetRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TOO_MANY_ATTEMPTS', message: 'Muitas solicitações. Aguarde alguns minutos para tentar novamente.' }
});

function passwordResetTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function passwordResetUnavailable(): AppError {
  return appError('PASSWORD_RESET_UNAVAILABLE', { code: 'PASSWORD_RESET_UNAVAILABLE', http: 503, expose: true });
}

api.get('/auth/providers', (_req, res) => {
  res.json({ providers: socialProviderStatus() });
});

api.get('/auth/oauth/:provider/start', asyncRoute(async (req, res) => {
  const provider = parseOAuthProvider(String(req.params.provider));
  const { authorizationUrl } = await createAuthorizationRequest(provider);
  res.redirect(302, authorizationUrl);
}));

const oauthCallback: RequestHandler = asyncRoute(async (req, res) => {
  const provider = parseOAuthProvider(String(req.params.provider));
  try {
    const result = await completeAuthorization(provider, {
      code: typeof req.body?.code === 'string' ? req.body.code : typeof req.query.code === 'string' ? req.query.code : undefined,
      state: typeof req.body?.state === 'string' ? req.body.state : typeof req.query.state === 'string' ? req.query.state : undefined,
      error: typeof req.body?.error === 'string' ? req.body.error : typeof req.query.error === 'string' ? req.query.error : undefined,
      errorDescription: typeof req.body?.error_description === 'string' ? req.body.error_description : typeof req.query.error_description === 'string' ? req.query.error_description : undefined,
      appleUser: typeof req.body?.user === 'string' ? req.body.user : undefined
    });
    res.redirect(302, oauthSuccessUrl(result.ticket));
  } catch (error) {
    const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'OAUTH_CALLBACK_FAILED';
    res.redirect(302, oauthErrorUrl(code));
  }
});
api.get('/auth/oauth/:provider/callback', oauthCallback);
api.post('/auth/oauth/:provider/callback', oauthCallback);

api.post('/auth/oauth/consume', loginRateLimit, asyncRoute(async (req, res) => {
  const parsed = oauthTicketSchema.safeParse(req.body);
  if (!parsed.success) throw appError('OAUTH_TICKET_INVALID', { code: 'OAUTH_TICKET_INVALID', http: 401, expose: true });
  const user = await consumeLoginTicket(parsed.data.ticket);
  const issued = await issueSession(user, { flow: 'social', requestId: requestId(req) });
  await audit(user.id, 'OAUTH_LOGIN', 'USER', user.id, { requestId: requestId(req) });
  res.json({ token: issued.token, user });
}));

api.post('/auth/register', asyncRoute(async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const email = parsed.data.email.toLowerCase();
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  try {
    const created = await tx(async (client) => {
      let affiliateId: string | null = null;
      if (parsed.data.affiliateCode) {
        const affiliate = await client.query('SELECT id,user_id FROM affiliates WHERE upper(code)=upper($1) AND active=true', [parsed.data.affiliateCode]);
        if (!affiliate.rowCount) throw appError('AFFILIATE_INVALID', { code: 'AFFILIATE_INVALID', http: 400, expose: true });
        affiliateId = String(affiliate.rows[0].id);
      }
      const user = await client.query('INSERT INTO users(email,password_hash,name,role,affiliate_id) VALUES($1,$2,$3,$4,$5) RETURNING id,email,name,role', [email, passwordHash, parsed.data.name, 'CLIENTE', affiliateId]);
      await client.query('INSERT INTO wallets(user_id,balance) VALUES($1,0)', [user.rows[0].id]);
      await client.query('INSERT INTO user_profiles(user_id,marketing_opt_in) VALUES($1,$2)', [user.rows[0].id, parsed.data.marketingOptIn]);
      await client.query(`INSERT INTO user_consents(user_id,consent_type,granted,policy_version,source,ip_hash)
        VALUES($1,'TERMS_OF_SERVICE',true,'2026-08','registration',$2),
              ($1,'PRIVACY_POLICY',true,'2026-08','registration',$2),
              ($1,'MARKETING_EMAIL',$3,'2026-08','registration',$2)`, [user.rows[0].id, hashIp(req.ip), parsed.data.marketingOptIn]);
      return user.rows[0] as AuthUser;
    });
    const issued = await issueSession(created, { flow: 'password_registration', requestId: requestId(req) });
    await audit(created.id, 'REGISTER', 'USER', created.id, { requestId: requestId(req) });
    res.status(201).json({ token: issued.token, user: created });
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') throw appError('EMAIL_ALREADY_EXISTS', { code: 'EMAIL_ALREADY_EXISTS', http: 409, expose: true });
    throw error;
  }
}));

api.post('/auth/login', loginRateLimit, asyncRoute(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) throw appError('INVALID_CREDENTIALS', { code: 'INVALID_CREDENTIALS', http: 401, expose: true });
  const email = parsed.data.email.toLowerCase();
  const result = await pool.query('SELECT id,email,password_hash,name,role,active,password_enabled,failed_login_attempts,locked_until FROM users WHERE lower(email)=lower($1)', [email]);
  const account = result.rows[0] as (Record<string, unknown> | undefined);
  const lockedUntil = account?.locked_until ? new Date(String(account.locked_until)) : undefined;
  const isLocked = lockedUntil && lockedUntil.getTime() > Date.now();
  const passwordMatches = account ? await bcrypt.compare(parsed.data.password, String(account.password_hash)) : false;
  if (!account || !account.active || account.password_enabled !== true || isLocked || !passwordMatches) {
    if (account?.id) {
      const failures = Number(account.failed_login_attempts ?? 0) + 1;
      const lock = failures >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await pool.query('UPDATE users SET failed_login_attempts=$2, locked_until=$3 WHERE id=$1', [account.id, failures >= 5 ? 0 : failures, lock]);
      await audit(String(account.id), 'LOGIN_FAILURE', 'USER', String(account.id), { requestId: requestId(req) });
    }
    throw appError('INVALID_CREDENTIALS', { code: 'INVALID_CREDENTIALS', http: 401, expose: true });
  }
  const user = publicUser({ id: String(account.id), email: String(account.email), name: String(account.name), role: String(account.role) });
  await pool.query('UPDATE users SET failed_login_attempts=0, locked_until=NULL, last_login_at=now() WHERE id=$1', [user.id]);
  const issued = await issueSession(user, { flow: 'password', requestId: requestId(req) });
  await audit(user.id, 'LOGIN', 'USER', user.id, { requestId: requestId(req) });
  res.json({ token: issued.token, user });
}));

api.post('/auth/logout', auth, asyncRoute(async (req, res) => {
  await revokeSession(req.sessionId);
  await audit(req.user!.id, 'LOGOUT', 'USER', req.user!.id, { requestId: requestId(req) });
  res.status(204).end();
}));

api.get('/profile', auth, asyncRoute(async (req, res) => {
  const result = await pool.query(`SELECT u.id,u.email,u.name,u.role,u.password_enabled,p.cpf_cnpj,p.phone,p.company_name,p.city,p.state,p.marketing_opt_in
    FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id WHERE u.id=$1 AND u.active=true`, [req.user!.id]);
  if (!result.rowCount) throw appError('ACCOUNT_NOT_FOUND', { code: 'ACCOUNT_NOT_FOUND', http: 404, expose: true });
  const row = result.rows[0];
  res.json({ profile: { id: String(row.id), email: String(row.email), name: String(row.name), role: String(row.role), passwordEnabled: Boolean(row.password_enabled), cpfCnpj: row.cpf_cnpj ?? '', phone: row.phone ?? '', companyName: row.company_name ?? '', city: row.city ?? '', state: row.state ?? '', marketingOptIn: Boolean(row.marketing_opt_in) } });
}));

api.put('/profile', auth, asyncRoute(async (req, res) => {
  const parsed = profileUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const input = parsed.data;
  const profile = await tx(async (client) => {
    const user = await client.query('UPDATE users SET name=$2 WHERE id=$1 AND active=true RETURNING id,email,name,role,password_enabled', [req.user!.id, input.name]);
    if (!user.rowCount) throw appError('ACCOUNT_NOT_FOUND', { code: 'ACCOUNT_NOT_FOUND', http: 404, expose: true });
    const updated = await client.query(`INSERT INTO user_profiles(user_id,cpf_cnpj,phone,company_name,city,state,marketing_opt_in)
      VALUES($1,$2,$3,$4,$5,$6,COALESCE($7,false))
      ON CONFLICT(user_id) DO UPDATE SET cpf_cnpj=EXCLUDED.cpf_cnpj,phone=EXCLUDED.phone,company_name=EXCLUDED.company_name,city=EXCLUDED.city,state=EXCLUDED.state,marketing_opt_in=COALESCE($7,user_profiles.marketing_opt_in),updated_at=now()
      RETURNING cpf_cnpj,phone,company_name,city,state,marketing_opt_in`, [req.user!.id, input.cpfCnpj ?? null, input.phone ?? null, input.companyName ?? null, input.city ?? null, input.state?.toUpperCase() ?? null, input.marketingOptIn ?? null]);
    if (input.marketingOptIn !== undefined) {
      await client.query(`INSERT INTO user_consents(user_id,consent_type,granted,policy_version,source,ip_hash)
        VALUES($1,'MARKETING_EMAIL',$2,'2026-08','profile_update',$3)`, [req.user!.id, input.marketingOptIn, hashIp(req.ip)]);
    }
    return { user: user.rows[0], profile: updated.rows[0] };
  });
  const publicAccount = publicUser({ id: String(profile.user.id), email: String(profile.user.email), name: String(profile.user.name), role: String(profile.user.role) });
  await audit(req.user!.id, 'PROFILE_UPDATED', 'USER', req.user!.id, { requestId: requestId(req) });
  res.json({ user: publicAccount, profile: { id: publicAccount.id, email: publicAccount.email, name: publicAccount.name, role: publicAccount.role, passwordEnabled: Boolean(profile.user.password_enabled), cpfCnpj: profile.profile.cpf_cnpj ?? '', phone: profile.profile.phone ?? '', companyName: profile.profile.company_name ?? '', city: profile.profile.city ?? '', state: profile.profile.state ?? '', marketingOptIn: Boolean(profile.profile.marketing_opt_in) } });
}));

api.post('/auth/forgot-password', passwordResetRateLimit, asyncRoute(async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const email = parsed.data.email.toLowerCase();
  const genericMessage = 'Se o e-mail estiver cadastrado, enviaremos as instruções para redefinir sua senha.';
  if (!isEmailConfigured()) {
    log('warn', 'password_reset_email_not_configured', { requestId: requestId(req) });
    throw passwordResetUnavailable();
  }
  const result = await pool.query('SELECT id,email,name FROM users WHERE lower(email)=lower($1) AND active=true', [email]);
  if (!result.rowCount) {
    res.status(202).json({ message: genericMessage });
    return;
  }
  const token = randomBytes(48).toString('base64url');
  const tokenHash = passwordResetTokenHash(token);
  const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
  await tx(async (client) => {
    await client.query('UPDATE password_reset_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL', [result.rows[0].id]);
    await client.query('INSERT INTO password_reset_tokens(user_id,token_hash,expires_at,request_ip_hash) VALUES($1,$2,$3,$4)', [result.rows[0].id, tokenHash, expiresAt, hashIp(req.ip)]);
  });
  try {
    await sendPasswordResetEmail({ to: String(result.rows[0].email), name: String(result.rows[0].name), token });
  } catch (error) {
    await pool.query('DELETE FROM password_reset_tokens WHERE token_hash=$1', [tokenHash]);
    log('warn', 'password_reset_email_failed', { requestId: requestId(req), userId: String(result.rows[0].id), reason: error instanceof Error ? error.message : 'unknown' });
    res.status(202).json({ message: genericMessage });
    return;
  }
  await audit(String(result.rows[0].id), 'PASSWORD_RESET_REQUESTED', 'USER', String(result.rows[0].id), { requestId: requestId(req) });
  res.status(202).json({ message: genericMessage });
}));

api.post('/auth/reset-password', passwordResetRateLimit, asyncRoute(async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const tokenHash = passwordResetTokenHash(parsed.data.token);
  const result = await tx(async (client) => {
    const token = await client.query(`SELECT t.id,t.user_id,u.email,u.name,u.role
      FROM password_reset_tokens t JOIN users u ON u.id=t.user_id
      WHERE t.token_hash=$1 AND t.used_at IS NULL AND t.expires_at>now() AND u.active=true
      FOR UPDATE`, [tokenHash]);
    if (!token.rowCount) throw appError('PASSWORD_RESET_TOKEN_INVALID', { code: 'PASSWORD_RESET_TOKEN_INVALID', http: 400, expose: true });
    const row = token.rows[0];
    await client.query('UPDATE users SET password_hash=$2,password_enabled=true,failed_login_attempts=0,locked_until=NULL WHERE id=$1', [row.user_id, await bcrypt.hash(parsed.data.newPassword, 12)]);
    await client.query('UPDATE password_reset_tokens SET used_at=now() WHERE id=$1', [row.id]);
    await client.query('UPDATE user_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [row.user_id]);
    return row as { id: string; user_id: string; email: string; name: string; role: string };
  });
  const user = publicUser({ id: String(result.user_id), email: String(result.email), name: String(result.name), role: String(result.role) });
  const issued = await issueSession(user, { flow: 'password_reset', requestId: requestId(req) });
  await audit(user.id, 'PASSWORD_RESET_COMPLETED', 'USER', user.id, { requestId: requestId(req) });
  res.json({ token: issued.token, user, message: 'Senha redefinida com sucesso.' });
}));

api.post('/auth/change-password', auth, asyncRoute(async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const result = await pool.query('SELECT password_hash,password_enabled FROM users WHERE id=$1 AND active=true', [req.user!.id]);
  const passwordEnabled = result.rows[0]?.password_enabled === true;
  if (!result.rowCount || (passwordEnabled && (!parsed.data.currentPassword || !(await bcrypt.compare(parsed.data.currentPassword, result.rows[0].password_hash))))) {
    throw appError('INVALID_CREDENTIALS', { code: 'INVALID_CREDENTIALS', http: 401, expose: true });
  }
  await pool.query('UPDATE users SET password_hash=$2,password_enabled=true WHERE id=$1', [req.user!.id, await bcrypt.hash(parsed.data.newPassword, 12)]);
  await pool.query('UPDATE user_sessions SET revoked_at=now() WHERE user_id=$1 AND id <> $2 AND revoked_at IS NULL', [req.user!.id, req.sessionId ?? '']);
  await audit(req.user!.id, 'PASSWORD_CHANGED', 'USER', req.user!.id, { requestId: requestId(req) });
  res.status(204).end();
}));

api.get('/me', auth, asyncRoute(async (req, res) => {
  const [account, wallet, identities] = await Promise.all([
    pool.query(`SELECT u.id,u.email,u.name,u.role,p.cpf_cnpj,p.phone,p.company_name,p.city,p.state,p.marketing_opt_in
      FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id WHERE u.id=$1 AND u.active=true`, [req.user!.id]),
    pool.query('SELECT balance FROM wallets WHERE user_id=$1', [req.user!.id]),
    pool.query('SELECT provider FROM user_identities WHERE user_id=$1 ORDER BY provider', [req.user!.id])
  ]);
  if (!account.rowCount) throw appError('ACCOUNT_NOT_FOUND', { code: 'ACCOUNT_NOT_FOUND', http: 404, expose: true });
  const row = account.rows[0];
  const user = publicUser({ id: String(row.id), email: String(row.email), name: String(row.name), role: String(row.role) });
  res.json({ user, balance: wallet.rows[0]?.balance ?? 0, permissions: permissionsFor(user.role), sandbox: env.DATA_PROVIDER === 'mock', identities: identities.rows.map((identity) => identity.provider), profile: { id: user.id, email: user.email, name: user.name, role: user.role, passwordEnabled: Boolean(row.password_enabled), cpfCnpj: row.cpf_cnpj ?? '', phone: row.phone ?? '', companyName: row.company_name ?? '', city: row.city ?? '', state: row.state ?? '', marketingOptIn: Boolean(row.marketing_opt_in) } });
}));

function fipeUnavailable(): AppError {
  return appError('FIPE_FEATURE_DISABLED', { code: 'FIPE_FEATURE_DISABLED', http: 404, expose: true });
}

function fipeProviderError(error: unknown): AppError {
  const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'FIPE_PROVIDER_UNAVAILABLE';
  const knownCodes = ['FIPE_NOT_FOUND', 'FIPE_REFERENCE_MISSING', 'FIPE_PLATE_NOT_FOUND', 'FIPE_PLATE_UNAVAILABLE', 'FIPE_PLATE_DATA_INVALID', 'FIPE_PLATE_VEHICLE_NOT_IDENTIFIED', 'FIPE_SELECTION_REQUIRED'];
  const publicCode = knownCodes.includes(code) ? code : 'FIPE_PROVIDER_UNAVAILABLE';
  const http = publicCode === 'FIPE_NOT_FOUND' || publicCode === 'FIPE_PLATE_NOT_FOUND' ? 404 : publicCode === 'FIPE_PLATE_DATA_INVALID' || publicCode === 'FIPE_PLATE_VEHICLE_NOT_IDENTIFIED' || publicCode === 'FIPE_SELECTION_REQUIRED' ? 422 : 502;
  return appError(publicCode, { code: publicCode, http, expose: true });
}

async function reserveFipeQuota(scopeKey: string, limit: number): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await tx(async (client) => {
    const result = await client.query(`INSERT INTO fipe_usage(scope_key,bucket_date,count) VALUES($1,$2,1)
      ON CONFLICT(scope_key,bucket_date) DO UPDATE SET count=fipe_usage.count+1,updated_at=now() RETURNING count`, [scopeKey, today]);
    if (Number(result.rows[0].count) <= limit) return;
    await client.query('UPDATE fipe_usage SET count=count-1,updated_at=now() WHERE scope_key=$1 AND bucket_date=$2', [scopeKey, today]);
    throw appError('FIPE_DAILY_LIMIT', { code: 'FIPE_DAILY_LIMIT', http: 429, expose: true });
  });
}

async function releaseFipeQuota(scopeKey: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    await pool.query('UPDATE fipe_usage SET count=GREATEST(count-1,0),updated_at=now() WHERE scope_key=$1 AND bucket_date=$2 AND count>0', [scopeKey, today]);
  } catch {
    // A falha de telemetria da cota não pode substituir o erro original da consulta.
  }
}

function requestSourceIp(req: Request): string | undefined {
  const cloudflareIp = req.get('cf-connecting-ip')?.trim();
  if (cloudflareIp && isIP(cloudflareIp)) return cloudflareIp;
  return req.ip;
}

async function recordFunnelEvent(userId: string | null, req: Request, eventType: string, metadata: Record<string, unknown> = {}): Promise<void> {
  try {
    await pool.query('INSERT INTO funnel_events(user_id,session_key,event_type,metadata) VALUES($1,$2,$3,$4::jsonb)', [userId, hashIp(requestSourceIp(req)), eventType, JSON.stringify(metadata)]);
  } catch {
    // Métricas são auxiliares: uma falha de telemetria não pode alterar a resposta do produto.
  }
}

async function recordProviderHealth(provider: string, status: 'SUCCESS' | 'FAILED', latencyMs: number, errorCode: string | null = null): Promise<void> {
  try {
    await pool.query('INSERT INTO provider_health_events(provider,source_type,status,latency_ms,error_code) VALUES($1,\'FIPE\',$2,$3,$4)', [provider, status, latencyMs, errorCode]);
  } catch {
    // Health check persistido é observabilidade, não dependência do fluxo de consulta.
  }
}

function monthEndExpiry(): Date {
  const now = new Date();
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const ttl = new Date(now.getTime() + env.FIPE_CACHE_TTL_DAYS * 86400000);
  return ttl < nextMonth ? ttl : nextMonth;
}

async function cacheFipeResult(result: Awaited<ReturnType<typeof quoteWithFallback>>): Promise<void> {
  await pool.query(`INSERT INTO fipe_cache(cache_key,provider,vehicle_type,brand_id,model_id,year_id,reference_code,reference_month,payload,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
    ON CONFLICT(cache_key) DO UPDATE SET payload=EXCLUDED.payload,reference_code=EXCLUDED.reference_code,reference_month=EXCLUDED.reference_month,expires_at=EXCLUDED.expires_at,updated_at=now()`, [
    result.cacheKey, result.provider, result.vehicleType, result.brand.code, result.model.code, result.year.code, result.referenceCode ?? null, result.referenceMonth, JSON.stringify(result), monthEndExpiry()
  ]);
}

async function findCachedFipeResult(input: { vehicleType: FipeVehicleType; brand: FipeSelectionItem; model: FipeSelectionItem; year: FipeSelectionItem }): Promise<Awaited<ReturnType<typeof quoteWithFallback>> | null> {
  const prefix = `parallelum:${input.vehicleType}:${input.brand.code}:${input.model.code}:${input.year.code}:%`;
  const cached = await pool.query('SELECT payload FROM fipe_cache WHERE cache_key LIKE $1 AND expires_at > now() ORDER BY updated_at DESC LIMIT 1', [prefix]);
  if (!cached.rowCount) return null;
  return cached.rows[0].payload as Awaited<ReturnType<typeof quoteWithFallback>>;
}

async function organizationBrandingForUser(userId: string): Promise<ReportBranding> {
  const result = await pool.query(`SELECT o.name,o.primary_color,o.accent_color,o.logo_url
    FROM organization_members m JOIN organizations o ON o.id=m.organization_id
    WHERE m.user_id=$1 AND o.active=true ORDER BY o.created_at LIMIT 1`, [userId]);
  if (!result.rowCount) return {};
  const row = result.rows[0] as Record<string, unknown>;
  return {
    name: typeof row.name === 'string' ? row.name : undefined,
    primaryColor: typeof row.primary_color === 'string' ? row.primary_color : undefined,
    accentColor: typeof row.accent_color === 'string' ? row.accent_color : undefined,
    logoUrl: typeof row.logo_url === 'string' ? row.logo_url : undefined
  };
}

async function saveFipeDocument(quote: FipeQuote): Promise<void> {
  await pool.query(`INSERT INTO report_documents(document_code,report_kind,provider,report_hash,snapshot)
    VALUES($1,'FIPE_FREE',$2,$3,$4::jsonb) ON CONFLICT(document_code) DO NOTHING`, [quote.documentCode, quote.provider, quote.reportHash, JSON.stringify(reportSnapshot(quote))]);
}

function snapshotQuote(document: Record<string, unknown>): FipeQuote {
  const snapshot = document.snapshot as { report?: FipeQuote } | undefined;
  if (!snapshot?.report?.documentCode || !snapshot.report.reportHash) throw appError('FIPE_INVALID_REPORT', { code: 'FIPE_INVALID_REPORT', http: 500 });
  return snapshot.report;
}

function publicFipeQuote(quote: FipeQuote): Omit<FipeQuote, 'provider' | 'source'> {
  const { provider: _provider, source: _source, ...publicQuote } = quote;
  return publicQuote;
}

async function safeBusinessSettings(): Promise<Record<string, unknown>> {
  const stored = await pool.query('SELECT value FROM platform_settings WHERE key=$1', ['safe_business']);
  return (stored.rows[0]?.value ?? {}) as Record<string, unknown>;
}

const publicOfferDescriptions: Record<string, string> = {
  FIPE_FREE: 'Veja o valor médio FIPE e a referência vigente para orientar sua negociação.',
  CADASTRAL: 'Confirme as características principais do veículo e compare com o anúncio.',
  RESTRICTIONS: 'Verifique impedimentos que podem afetar a negociação ou a transferência.',
  DEBTS: 'Consulte débitos e pendências relevantes antes de avançar na compra.',
  COMPLETE: 'Reúna identificação, características, débitos, restrições e situação em uma única análise.',
  PREMIUM: 'Acesse a análise mais completa disponível para tomar uma decisão com mais segurança.'
};

function publicOfferDescription(id: string, fallback: string): string {
  return publicOfferDescriptions[id] ?? fallback.replace(/\b(provedor|provider|fonte|source|API)\b/gi, 'consulta');
}

function normalizeMatchText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function matchScore(candidate: string, target: string): number {
  const c = normalizeMatchText(candidate);
  const t = normalizeMatchText(target);
  if (!c || !t) return 0;
  if (c === t) return 100;
  if (c.includes(t) || t.includes(c)) return 84;
  const targetTokens = t.split(' ').filter((token) => token.length > 1);
  if (!targetTokens.length) return 0;
  const matched = targetTokens.filter((token) => c.includes(token)).length;
  return Math.round((matched / targetTokens.length) * 70);
}

function bestFipeItem(items: FipeSelectionItem[], target: string, kind: 'brand' | 'model' | 'year'): FipeSelectionItem {
  const targetText = normalizeMatchText(target);
  const exact = items.filter((item) => normalizeMatchText(item.name) === targetText);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) throw appError('FIPE_PLATE_VEHICLE_NOT_IDENTIFIED', { code: 'FIPE_PLATE_VEHICLE_NOT_IDENTIFIED', http: 422, expose: true });
  const ranked = items.map((item) => ({ item, score: matchScore(item.name, target) })).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const second = ranked[1];
  const threshold = kind === 'brand' ? 60 : kind === 'model' ? 55 : 50;
  const minimumGap = kind === 'model' ? 10 : 6;
  if (!best || best.score < threshold || (second && best.score - second.score < minimumGap)) {
    throw appError('FIPE_PLATE_VEHICLE_NOT_IDENTIFIED', { code: 'FIPE_PLATE_VEHICLE_NOT_IDENTIFIED', http: 422, expose: true });
  }
  if (kind === 'year') {
    const targetYear = target.match(/\b(?:19|20)\d{2}\b/)?.[0];
    if (targetYear && !normalizeMatchText(best.item.name).includes(targetYear)) {
      throw appError('FIPE_PLATE_VEHICLE_NOT_IDENTIFIED', { code: 'FIPE_PLATE_VEHICLE_NOT_IDENTIFIED', http: 422, expose: true });
    }
  }
  return best.item;
}

function fipeVehicleDetails(vehicle: NormalizedVehicle): FipeVehicleDetails {
  return {
    plate: vehicle.identification.plate,
    brand: vehicle.identification.brand,
    model: vehicle.identification.model,
    fullModel: vehicle.identification.fullModel,
    manufactureYear: vehicle.characteristics.manufactureYear,
    modelYear: vehicle.characteristics.modelYear,
    color: vehicle.characteristics.color,
    fuel: vehicle.characteristics.fuel,
    power: vehicle.characteristics.power,
    displacement: vehicle.characteristics.displacement,
    type: vehicle.characteristics.type,
    species: vehicle.characteristics.species,
    category: vehicle.characteristics.category,
    body: vehicle.characteristics.body,
    passengers: vehicle.characteristics.passengers,
    loadCapacity: vehicle.characteristics.loadCapacity,
    origin: vehicle.characteristics.origin,
    city: vehicle.registration.city,
    state: vehicle.registration.state,
    licensingYear: vehicle.registration.licensingYear,
    status: vehicle.registration.status
  };
}

function fipeModelTarget(vehicle: NormalizedVehicle): string {
  const model = vehicle.identification.model ?? vehicle.identification.fullModel ?? '';
  const brand = normalizeMatchText(vehicle.identification.brand ?? '');
  if (!brand) return model;
  const modelParts = normalizeMatchText(model).split(' ');
  const brandParts = brand.split(' ');
  if (brandParts.every((part) => modelParts.includes(part))) {
    return modelParts.filter((part) => !brandParts.includes(part)).join(' ') || model;
  }
  return model;
}

function inferFipeVehicleType(vehicle: NormalizedVehicle): FipeVehicleType {
  const text = normalizeMatchText([vehicle.characteristics.type, vehicle.characteristics.species, vehicle.characteristics.category].filter(Boolean).join(' '));
  if (/moto|motocic|ciclomotor|scooter/.test(text)) return 'motorcycles';
  if (/caminhao|caminh|onibus|trator|reboque|semirreboque/.test(text)) return 'trucks';
  return 'cars';
}

async function resolveFipeSelectionFromPlate(plate: string): Promise<{ provider: 'parallelum' | 'brasilapi'; vehicleType: FipeVehicleType; brand: FipeSelectionItem; model: FipeSelectionItem; year: FipeSelectionItem; vehicleDetails: FipeVehicleDetails }> {
  let normalized: NormalizedVehicle;
  try {
    const vehicleProvider = getProvider();
    const output = await withTimeout(vehicleProvider.queryByPlate(plate), env.QUERY_REQUEST_TIMEOUT_MS);
    normalized = normalizeBdrp(output.raw);
  } catch (error) {
    const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : '';
    if (code === 'NOT_FOUND') throw appError('FIPE_PLATE_NOT_FOUND', { code: 'FIPE_PLATE_NOT_FOUND', http: 404, expose: true });
    if (code === 'PROVIDER_TIMEOUT' || code.startsWith('DATA_PROVIDER_')) throw appError('FIPE_PLATE_UNAVAILABLE', { code: 'FIPE_PLATE_UNAVAILABLE', http: 502, expose: true });
    throw appError('FIPE_PLATE_DATA_INVALID', { code: 'FIPE_PLATE_DATA_INVALID', http: 422, expose: true });
  }
  const brandTarget = normalized.identification.brand ?? normalized.identification.fullModel?.split(/\s+/)[0] ?? '';
  const modelTarget = fipeModelTarget(normalized);
  const yearTarget = `${normalized.characteristics.modelYear ?? normalized.characteristics.manufactureYear ?? ''} ${normalized.characteristics.fuel ?? ''}`.trim();
  if (!brandTarget || !modelTarget || !yearTarget) throw appError('FIPE_PLATE_DATA_INVALID', { code: 'FIPE_PLATE_DATA_INVALID', http: 422, expose: true });
  const vehicleType = inferFipeVehicleType(normalized);
  let lastError: unknown;
  for (const providerName of ['parallelum', 'brasilapi'] as const) {
    try {
      const catalog = getFipeProvider(providerName);
      const reference = (await catalog.references())[0];
      if (!reference) throw appError('FIPE_REFERENCE_MISSING', { code: 'FIPE_REFERENCE_MISSING', http: 502, expose: true });
      const brand = bestFipeItem(await catalog.brands(vehicleType, reference.code), brandTarget, 'brand');
      const model = bestFipeItem(await catalog.models(vehicleType, brand, reference.code), modelTarget, 'model');
      const year = bestFipeItem(await catalog.years(vehicleType, brand, model, reference.code), yearTarget, 'year');
      return { provider: providerName, vehicleType, brand, model, year, vehicleDetails: fipeVehicleDetails(normalized) };
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError instanceof Error && 'code' in lastError && typeof lastError.code === 'string') {
    if (lastError.code === 'FIPE_PLATE_VEHICLE_NOT_IDENTIFIED') throw lastError;
    if (lastError.code.startsWith('FIPE_PROVIDER_') || lastError.code === 'FIPE_INVALID_RESPONSE' || lastError.code === 'FIPE_RATE_LIMITED') {
      throw appError('FIPE_PLATE_UNAVAILABLE', { code: 'FIPE_PLATE_UNAVAILABLE', http: 502, expose: true });
    }
  }
  throw appError('FIPE_PLATE_VEHICLE_NOT_IDENTIFIED', { code: 'FIPE_PLATE_VEHICLE_NOT_IDENTIFIED', http: 422, expose: true });
}

api.get('/fipe/status', (_req, res) => {
  res.json({ enabled: env.FEATURE_FREE_FIPE, pdfEnabled: env.FEATURE_FREE_FIPE && env.FEATURE_REPORT_PDF });
});

api.get('/fipe/references', asyncRoute(async (_req, res) => {
  if (!env.FEATURE_FREE_FIPE) throw fipeUnavailable();
  try {
    const provider = getFipeProvider('parallelum');
    res.json({ references: await provider.references() });
  } catch (error) { throw fipeProviderError(error); }
}));

api.get('/fipe/brands', asyncRoute(async (req, res) => {
  if (!env.FEATURE_FREE_FIPE) throw fipeUnavailable();
  const vehicleType = fipeVehicleTypeSchema.safeParse(req.query.vehicleType);
  if (!vehicleType.success) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const providerName = 'parallelum';
  try { res.json({ brands: await getFipeProvider(providerName).brands(vehicleType.data, typeof req.query.reference === 'string' ? req.query.reference : undefined) }); }
  catch (error) { throw fipeProviderError(error); }
}));

api.get('/fipe/models', asyncRoute(async (req, res) => {
  if (!env.FEATURE_FREE_FIPE) throw fipeUnavailable();
  const vehicleType = fipeVehicleTypeSchema.safeParse(req.query.vehicleType);
  const brandCode = typeof req.query.brandCode === 'string' ? req.query.brandCode : '';
  if (!vehicleType.success || !brandCode) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const providerName = 'parallelum';
  try { res.json({ models: await getFipeProvider(providerName).models(vehicleType.data, { code: brandCode, name: 'selected' }, typeof req.query.reference === 'string' ? req.query.reference : undefined) }); }
  catch (error) { throw fipeProviderError(error); }
}));

api.get('/fipe/years', asyncRoute(async (req, res) => {
  if (!env.FEATURE_FREE_FIPE) throw fipeUnavailable();
  const vehicleType = fipeVehicleTypeSchema.safeParse(req.query.vehicleType);
  const brandCode = typeof req.query.brandCode === 'string' ? req.query.brandCode : '';
  const modelCode = typeof req.query.modelCode === 'string' ? req.query.modelCode : '';
  if (!vehicleType.success || !brandCode || !modelCode) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const providerName = 'parallelum';
  try { res.json({ years: await getFipeProvider(providerName).years(vehicleType.data, { code: brandCode, name: 'selected' }, { code: modelCode, name: 'selected' }, typeof req.query.reference === 'string' ? req.query.reference : undefined) }); }
  catch (error) { throw fipeProviderError(error); }
}));

api.post('/fipe/quote', asyncRoute(async (req, res) => {
  if (!env.FEATURE_FREE_FIPE) throw fipeUnavailable();
  const parsed = fipeSelectionSchema.safeParse(req.body);
  if (!parsed.success) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const normalizedPlate = parsed.data.plate ? plateSchema.safeParse(parsed.data.plate) : null;
  if (parsed.data.plate && !normalizedPlate?.success) throw appError('INVALID_PLATE', { code: 'INVALID_PLATE', http: 400, expose: true });
  const plate = normalizedPlate?.success ? normalizedPlate.data : undefined;
  // O prefixo v2 isola contadores criados antes da correção de proxy e evita
  // que um IP compartilhado do Cloudflare consuma a cota de todos os visitantes.
  const scopeKey = `v2:ip:${hashIp(requestSourceIp(req)) ?? 'unknown'}`;
  const safeBusiness = await safeBusinessSettings();
  const configuredGuestLimit = safeBusiness.fipeGuestDailyLimit;
  const guestLimit = typeof configuredGuestLimit === 'number' && Number.isInteger(configuredGuestLimit) && configuredGuestLimit > 0 ? configuredGuestLimit : env.FIPE_GUEST_DAILY_LIMIT;
  await reserveFipeQuota(scopeKey, guestLimit);
  let quotaReserved = true;
  let input: { vehicleType: FipeVehicleType; brand: FipeSelectionItem; model: FipeSelectionItem; year: FipeSelectionItem };
  let vehicleDetails: FipeVehicleDetails | undefined;
  let preferredProvider: 'parallelum' | 'brasilapi' = 'parallelum';
  try {
    if (parsed.data.vehicleType && parsed.data.brand && parsed.data.model && parsed.data.year) {
      input = { vehicleType: parsed.data.vehicleType, brand: parsed.data.brand, model: parsed.data.model, year: parsed.data.year };
    } else if (plate) {
      const resolved = await resolveFipeSelectionFromPlate(plate);
      input = { vehicleType: resolved.vehicleType, brand: resolved.brand, model: resolved.model, year: resolved.year };
      vehicleDetails = resolved.vehicleDetails;
      preferredProvider = resolved.provider;
    } else {
      throw appError('FIPE_SELECTION_REQUIRED', { code: 'FIPE_SELECTION_REQUIRED', http: 400, expose: true });
    }
    await recordFunnelEvent(null, req, 'FREE_QUERY_STARTED', { vehicleType: input.vehicleType, plateLookup: Boolean(plate) });
    const providerStartedAt = Date.now();
    const cached = preferredProvider === 'parallelum' ? await findCachedFipeResult(input) : null;
    const result = cached ?? await quoteWithFallback({ ...input, provider: preferredProvider });
    if (!cached) await cacheFipeResult(result);
    const quote = makeFipeQuote(result, plate, vehicleDetails);
    await recordProviderHealth(quote.provider, 'SUCCESS', Date.now() - providerStartedAt);
    await saveFipeDocument(quote);
    await recordFunnelEvent(null, req, 'FREE_QUERY_COMPLETED', { provider: quote.provider, documentCode: quote.documentCode, cached: Boolean(cached), plateLookup: Boolean(plate) });
    res.status(201).json(publicFipeQuote(quote));
  } catch (error) {
    if (quotaReserved) {
      quotaReserved = false;
      await releaseFipeQuota(scopeKey);
    }
    await recordFunnelEvent(null, req, 'FREE_QUERY_FAILED', { error: error instanceof Error ? error.message : 'provider_error', plateLookup: Boolean(plate) });
    throw fipeProviderError(error);
  }
}));

api.post('/fipe/quotes/:code/save', auth, requirePermission('VIEW_HISTORY'), asyncRoute(async (req, res) => {
  const document = await pool.query('SELECT * FROM report_documents WHERE document_code=$1 AND report_kind=\'FIPE_FREE\'', [req.params.code]);
  if (!document.rowCount) throw appError('REPORT_NOT_FOUND', { code: 'REPORT_NOT_FOUND', http: 404, expose: true });
  const row = document.rows[0] as Record<string, unknown>;
  if (row.user_id && row.user_id !== req.user!.id) throw appError('REPORT_NOT_FOUND', { code: 'REPORT_NOT_FOUND', http: 404, expose: true });
  if (row.query_id) return res.json({ queryId: row.query_id, documentCode: row.document_code });
  const quote = snapshotQuote(row);
  const saved = await tx(async (client) => {
    const query = await client.query(`INSERT INTO vehicle_queries(user_id,plate,product_id,status,credits_cost,provider,request_metadata,completed_at)
      VALUES($1,$2,'FIPE_FREE','SUCCESS',0,$3,$4::jsonb,now()) RETURNING id`, [req.user!.id, quote.plate ?? 'SEM-PLACA', quote.provider, JSON.stringify({ documentCode: quote.documentCode, source: quote.source })]);
    const queryId = query.rows[0].id as string;
    await client.query('INSERT INTO vehicle_query_results(query_id,normalized,raw_response) VALUES($1,$2::jsonb,$3::jsonb)', [queryId, JSON.stringify({ __type: 'FIPE_QUOTE', quote }), JSON.stringify({ stored: false })]);
    await client.query('UPDATE report_documents SET user_id=$2,query_id=$3 WHERE document_code=$1', [quote.documentCode, req.user!.id, queryId]);
    return queryId;
  });
  await recordFunnelEvent(req.user!.id, req, 'FREE_QUERY_SAVED', { documentCode: quote.documentCode, queryId: saved });
  await audit(req.user!.id, 'SAVE_FIPE_REPORT', 'REPORT', quote.documentCode, { queryId: saved, requestId: requestId(req) });
  res.status(201).json({ queryId: saved, documentCode: quote.documentCode });
}));

api.get('/fipe/reports/:code/pdf', auth, asyncRoute(async (req, res) => {
  if (!env.FEATURE_FREE_FIPE || !env.FEATURE_REPORT_PDF) throw fipeUnavailable();
  const document = await pool.query('SELECT snapshot FROM report_documents WHERE document_code=$1 AND report_kind=\'FIPE_FREE\'', [req.params.code]);
  if (!document.rowCount) throw appError('REPORT_NOT_FOUND', { code: 'REPORT_NOT_FOUND', http: 404, expose: true });
  const quote = snapshotQuote(document.rows[0] as Record<string, unknown>);
  await recordFunnelEvent(null, req, 'FREE_REPORT_DOWNLOADED', { documentCode: quote.documentCode });
  res.setHeader('Content-Disposition', `attachment; filename="carpivara-${quote.documentCode}.pdf"`);
  const branding = await organizationBrandingForUser(req.user!.id);
  res.type('application/pdf').send(fipePdf(quote, branding));
}));

api.get('/fipe/reports/:code/print', auth, asyncRoute(async (req, res) => {
  if (!env.FEATURE_FREE_FIPE) throw fipeUnavailable();
  const document = await pool.query('SELECT snapshot FROM report_documents WHERE document_code=$1 AND report_kind=\'FIPE_FREE\'', [req.params.code]);
  if (!document.rowCount) throw appError('REPORT_NOT_FOUND', { code: 'REPORT_NOT_FOUND', http: 404, expose: true });
  const quote = snapshotQuote(document.rows[0] as Record<string, unknown>);
  await recordFunnelEvent(null, req, 'REPORT_PRINTED', { documentCode: quote.documentCode });
  const branding = await organizationBrandingForUser(req.user!.id);
  res.type('html').send(fipePrintHtml(quote, branding));
}));

api.get('/stats', asyncRoute(async (_req, res) => {
  const result = await pool.query("SELECT count(*) AS total_queries FROM vehicle_queries WHERE status='SUCCESS'");
  res.json({ totalQueries: Number(result.rows[0].total_queries) });
}));

api.post('/plan-interest', asyncRoute(async (req, res) => {
  const parsed = planInterestSchema.safeParse(req.body);
  if (!parsed.success) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  await recordFunnelEvent(null, req, parsed.data.plan === 'RISK' ? 'RISK_INTEREST' : 'PREMIUM_INTEREST', { email: parsed.data.email.toLowerCase(), plan: parsed.data.plan });
  res.status(201).json({ ok: true });
}));

api.get('/validar-relatorio/:code', asyncRoute(async (req, res) => {
  const document = await pool.query(`SELECT document_code,report_kind,report_version,provider,report_hash,snapshot,created_at,superseded_at
    FROM report_documents WHERE document_code=$1`, [req.params.code]);
  if (document.rowCount) {
    const row = document.rows[0] as Record<string, unknown>;
    const quote = row.report_kind === 'FIPE_FREE' ? snapshotQuote(row) : null;
    return res.json({ authentic: true, reportKind: row.report_kind, reportVersion: row.report_version, documentCode: row.document_code, createdAt: row.created_at, status: row.superseded_at ? 'UPDATED' : 'VALID', hash: row.report_hash, plate: quote?.plate ? `${quote.plate.slice(0, 3)}***${quote.plate.slice(-2)}` : null, fipeReferenceMonth: quote?.referenceMonth ?? null });
  }
  const code = String(req.params.code).trim().toUpperCase();
  if (!/^[A-F0-9]{8}$/.test(code)) return res.status(404).json({ authentic: false, status: 'NOT_FOUND' });
  const query = await pool.query(`SELECT q.id,q.status,q.result_hash,q.created_at,q.plate
    FROM vehicle_queries q WHERE q.status='SUCCESS' AND upper(q.id::text) LIKE $1 ORDER BY q.created_at DESC LIMIT 1`, [`${code}%`]);
  if (!query.rowCount) return res.status(404).json({ authentic: false, status: 'NOT_FOUND' });
  const row = query.rows[0] as Record<string, unknown>;
  const plate = String(row.plate ?? '');
  return res.json({ authentic: true, reportKind: 'VEHICLE_QUERY', reportVersion: 1, documentCode: code, createdAt: row.created_at, status: 'VALID', hash: row.result_hash, plate: plate ? `${plate.slice(0, 3)}***${plate.slice(-2)}` : null, fipeReferenceMonth: null });
}));

api.get('/query-products', auth, asyncRoute(async (_req, res) => {
  const products = await pool.query(`SELECT id,name,description,credit_cost,slug,features,display_order,is_free,source,coverage,commercial_status,featured
    FROM query_products WHERE active=true ORDER BY display_order,credit_cost`);
  res.json(products.rows.map((product) => ({ id: product.id, name: product.name, description: product.description, creditCost: Number(product.credit_cost), slug: product.slug, features: product.features, isFree: Boolean(product.is_free), commercialStatus: product.commercial_status, featured: Boolean(product.featured) })));
}));

api.get('/fipe/offers', asyncRoute(async (_req, res) => {
  const products = await pool.query(`SELECT p.id,p.name,p.description,p.credit_cost,p.features,
      CASE WHEN p.is_free OR EXISTS (SELECT 1 FROM query_source_rules rule WHERE rule.product_id=p.id AND rule.active=true) THEN p.commercial_status ELSE 'SOON' END AS commercial_status,p.featured
    FROM query_products p WHERE p.id IN ('FIPE_FREE','CADASTRAL','RESTRICTIONS','DEBTS','COMPLETE','PREMIUM') ORDER BY p.display_order,p.credit_cost`);
  res.json({ offers: products.rows.map((product) => ({ id: product.id, name: product.name, description: publicOfferDescription(product.id, product.description), creditCost: Number(product.credit_cost), features: product.features, commercialStatus: product.commercial_status, featured: Boolean(product.featured) })) });
}));

api.post('/queries', auth, requirePermission('QUERY_VEHICLE'), asyncRoute(async (req, res) => {
  const parsed = requestQuerySchema.safeParse(req.body);
  if (!parsed.success) throw appError('INVALID_PLATE', { code: 'INVALID_PLATE', http: 400, expose: true });
  const idempotencyKeyHeader = req.headers['idempotency-key'];
  const idempotencyKey = typeof idempotencyKeyHeader === 'string' && /^[a-zA-Z0-9_-]{12,128}$/.test(idempotencyKeyHeader) ? idempotencyKeyHeader : null;
  const provider = getProvider();
  let queryId: string | null = null;
  let cost = 0;

  if (idempotencyKey) {
    const duplicate = await pool.query(`SELECT q.id,q.plate,q.product_id,q.status,q.credits_cost,q.provider,q.created_at,q.completed_at,p.name AS product_name,r.normalized
      FROM vehicle_queries q JOIN query_products p ON p.id=q.product_id LEFT JOIN vehicle_query_results r ON r.query_id=q.id
      WHERE q.user_id=$1 AND q.idempotency_key=$2`, [req.user!.id, idempotencyKey]);
    if (duplicate.rowCount) {
      const existing = serializeQuery(duplicate.rows[0] as QueryRow & Record<string, unknown>);
      if (existing.status === 'SUCCESS') return res.status(200).json({ ...existing, idempotent: true });
      throw appError('QUERY_IN_PROGRESS', { code: 'QUERY_IN_PROGRESS', http: 409, expose: true });
    }
  }

  try {
    await tx(async (client) => {
      const product = await client.query('SELECT credit_cost FROM query_products WHERE id=$1 AND active=true', [parsed.data.productId]);
      if (!product.rowCount) throw appError('PRODUCT_NOT_FOUND', { code: 'PRODUCT_NOT_FOUND', http: 404 });
      cost = Number(product.rows[0].credit_cost);
      const wallet = await client.query('SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE', [req.user!.id]);
      if (!wallet.rowCount || Number(wallet.rows[0].balance) < cost) throw appError('INSUFFICIENT_CREDITS', { code: 'INSUFFICIENT_CREDITS', http: 402 });
      const before = Number(wallet.rows[0].balance);
      const created = await client.query(`INSERT INTO vehicle_queries(user_id,plate,product_id,status,credits_cost,provider,idempotency_key,request_metadata)
        VALUES($1,$2,$3,'PROCESSING',$4,$5,$6,$7::jsonb) RETURNING id`, [req.user!.id, parsed.data.plate, parsed.data.productId, cost, provider.name, idempotencyKey, JSON.stringify({ requestId: requestId(req) })]);
      queryId = created.rows[0].id as string;
      const after = before - cost;
      await client.query('UPDATE wallets SET balance=$2,updated_at=now() WHERE user_id=$1', [req.user!.id, after]);
      await client.query(`INSERT INTO wallet_transactions(user_id,kind,amount,balance_before,balance_after,query_id,description,metadata)
        VALUES($1,'QUERY',$2,$3,$4,$5,$6,$7::jsonb)`, [req.user!.id, -cost, before, after, queryId, `Consulta ${parsed.data.plate}`, JSON.stringify({ productId: parsed.data.productId, requestId: requestId(req) })]);
    });

    const output = await executeVehicleLookup({ provider, plate: parsed.data.plate, timeoutMs: env.QUERY_REQUEST_TIMEOUT_MS, normalize: normalizeBdrp });
    const normalized = output.normalized;
    const resultHash = crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
    await tx(async (client) => {
      await client.query('INSERT INTO vehicle_query_results(query_id,normalized,raw_response) VALUES($1,$2::jsonb,$3::jsonb)', [queryId, JSON.stringify(normalized), JSON.stringify(env.STORE_RAW_PROVIDER_RESPONSE ? output.raw : { stored: false })]);
      await client.query(`UPDATE vehicle_queries SET status='SUCCESS',provider_query_id=$2,result_hash=$3,completed_at=now() WHERE id=$1`, [queryId, output.providerQueryId ?? null, resultHash]);
    });
    await audit(req.user!.id, 'VEHICLE_QUERY', 'VEHICLE_QUERY', queryId, { plate: parsed.data.plate, productId: parsed.data.productId, provider: provider.name, requestId: requestId(req) });
    const completed = await pool.query(`SELECT q.id,q.plate,q.product_id,q.status,q.credits_cost,q.provider,q.created_at,q.completed_at,p.name AS product_name,r.normalized
      FROM vehicle_queries q JOIN query_products p ON p.id=q.product_id JOIN vehicle_query_results r ON r.query_id=q.id WHERE q.id=$1`, [queryId]);
    res.status(201).json(serializeQuery(completed.rows[0] as QueryRow & Record<string, unknown>));
  } catch (error: unknown) {
    if (queryId) {
      await tx(async (client) => {
        const query = await client.query('SELECT status FROM vehicle_queries WHERE id=$1 FOR UPDATE', [queryId]);
        if (!query.rowCount || query.rows[0].status !== 'PROCESSING') return;
        const wallet = await client.query('SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE', [req.user!.id]);
        const before = Number(wallet.rows[0].balance);
        const after = before + cost;
        await client.query('UPDATE wallets SET balance=$2,updated_at=now() WHERE user_id=$1', [req.user!.id, after]);
        await client.query(`INSERT INTO wallet_transactions(user_id,kind,amount,balance_before,balance_after,query_id,description,metadata)
          VALUES($1,'REFUND',$2,$3,$4,$5,$6,$7::jsonb)`, [req.user!.id, cost, before, after, queryId, `Estorno consulta ${parsed.data.plate}`, JSON.stringify({ requestId: requestId(req) })]);
        const errorCode = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'PROVIDER_ERROR';
        await client.query(`UPDATE vehicle_queries SET status='REFUNDED',error_code=$2,error_message=$3,completed_at=now() WHERE id=$1`, [queryId, errorCode, 'Consulta não concluída; crédito estornado.']);
      });
      await audit(req.user!.id, 'QUERY_REFUND', 'VEHICLE_QUERY', queryId, { plate: parsed.data.plate, requestId: requestId(req) });
    }
    const safe = toSafeQueryError(error);
    res.status(safe.status).json({ error: safe.code, message: safe.message, refunded: Boolean(queryId) });
  }
}));

api.get('/queries', auth, requirePermission('VIEW_HISTORY'), asyncRoute(async (req, res) => {
  const plate = typeof req.query.plate === 'string' ? req.query.plate.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7) : '';
  const status = typeof req.query.status === 'string' && ['PROCESSING', 'SUCCESS', 'FAILED', 'REFUNDED'].includes(req.query.status) ? req.query.status : null;
  const results = await pool.query(`SELECT q.id,q.plate,q.product_id,q.status,q.credits_cost,q.provider,q.created_at,q.completed_at,p.name AS product_name,r.normalized
    FROM vehicle_queries q JOIN query_products p ON p.id=q.product_id LEFT JOIN vehicle_query_results r ON r.query_id=q.id
    WHERE q.user_id=$1 AND ($2='' OR q.plate LIKE $2 || '%') AND ($3::text IS NULL OR q.status=$3)
    ORDER BY q.created_at DESC LIMIT 100`, [req.user!.id, plate, status]);
  res.json(results.rows.map((row) => serializeQuery(row as QueryRow & Record<string, unknown>)));
}));

api.get('/queries/:id', auth, requirePermission('VIEW_HISTORY'), asyncRoute(async (req, res) => {
  const query = await pool.query(`SELECT q.id,q.plate,q.product_id,q.status,q.credits_cost,q.provider,q.created_at,q.completed_at,p.name AS product_name,r.normalized
    FROM vehicle_queries q JOIN query_products p ON p.id=q.product_id LEFT JOIN vehicle_query_results r ON r.query_id=q.id
    WHERE q.id=$1 AND q.user_id=$2`, [req.params.id, req.user!.id]);
  if (!query.rowCount) throw appError('QUERY_NOT_FOUND', { code: 'QUERY_NOT_FOUND', http: 404, expose: true });
  await audit(req.user!.id, 'VIEW_SAVED_QUERY', 'VEHICLE_QUERY', String(req.params.id), { requestId: requestId(req) });
  res.json(serializeQuery(query.rows[0] as QueryRow & Record<string, unknown>));
}));

api.get('/queries/:id/export', auth, requirePermission('VIEW_HISTORY'), asyncRoute(async (req, res) => {
  const query = await pool.query(`SELECT q.id,q.plate,q.product_id,q.status,q.credits_cost,q.provider,q.created_at,q.completed_at,p.name AS product_name,r.normalized
    FROM vehicle_queries q JOIN query_products p ON p.id=q.product_id LEFT JOIN vehicle_query_results r ON r.query_id=q.id
    WHERE q.id=$1 AND q.user_id=$2`, [req.params.id, req.user!.id]);
  if (!query.rowCount) throw appError('QUERY_NOT_FOUND', { code: 'QUERY_NOT_FOUND', http: 404, expose: true });
  await audit(req.user!.id, 'EXPORT_QUERY_JSON', 'VEHICLE_QUERY', String(req.params.id), { requestId: requestId(req) });
  res.setHeader('Content-Disposition', `attachment; filename="carpivara-${req.params.id}.json"`);
  res.type('application/json').send(JSON.stringify(serializeQuery(query.rows[0] as QueryRow & Record<string, unknown>), null, 2));
}));

api.get('/wallet/transactions', auth, asyncRoute(async (req, res) => {
  const transactions = await pool.query('SELECT id,kind,amount,balance_before,balance_after,description,created_at FROM wallet_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [req.user!.id]);
  res.json(transactions.rows.map((row) => ({ id: row.id, kind: row.kind, amount: row.amount, balanceBefore: row.balance_before, balanceAfter: row.balance_after, description: row.description, createdAt: row.created_at })));
}));

api.post('/payments/sandbox', auth, requirePermission('BUY_CREDITS'), asyncRoute(async (req, res) => {
  if (!env.SANDBOX_CREDIT_PURCHASE_ENABLED) throw appError('SANDBOX_DISABLED', { code: 'SANDBOX_DISABLED', http: 403, expose: true });
  const parsed = sandboxCreditSchema.safeParse(req.body);
  if (!parsed.success) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const result = await tx(async (client) => {
    const payment = await client.query(`INSERT INTO payments(user_id,provider,status,amount_cents,credits,paid_at,metadata)
      VALUES($1,'sandbox','PAID',$2,$3,now(),$4::jsonb) RETURNING id`, [req.user!.id, parsed.data.credits * 100, parsed.data.credits, JSON.stringify({ requestId: requestId(req) })]);
    const wallet = await client.query('SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE', [req.user!.id]);
    const before = Number(wallet.rows[0].balance);
    const after = before + parsed.data.credits;
    await client.query('UPDATE wallets SET balance=$2,updated_at=now() WHERE user_id=$1', [req.user!.id, after]);
    await client.query(`INSERT INTO wallet_transactions(user_id,kind,amount,balance_before,balance_after,payment_id,description,metadata)
      VALUES($1,'PURCHASE',$2,$3,$4,$5,$6,$7::jsonb)`, [req.user!.id, parsed.data.credits, before, after, payment.rows[0].id, 'Créditos de teste', JSON.stringify({ requestId: requestId(req) })]);
    return { paymentId: payment.rows[0].id, balance: after };
  });
  await audit(req.user!.id, 'SANDBOX_CREDIT_PURCHASE', 'PAYMENT', result.paymentId, { credits: parsed.data.credits, requestId: requestId(req) });
  res.status(201).json({ status: 'PAID', credits: parsed.data.credits, ...result });
}));

api.get('/credit-packages', auth, requirePermission('BUY_CREDITS'), asyncRoute(async (_req, res) => {
  const packages = await pool.query('SELECT slug,name,description,credits,price_cents FROM credit_packages WHERE active=true ORDER BY display_order,price_cents');
  res.json(packages.rows.map((item) => ({ slug: item.slug, name: item.name, description: item.description, credits: Number(item.credits), priceCents: Number(item.price_cents) })));
}));

api.get('/payments/orders', auth, requirePermission('BUY_CREDITS'), asyncRoute(async (req, res) => {
  const orders = await pool.query(`SELECT id,status,amount_cents,credits,provider,checkout_url,created_at,paid_at
    FROM payment_orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`, [req.user!.id]);
  res.json(orders.rows.map((item) => ({ id: item.id, status: item.status, amountCents: Number(item.amount_cents), credits: Number(item.credits), provider: item.provider, checkoutUrl: item.checkout_url, createdAt: item.created_at, paidAt: item.paid_at })));
}));

api.post('/payments/quote', auth, requirePermission('BUY_CREDITS'), asyncRoute(async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const quote = await tx(async (client) => {
    const pack = await client.query('SELECT slug,name,credits,price_cents FROM credit_packages WHERE slug=$1 AND active=true', [parsed.data.packageSlug]);
    if (!pack.rowCount) throw appError('CREDIT_PACKAGE_NOT_FOUND', { code: 'CREDIT_PACKAGE_NOT_FOUND', http: 404, expose: true });
    const packRow = pack.rows[0] as Record<string, unknown>;
    const subtotalCents = Number(packRow.price_cents);
    let discountCents = 0;
    let couponCode: string | null = null;
    if (parsed.data.couponCode) {
      const coupon = await client.query(`SELECT id,code,discount_type,discount_value,max_redemptions,redeemed_count,active,starts_at,expires_at
        FROM coupons WHERE upper(code)=upper($1) FOR SHARE`, [parsed.data.couponCode]);
      if (!coupon.rowCount) throw appError('COUPON_INVALID', { code: 'COUPON_INVALID', http: 400, expose: true });
      const couponRow = coupon.rows[0] as Record<string, unknown>;
      const reservations = await client.query(`SELECT count(*)::int AS reserved_count FROM coupon_redemptions WHERE coupon_id=$1 AND status='RESERVED'`, [couponRow.id]);
      if (!couponWindowIsOpen({ active: Boolean(couponRow.active), startsAt: couponRow.starts_at as string | Date | null, expiresAt: couponRow.expires_at as string | Date | null }) || !couponHasCapacity(couponRow.max_redemptions == null ? null : Number(couponRow.max_redemptions), Number(couponRow.redeemed_count), Number(reservations.rows[0]?.reserved_count ?? 0))) {
        throw appError('COUPON_UNAVAILABLE', { code: 'COUPON_UNAVAILABLE', http: 400, expose: true });
      }
      couponCode = String(couponRow.code);
      discountCents = calculateCouponDiscount(subtotalCents, String(couponRow.discount_type) as 'PERCENT' | 'FIXED', Number(couponRow.discount_value));
      if (discountCents >= subtotalCents) throw appError('COUPON_ZERO_TOTAL_UNSUPPORTED', { code: 'COUPON_ZERO_TOTAL_UNSUPPORTED', http: 400, expose: true });
    }
    return { packageSlug: String(packRow.slug), packageName: String(packRow.name), credits: Number(packRow.credits), couponCode, affiliateCode: parsed.data.affiliateCode ?? null, subtotalCents, discountCents, amountCents: Math.max(0, subtotalCents - discountCents) };
  });
  res.json({ ...quote, paymentProviderConfigured: getPaymentProvider().isConfigured(), usageCountChangesOnlyAfterPaid: true });
}));

api.post('/payments/checkout', auth, requirePermission('BUY_CREDITS'), asyncRoute(async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const paymentProvider = getPaymentProvider();
  if (!paymentProvider.isConfigured()) throw appError('PAYMENT_PROVIDER_NOT_CONFIGURED', { code: 'PAYMENT_PROVIDER_NOT_CONFIGURED', http: 503, expose: true });
  const draft = await tx(async (client) => {
    const pack = await client.query('SELECT id,slug,name,description,credits,price_cents FROM credit_packages WHERE slug=$1 AND active=true', [parsed.data.packageSlug]);
    if (!pack.rowCount) throw appError('CREDIT_PACKAGE_NOT_FOUND', { code: 'CREDIT_PACKAGE_NOT_FOUND', http: 404, expose: true });
    const profile = await client.query(`SELECT u.name,u.email,p.cpf_cnpj,p.phone FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id WHERE u.id=$1 AND u.active=true`, [req.user!.id]);
    if (!profile.rowCount) throw appError('AUTH_REQUIRED', { code: 'AUTH_REQUIRED', http: 401, expose: true });
    const packRow = pack.rows[0] as Record<string, unknown>;
    const subtotalCents = Number(packRow.price_cents);
    let discountCents = 0;
    let couponId: string | null = null;
    let couponCode: string | null = null;
    if (parsed.data.couponCode) {
      const coupon = await client.query(`SELECT id,code,discount_type,discount_value,max_redemptions,redeemed_count,active,starts_at,expires_at
        FROM coupons WHERE upper(code)=upper($1) FOR UPDATE`, [parsed.data.couponCode]);
      if (!coupon.rowCount) throw appError('COUPON_INVALID', { code: 'COUPON_INVALID', http: 400, expose: true });
      const couponRow = coupon.rows[0] as Record<string, unknown>;
      const reservations = await client.query(`SELECT count(*)::int AS reserved_count FROM coupon_redemptions WHERE coupon_id=$1 AND status='RESERVED'`, [couponRow.id]);
      if (!couponWindowIsOpen({ active: Boolean(couponRow.active), startsAt: couponRow.starts_at as string | Date | null, expiresAt: couponRow.expires_at as string | Date | null }) || !couponHasCapacity(couponRow.max_redemptions == null ? null : Number(couponRow.max_redemptions), Number(couponRow.redeemed_count), Number(reservations.rows[0]?.reserved_count ?? 0))) {
        throw appError('COUPON_UNAVAILABLE', { code: 'COUPON_UNAVAILABLE', http: 400, expose: true });
      }
      couponId = String(couponRow.id); couponCode = String(couponRow.code);
      discountCents = calculateCouponDiscount(subtotalCents, String(couponRow.discount_type) as 'PERCENT' | 'FIXED', Number(couponRow.discount_value));
      if (discountCents >= subtotalCents) throw appError('COUPON_ZERO_TOTAL_UNSUPPORTED', { code: 'COUPON_ZERO_TOTAL_UNSUPPORTED', http: 400, expose: true });
    }
    let affiliateId: string | null = null;
    let affiliateCommissionBps = 0;
    if (parsed.data.affiliateCode) {
      const affiliate = await client.query('SELECT id,user_id,commission_bps FROM affiliates WHERE upper(code)=upper($1) AND active=true', [parsed.data.affiliateCode]);
      if (!affiliate.rowCount || (affiliate.rows[0].user_id && String(affiliate.rows[0].user_id) === req.user!.id)) throw appError('AFFILIATE_INVALID', { code: 'AFFILIATE_INVALID', http: 400, expose: true });
      affiliateId = String(affiliate.rows[0].id); affiliateCommissionBps = Number(affiliate.rows[0].commission_bps);
    } else {
      const affiliate = await client.query(`SELECT a.id,a.user_id,a.commission_bps FROM users u JOIN affiliates a ON a.id=u.affiliate_id AND a.active=true WHERE u.id=$1`, [req.user!.id]);
      if (affiliate.rowCount && (!affiliate.rows[0].user_id || String(affiliate.rows[0].user_id) !== req.user!.id)) { affiliateId = String(affiliate.rows[0].id); affiliateCommissionBps = Number(affiliate.rows[0].commission_bps); }
    }
    const amountCents = Math.max(0, subtotalCents - discountCents);
    const externalReference = `carpivara_${crypto.randomUUID()}`;
    const order = await client.query(`INSERT INTO payment_orders(user_id,package_id,status,subtotal_cents,amount_cents,credits,provider,external_reference,discount_cents,coupon_id,affiliate_id,affiliate_commission_bps)
      VALUES($1,$2,'CREATED',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, [req.user!.id, packRow.id, subtotalCents, amountCents, packRow.credits, paymentProvider.name, externalReference, discountCents, couponId, affiliateId, affiliateCommissionBps]);
    if (couponId) await client.query(`INSERT INTO coupon_redemptions(coupon_id,payment_order_id,status) VALUES($1,$2,'RESERVED')`, [couponId, order.rows[0].id]);
    return { orderId: order.rows[0].id as string, externalReference, pack: packRow, customer: profile.rows[0] as Record<string, unknown>, subtotalCents, discountCents, amountCents, couponCode, couponId, affiliateId };
  });
  try {
    const checkout = await paymentProvider.createCheckout({
      orderId: draft.externalReference,
      itemName: String(draft.pack.name),
      itemDescription: String(draft.pack.description),
      amountCents: draft.amountCents,
      customer: { name: String(draft.customer.name), email: String(draft.customer.email), cpfCnpj: draft.customer.cpf_cnpj ? String(draft.customer.cpf_cnpj) : undefined, phone: draft.customer.phone ? String(draft.customer.phone) : undefined }
    });
    await pool.query(`UPDATE payment_orders SET status='CHECKOUT_ACTIVE',provider_checkout_id=$2,checkout_url=$3,updated_at=now() WHERE id=$1`, [draft.orderId, checkout.id, checkout.link]);
    await audit(req.user!.id, 'CREATE_PAYMENT_CHECKOUT', 'PAYMENT_ORDER', draft.orderId, { packageSlug: parsed.data.packageSlug, requestId: requestId(req) });
    res.status(201).json({ orderId: draft.orderId, checkoutUrl: checkout.link, provider: paymentProvider.name, subtotalCents: draft.subtotalCents, discountCents: draft.discountCents, amountCents: draft.amountCents, couponCode: draft.couponCode });
  } catch (error) {
    await pool.query(`UPDATE payment_orders SET status='FAILED',updated_at=now() WHERE id=$1`, [draft.orderId]);
    await pool.query(`UPDATE coupon_redemptions SET status='RELEASED',updated_at=now() WHERE payment_order_id=$1 AND status='RESERVED'`, [draft.orderId]);
    throw error;
  }
}));

async function processPaymentWebhook(providerName: PaymentProviderName, req: Request, res: Response): Promise<void> {
  const provider = getPaymentProviderFor(providerName);
  if (!provider.isConfigured()) throw appError('PAYMENT_PROVIDER_NOT_CONFIGURED', { code: 'PAYMENT_PROVIDER_NOT_CONFIGURED', http: 503, expose: false });
  const rawRequest = req as RawBodyRequest;
  if (!provider.isValidWebhookSignature({ headers: req.headers, rawBody: rawRequest.rawBody, query: req.query as Record<string, unknown> })) {
    throw appError('PAYMENT_WEBHOOK_UNAUTHORIZED', { code: 'PAYMENT_WEBHOOK_UNAUTHORIZED', http: 401, expose: false });
  }
  const parsed = provider.parseWebhookEvent(req.body, req.query as Record<string, unknown>);
  if (!parsed || (providerName === 'mercadopago' && !parsed.externalPaymentId)) {
    throw appError('PAYMENT_WEBHOOK_INVALID', { code: 'PAYMENT_WEBHOOK_INVALID', http: 400, expose: false });
  }

  let reference = parsed.externalReference;
  let rawStatus = parsed.rawStatus;
  if (provider.fetchPaymentStatus && parsed.externalPaymentId) {
    const payment = await provider.fetchPaymentStatus(parsed.externalPaymentId);
    if (!payment) throw appError('PAYMENT_PROVIDER_REQUEST_FAILED', { code: 'PAYMENT_PROVIDER_REQUEST_FAILED', http: 502, expose: false });
    reference ??= payment.externalReference ?? null;
    rawStatus = payment.status;
  }

  const event = req.body as Record<string, unknown>;
  const asaasEventId = typeof event.id === 'string' ? event.id : '';
  const eventType = providerName === 'mercadopago' ? `payment.${rawStatus ?? 'unknown'}` : rawStatus ?? '';
  const eventId = providerName === 'mercadopago'
    ? `payment:${parsed.externalPaymentId}:${rawStatus ?? 'unknown'}`
    : asaasEventId;
  if (!eventId || !eventType || (!reference && !parsed.externalPaymentId)) {
    throw appError('PAYMENT_WEBHOOK_INVALID', { code: 'PAYMENT_WEBHOOK_INVALID', http: 400, expose: false });
  }

  let duplicate = false;
  await tx(async (client) => {
    const inserted = await client.query(`INSERT INTO payment_webhook_events(provider,provider_event_id,event_type,payload)
      VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(provider,provider_event_id) DO NOTHING RETURNING id`, [providerName, eventId, eventType, JSON.stringify({ id: eventId, event: eventType, reference, externalId: parsed.externalPaymentId })]);
    if (!inserted.rowCount) { duplicate = true; return; }
    const order = reference
      ? await client.query('SELECT * FROM payment_orders WHERE external_reference=$1 FOR UPDATE', [reference])
      : await client.query('SELECT * FROM payment_orders WHERE provider_checkout_id=$1 FOR UPDATE', [parsed.externalPaymentId]);
    if (!order.rowCount) {
      await client.query('UPDATE payment_webhook_events SET processing_error=$2,processed_at=now() WHERE id=$1', [inserted.rows[0].id, 'ORDER_NOT_FOUND']);
      return;
    }
    const current = order.rows[0] as Record<string, unknown>;
    const orderId = String(current.id);
    await client.query('UPDATE payment_webhook_events SET order_id=$2 WHERE id=$1', [inserted.rows[0].id, orderId]);
    const normalizedStatus = String(rawStatus ?? '').toUpperCase();
    const paid = providerName === 'mercadopago'
      ? normalizedStatus === 'APPROVED'
      : normalizedStatus === 'CHECKOUT_PAID' || normalizedStatus === 'PAYMENT_RECEIVED';
    if (paid && current.status !== 'PAID') {
      const wallet = await client.query('SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE', [current.user_id]);
      const before = Number(wallet.rows[0]?.balance ?? 0); const credits = Number(current.credits); const after = before + credits;
      const payment = await client.query(`INSERT INTO payments(user_id,provider,status,amount_cents,credits,external_id,order_id,paid_at,provider_status,metadata)
        VALUES($1,$2,'PAID',$3,$4,$5,$6,now(),$7,$8::jsonb) RETURNING id`, [current.user_id, providerName, current.amount_cents, credits, parsed.externalPaymentId, orderId, rawStatus, JSON.stringify({ eventId })]);
      await client.query('INSERT INTO wallets(user_id,balance) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET balance=EXCLUDED.balance,updated_at=now()', [current.user_id, after]);
      await client.query(`INSERT INTO wallet_transactions(user_id,kind,amount,balance_before,balance_after,payment_id,description,metadata)
        VALUES($1,'PURCHASE',$2,$3,$4,$5,$6,$7::jsonb)`, [current.user_id, credits, before, after, payment.rows[0].id, `Créditos adquiridos via ${providerName}`, JSON.stringify({ orderId, eventId })]);
      if (current.coupon_id) {
        const redemption = await client.query(`UPDATE coupon_redemptions SET status='REDEEMED',redeemed_at=now(),updated_at=now()
          WHERE payment_order_id=$1 AND status='RESERVED' RETURNING id`, [orderId]);
        if (redemption.rowCount) await client.query('UPDATE coupons SET redeemed_count=redeemed_count+1,updated_at=now() WHERE id=$1', [current.coupon_id]);
      }
      if (current.affiliate_id) {
        const commissionCents = calculateAffiliateCommission(Number(current.amount_cents), Number(current.affiliate_commission_bps ?? 0));
        await client.query(`INSERT INTO affiliate_commissions(affiliate_id,payment_id,order_id,amount_cents,status)
          VALUES($1,$2,$3,$4,'PENDING') ON CONFLICT(payment_id) DO NOTHING`, [current.affiliate_id, payment.rows[0].id, orderId, commissionCents]);
      }
      await client.query(`UPDATE payment_orders SET status='PAID',paid_at=now(),updated_at=now() WHERE id=$1`, [orderId]);
    } else if (!paid && current.status !== 'PAID') {
      const mapped = normalizedStatus.includes('EXPIRED') ? 'EXPIRED'
        : normalizedStatus.includes('CANCEL') || normalizedStatus.includes('REJECT') ? 'CANCELLED'
          : normalizedStatus.includes('REFUND') ? 'REFUNDED' : 'CHECKOUT_ACTIVE';
      await client.query('UPDATE payment_orders SET status=$2,updated_at=now() WHERE id=$1', [orderId, mapped]);
      if (['CANCELLED', 'EXPIRED', 'FAILED'].includes(mapped)) await client.query(`UPDATE coupon_redemptions SET status='RELEASED',updated_at=now() WHERE payment_order_id=$1 AND status='RESERVED'`, [orderId]);
    }
    await client.query('UPDATE payment_webhook_events SET processed_at=now() WHERE id=$1', [inserted.rows[0].id]);
  });
  res.status(200).json({ received: true, duplicate });
}

api.post('/payments/asaas/webhook', asyncRoute(async (req, res) => {
  await processPaymentWebhook('asaas', req, res);
}));

api.post('/payments/mercadopago/webhook', asyncRoute(async (req, res) => {
  await processPaymentWebhook('mercadopago', req, res);
}));

api.get('/admin/overview', auth, requirePermission('VIEW_AUDIT'), asyncRoute(async (_req, res) => {
  const summary = await pool.query(`SELECT
    (SELECT count(*) FROM users WHERE active=true AND deleted_at IS NULL) AS active_users,
    (SELECT count(*) FROM users WHERE active=true AND deleted_at IS NULL AND created_at >= now() - interval '30 days') AS new_users_30d,
    (SELECT count(*) FROM vehicle_queries WHERE created_at >= date_trunc('day', now())) AS queries_today,
    (SELECT count(*) FROM vehicle_queries WHERE status='SUCCESS') AS successful_queries,
    (SELECT count(*) FROM vehicle_queries WHERE status='FAILED') AS failed_queries,
    (SELECT count(*) FROM vehicle_queries WHERE status='REFUNDED') AS refunds,
    (SELECT coalesce(sum(credits),0) FROM payments WHERE status='PAID') AS credits_sold,
    (SELECT coalesce(sum(abs(amount)),0) FROM wallet_transactions WHERE kind='QUERY') AS credits_consumed,
    (SELECT coalesce(sum(amount_cents),0) FROM payments WHERE status='PAID') AS confirmed_revenue_cents,
    (SELECT count(*) FROM payments WHERE status='PAID') AS confirmed_sales,
    (SELECT coalesce(round(avg(amount_cents)),0) FROM payments WHERE status='PAID') AS average_ticket_cents,
    (SELECT coalesce(sum(amount_cents),0) FROM payment_orders WHERE status IN ('CREATED','CHECKOUT_ACTIVE')) AS open_checkout_cents,
    (SELECT coalesce(sum(amount_cents),0) FROM payment_orders WHERE status='REFUNDED') AS refunded_revenue_cents,
    (SELECT coalesce(sum(w.balance),0) FROM wallets w JOIN users u ON u.id=w.user_id WHERE u.active=true AND u.deleted_at IS NULL) AS credits_in_wallets,
    (SELECT count(*) FROM funnel_events WHERE event_type='FREE_QUERY_STARTED') AS fipe_started,
    (SELECT count(*) FROM funnel_events WHERE event_type='FREE_QUERY_COMPLETED') AS fipe_completed,
    (SELECT count(*) FROM funnel_events WHERE event_type='FREE_QUERY_SAVED') AS fipe_saved,
    (SELECT count(*) FROM funnel_events WHERE event_type='FREE_REPORT_DOWNLOADED') AS fipe_pdf_downloads,
    (SELECT count(*) FROM provider_health_events WHERE source_type='FIPE' AND status='FAILED' AND created_at >= now() - interval '24 hours') AS fipe_provider_failures_24h,
    (SELECT max(created_at) FROM provider_health_events WHERE source_type='FIPE' AND status='SUCCESS') AS fipe_provider_last_success,
    (SELECT coalesce(round(100.0 * (SELECT count(*) FROM funnel_events WHERE event_type='FREE_QUERY_SAVED') / nullif((SELECT count(*) FROM funnel_events WHERE event_type='FREE_QUERY_COMPLETED'),0),2),0)) AS fipe_save_rate_pct`);
  const daily = await pool.query(`WITH days AS (
    SELECT generate_series(current_date - interval '29 days', current_date, interval '1 day')::date AS day
  ), q AS (
    SELECT created_at::date AS day, count(*)::int AS queries, count(*) FILTER (WHERE status='SUCCESS')::int AS successful_queries
    FROM vehicle_queries WHERE created_at >= current_date - interval '29 days' GROUP BY created_at::date
  ), p AS (
    SELECT paid_at::date AS day, count(*)::int AS sales, coalesce(sum(amount_cents),0)::int AS revenue_cents
    FROM payments WHERE status='PAID' AND paid_at >= current_date - interval '29 days' GROUP BY paid_at::date
  ), u AS (
    SELECT created_at::date AS day, count(*)::int AS users FROM users WHERE created_at >= current_date - interval '29 days' GROUP BY created_at::date
  )
  SELECT to_char(days.day,'YYYY-MM-DD') AS date, coalesce(q.queries,0) AS queries, coalesce(q.successful_queries,0) AS successful_queries,
    coalesce(p.sales,0) AS sales, coalesce(p.revenue_cents,0) AS revenue_cents, coalesce(u.users,0) AS users
  FROM days LEFT JOIN q USING(day) LEFT JOIN p USING(day) LEFT JOIN u USING(day) ORDER BY days.day`);
  res.json({ ...summary.rows[0], daily: daily.rows });
}));

api.get('/admin/overview/series', auth, requirePermission('VIEW_AUDIT'), asyncRoute(async (_req, res) => {
  const daily = await pool.query(`WITH days AS (
    SELECT generate_series(current_date - interval '29 days', current_date, interval '1 day')::date AS day
  ), q AS (
    SELECT created_at::date AS day, count(*)::int AS queries, count(*) FILTER (WHERE status='SUCCESS')::int AS successful_queries
    FROM vehicle_queries WHERE created_at >= current_date - interval '29 days' GROUP BY created_at::date
  ), p AS (
    SELECT paid_at::date AS day, count(*)::int AS sales, coalesce(sum(amount_cents),0)::int AS revenue_cents
    FROM payments WHERE status='PAID' AND paid_at >= current_date - interval '29 days' GROUP BY paid_at::date
  ), u AS (
    SELECT created_at::date AS day, count(*)::int AS users FROM users WHERE created_at >= current_date - interval '29 days' GROUP BY created_at::date
  )
  SELECT to_char(days.day,'YYYY-MM-DD') AS date, coalesce(q.queries,0) AS queries, coalesce(q.successful_queries,0) AS successful_queries,
    coalesce(p.sales,0) AS sales, coalesce(p.revenue_cents,0) AS revenue_cents, coalesce(u.users,0) AS users
  FROM days LEFT JOIN q USING(day) LEFT JOIN p USING(day) LEFT JOIN u USING(day) ORDER BY days.day`);
  res.json({ daily: daily.rows });
}));

api.get('/admin/settings', auth, requirePermission('VIEW_AUDIT'), asyncRoute(async (_req, res) => {
  const value = await safeBusinessSettings();
  res.json({
    environment: {
      appName: env.APP_NAME,
      appUrl: env.APP_URL,
      webOrigin: env.WEB_ORIGIN,
      nodeEnv: env.NODE_ENV,
      paymentProvider: env.PAYMENT_PROVIDER,
      dataProvider: env.DATA_PROVIDER,
      featureFreeFipe: env.FEATURE_FREE_FIPE,
      featureReportPdf: env.FEATURE_REPORT_PDF,
      queryCacheEnabled: env.QUERY_CACHE_ENABLED,
      queryCacheTtlSeconds: env.QUERY_CACHE_TTL_SECONDS,
      queryRequestTimeoutMs: env.QUERY_REQUEST_TIMEOUT_MS,
      rateLimitEnabled: env.RATE_LIMIT_ENABLED,
      auditLogEnabled: env.AUDIT_LOG_ENABLED,
      logLevel: env.LOG_LEVEL
    },
    configured: {
      payment: Boolean(env.PAYMENT_API_KEY),
      vehicleProvider: Boolean(env.VEHICLE_API_BASE_URL),
      email: isEmailConfigured(),
      fipe: Boolean(env.FIPE_PRIMARY_BASE_URL)
    },
    safe: {
      siteTagline: typeof value.siteTagline === 'string' ? value.siteTagline : 'Consulta zero para orientar o valor. Consulta completa para aprofundar a decisão.',
      supportEmail: typeof value.supportEmail === 'string' ? value.supportEmail : null,
      maintenanceNotice: typeof value.maintenanceNotice === 'string' ? value.maintenanceNotice : null,
      defaultAffiliateRateBps: typeof value.defaultAffiliateRateBps === 'number' ? value.defaultAffiliateRateBps : 1000,
      fipeGuestDailyLimit: typeof value.fipeGuestDailyLimit === 'number' ? value.fipeGuestDailyLimit : env.FIPE_GUEST_DAILY_LIMIT
    }
  });
}));

api.patch('/admin/settings', auth, requirePermission('MANAGE_PROVIDERS'), asyncRoute(async (req, res) => {
  const parsed = safeSettingsSchema.safeParse(req.body);
  if (!parsed.success) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const current = await safeBusinessSettings();
  const next = { ...current, ...parsed.data };
  await pool.query(`INSERT INTO platform_settings(key,value,updated_by,updated_at) VALUES('safe_business',$1::jsonb,$2,now())
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now()`, [JSON.stringify(next), req.user!.id]);
  await audit(req.user!.id, 'UPDATE_SAFE_SETTINGS', 'PLATFORM_SETTINGS', 'safe_business', { keys: Object.keys(parsed.data), requestId: requestId(req) });
  res.json({ safe: next });
}));

api.get('/admin/coupons', auth, requirePermission('MANAGE_BILLING'), asyncRoute(async (_req, res) => {
  const result = await pool.query(`SELECT id,code,discount_type,discount_value,max_redemptions,redeemed_count,starts_at,expires_at,active,created_at
    FROM coupons ORDER BY created_at DESC`);
  res.json(result.rows.map((row) => ({ id: row.id, code: row.code, discountType: row.discount_type, discountValue: Number(row.discount_value), maxRedemptions: row.max_redemptions === null ? null : Number(row.max_redemptions), redeemedCount: Number(row.redeemed_count), startsAt: row.starts_at, expiresAt: row.expires_at, active: row.active, createdAt: row.created_at })));
}));

api.post('/admin/coupons', auth, requirePermission('MANAGE_BILLING'), asyncRoute(async (req, res) => {
  const parsed = couponCreateSchema.safeParse(req.body);
  if (!parsed.success) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const code = parsed.data.code.toUpperCase();
  const result = await pool.query(`INSERT INTO coupons(code,discount_type,discount_value,max_redemptions,starts_at,expires_at,active,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,code,discount_type,discount_value,max_redemptions,redeemed_count,starts_at,expires_at,active,created_at`, [code, parsed.data.discountType, parsed.data.discountValue, parsed.data.maxRedemptions ?? null, parsed.data.startsAt ?? null, parsed.data.expiresAt ?? null, parsed.data.active, req.user!.id]);
  await audit(req.user!.id, 'CREATE_COUPON', 'COUPON', result.rows[0].id, { code, requestId: requestId(req) });
  res.status(201).json(result.rows[0]);
}));

api.patch('/admin/coupons/:id', auth, requirePermission('MANAGE_BILLING'), asyncRoute(async (req, res) => {
  const parsed = couponUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const fields = Object.entries(parsed.data).filter(([, value]) => value !== undefined);
  if (!fields.length) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const values: unknown[] = []; const assignments: string[] = [];
  for (const [key, value] of fields) {
    const column = key === 'discountType' ? 'discount_type' : key === 'discountValue' ? 'discount_value' : key === 'maxRedemptions' ? 'max_redemptions' : key === 'startsAt' ? 'starts_at' : key === 'expiresAt' ? 'expires_at' : key;
    values.push(key === 'code' ? String(value).toUpperCase() : value ?? null); assignments.push(`${column}=$${values.length}`);
  }
  values.push(req.params.id);
  const result = await pool.query(`UPDATE coupons SET ${assignments.join(',')},updated_at=now() WHERE id=$${values.length} RETURNING id,code,discount_type,discount_value,max_redemptions,redeemed_count,starts_at,expires_at,active,created_at`, values);
  if (!result.rowCount) throw appError('COUPON_NOT_FOUND', { code: 'COUPON_NOT_FOUND', http: 404, expose: true });
  await audit(req.user!.id, 'UPDATE_COUPON', 'COUPON', String(req.params.id), { requestId: requestId(req) });
  res.json(result.rows[0]);
}));

api.delete('/admin/coupons/:id', auth, requirePermission('MANAGE_BILLING'), asyncRoute(async (req, res) => {
  const result = await pool.query(`UPDATE coupons SET active=false,updated_at=now() WHERE id=$1 RETURNING id`, [req.params.id]);
  if (!result.rowCount) throw appError('COUPON_NOT_FOUND', { code: 'COUPON_NOT_FOUND', http: 404, expose: true });
  await audit(req.user!.id, 'DELETE_COUPON', 'COUPON', String(req.params.id), { requestId: requestId(req) });
  res.status(204).end();
}));

api.get('/admin/affiliates', auth, requirePermission('MANAGE_BILLING'), asyncRoute(async (_req, res) => {
  const result = await pool.query(`SELECT a.id,a.name,a.email,a.code,a.commission_bps,a.active,a.created_at,
    count(ac.id)::int AS commissions_count, coalesce(sum(ac.amount_cents) FILTER (WHERE ac.status='PENDING'),0)::int AS pending_cents
    FROM affiliates a LEFT JOIN affiliate_commissions ac ON ac.affiliate_id=a.id GROUP BY a.id ORDER BY a.created_at DESC`);
  res.json(result.rows.map((row) => ({ id: row.id, name: row.name, email: row.email, code: row.code, commissionBps: Number(row.commission_bps), active: row.active, commissionsCount: Number(row.commissions_count), pendingCents: Number(row.pending_cents), createdAt: row.created_at })));
}));

api.post('/admin/affiliates', auth, requirePermission('MANAGE_BILLING'), asyncRoute(async (req, res) => {
  const parsed = affiliateCreateSchema.safeParse(req.body);
  if (!parsed.success) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const result = await pool.query(`INSERT INTO affiliates(name,email,code,commission_bps,active) VALUES($1,$2,$3,$4,$5)
    RETURNING id,name,email,code,commission_bps,active,created_at`, [parsed.data.name, parsed.data.email ?? null, parsed.data.code.toUpperCase(), parsed.data.commissionBps, parsed.data.active]);
  await audit(req.user!.id, 'CREATE_AFFILIATE', 'AFFILIATE', result.rows[0].id, { requestId: requestId(req) });
  res.status(201).json(result.rows[0]);
}));

api.patch('/admin/affiliates/:id', auth, requirePermission('MANAGE_BILLING'), asyncRoute(async (req, res) => {
  const parsed = affiliateUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const fields = Object.entries(parsed.data).filter(([, value]) => value !== undefined);
  if (!fields.length) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const values: unknown[] = []; const assignments: string[] = [];
  for (const [key, value] of fields) {
    const column = key === 'commissionBps' ? 'commission_bps' : key;
    values.push(key === 'code' ? String(value).toUpperCase() : value ?? null); assignments.push(`${column}=$${values.length}`);
  }
  values.push(req.params.id);
  const result = await pool.query(`UPDATE affiliates SET ${assignments.join(',')},updated_at=now() WHERE id=$${values.length} RETURNING id,name,email,code,commission_bps,active,created_at`, values);
  if (!result.rowCount) throw appError('AFFILIATE_NOT_FOUND', { code: 'AFFILIATE_NOT_FOUND', http: 404, expose: true });
  await audit(req.user!.id, 'UPDATE_AFFILIATE', 'AFFILIATE', String(req.params.id), { requestId: requestId(req) });
  res.json(result.rows[0]);
}));

api.get('/admin/organizations', auth, requirePermission('ADMIN_SYSTEM'), asyncRoute(async (_req, res) => {
  const result = await pool.query(`SELECT id,name,document,active,slug,primary_color,accent_color,logo_url,custom_domain,settings,created_at
    FROM organizations ORDER BY created_at DESC`);
  res.json(result.rows.map((row) => ({ id: row.id, name: row.name, document: row.document, active: row.active, slug: row.slug, primaryColor: row.primary_color, accentColor: row.accent_color, logoUrl: row.logo_url, customDomain: row.custom_domain, settings: row.settings ?? {}, createdAt: row.created_at })));
}));

api.post('/admin/organizations', auth, requirePermission('ADMIN_SYSTEM'), asyncRoute(async (req, res) => {
  const parsed = organizationBrandingSchema.extend({ name: z.string().min(2), document: z.string().max(30).optional(), active: z.boolean().default(true) }).safeParse(req.body);
  if (!parsed.success) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const result = await pool.query(`INSERT INTO organizations(name,document,active,slug,primary_color,accent_color,logo_url,custom_domain,settings)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING id,name,document,active,slug,primary_color,accent_color,logo_url,custom_domain,settings,created_at`, [parsed.data.name, parsed.data.document ?? null, parsed.data.active, parsed.data.slug ?? null, parsed.data.primaryColor ?? null, parsed.data.accentColor ?? null, parsed.data.logoUrl ?? null, parsed.data.customDomain ?? null, JSON.stringify(parsed.data.settings ?? {})]);
  await audit(req.user!.id, 'CREATE_ORGANIZATION', 'ORGANIZATION', result.rows[0].id, { requestId: requestId(req) });
  res.status(201).json(result.rows[0]);
}));

api.patch('/admin/organizations/:id', auth, requirePermission('ADMIN_SYSTEM'), asyncRoute(async (req, res) => {
  const parsed = organizationBrandingSchema.partial().safeParse(req.body);
  if (!parsed.success) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const fields = Object.entries(parsed.data).filter(([, value]) => value !== undefined);
  if (!fields.length) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const values: unknown[] = []; const assignments: string[] = [];
  for (const [key, value] of fields) {
    const column = key === 'primaryColor' ? 'primary_color' : key === 'accentColor' ? 'accent_color' : key === 'logoUrl' ? 'logo_url' : key === 'customDomain' ? 'custom_domain' : key;
    values.push(key === 'settings' ? JSON.stringify(value ?? {}) : value ?? null); assignments.push(`${column}=${key === 'settings' ? `$${values.length}::jsonb` : `$${values.length}`}`);
  }
  values.push(req.params.id);
  const result = await pool.query(`UPDATE organizations SET ${assignments.join(',')} WHERE id=$${values.length} RETURNING id,name,document,active,slug,primary_color,accent_color,logo_url,custom_domain,settings,created_at`, values);
  if (!result.rowCount) throw appError('ORGANIZATION_NOT_FOUND', { code: 'ORGANIZATION_NOT_FOUND', http: 404, expose: true });
  await audit(req.user!.id, 'UPDATE_ORGANIZATION_BRANDING', 'ORGANIZATION', String(req.params.id), { requestId: requestId(req) });
  res.json(result.rows[0]);
}));

api.get('/affiliate/me', auth, asyncRoute(async (req, res) => {
  const result = await pool.query(`SELECT id,name,email,code,commission_bps,active,created_at FROM affiliates WHERE user_id=$1`, [req.user!.id]);
  if (!result.rowCount) { res.json({ affiliate: null }); return; }
  const row = result.rows[0];
  res.json({ affiliate: { id: row.id, name: row.name, email: row.email, code: row.code, commissionBps: Number(row.commission_bps), active: row.active, createdAt: row.created_at } });
}));

api.post('/affiliate/activate', auth, asyncRoute(async (req, res) => {
  const parsed = affiliateActivationSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const existing = await pool.query('SELECT id,name,email,code,commission_bps,active,created_at FROM affiliates WHERE user_id=$1', [req.user!.id]);
  if (existing.rowCount) { res.json({ affiliate: existing.rows[0] }); return; }
  const account = await pool.query('SELECT name,email FROM users WHERE id=$1 AND active=true', [req.user!.id]);
  if (!account.rowCount) throw appError('ACCOUNT_NOT_FOUND', { code: 'ACCOUNT_NOT_FOUND', http: 404, expose: true });
  const safeBusiness = await safeBusinessSettings();
  const configuredRate = safeBusiness.defaultAffiliateRateBps;
  const commissionBps = typeof configuredRate === 'number' && Number.isInteger(configuredRate) && configuredRate >= 0 && configuredRate <= 5000 ? configuredRate : 1000;
  const defaultCode = `BUSCARR-${randomBytes(5).toString('hex').toUpperCase()}`;
  const code = (parsed.data.code ?? defaultCode).toUpperCase();
  const result = await pool.query(`INSERT INTO affiliates(user_id,name,email,code,commission_bps,active) VALUES($1,$2,$3,$4,$5,true)
    RETURNING id,name,email,code,commission_bps,active,created_at`, [req.user!.id, account.rows[0].name, account.rows[0].email, code, commissionBps]);
  await audit(req.user!.id, 'ACTIVATE_AFFILIATE', 'AFFILIATE', result.rows[0].id, { requestId: requestId(req) });
  res.status(201).json({ affiliate: result.rows[0] });
}));

api.get('/affiliate/link', auth, asyncRoute(async (req, res) => {
  const result = await pool.query('SELECT code,active FROM affiliates WHERE user_id=$1', [req.user!.id]);
  if (!result.rowCount || !result.rows[0].active) throw appError('AFFILIATE_NOT_ACTIVE', { code: 'AFFILIATE_NOT_ACTIVE', http: 404, expose: true });
  const link = new URL('/?ref=' + encodeURIComponent(String(result.rows[0].code)), env.APP_URL).toString();
  res.json({ code: result.rows[0].code, link });
}));

api.get('/affiliate/stats', auth, asyncRoute(async (req, res) => {
  const affiliate = await pool.query('SELECT id,code FROM affiliates WHERE user_id=$1', [req.user!.id]);
  if (!affiliate.rowCount) { res.json({ affiliate: null, totals: { pendingCents: 0, paidCents: 0, commissions: 0 } }); return; }
  const totals = await pool.query(`SELECT count(*)::int AS commissions,
      coalesce(sum(amount_cents) FILTER (WHERE status='PENDING'),0)::int AS pending_cents,
      coalesce(sum(amount_cents) FILTER (WHERE status='PAID'),0)::int AS paid_cents,
      (SELECT count(*)::int FROM users WHERE affiliate_id=$1) AS referred_users
    FROM affiliate_commissions WHERE affiliate_id=$1`, [affiliate.rows[0].id]);
  const code = String(affiliate.rows[0].code);
  const shareUrl = new URL('/?ref=' + encodeURIComponent(code), env.APP_URL).toString();
  res.json({ affiliate: { id: affiliate.rows[0].id, code }, shareUrl, totals: { commissions: Number(totals.rows[0].commissions), pendingCents: Number(totals.rows[0].pending_cents), paidCents: Number(totals.rows[0].paid_cents), referredUsers: Number(totals.rows[0].referred_users) } });
}));

api.get('/admin/affiliate-commissions', auth, requirePermission('MANAGE_BILLING'), asyncRoute(async (_req, res) => {
  const result = await pool.query(`SELECT c.id,c.amount_cents,c.status,c.created_at,c.paid_at,a.name AS affiliate_name,a.code,p.external_reference
    FROM affiliate_commissions c JOIN affiliates a ON a.id=c.affiliate_id LEFT JOIN payment_orders p ON p.id=c.order_id
    ORDER BY c.created_at DESC LIMIT 200`);
  res.json(result.rows.map((row) => ({ id: row.id, amountCents: Number(row.amount_cents), status: row.status, createdAt: row.created_at, paidAt: row.paid_at, affiliate: { name: row.affiliate_name, code: row.code }, externalReference: row.external_reference })));
}));

api.patch('/admin/affiliate-commissions/:id', auth, requirePermission('MANAGE_BILLING'), asyncRoute(async (req, res) => {
  const parsed = z.object({ status: z.enum(['PAID', 'CANCELLED']) }).safeParse(req.body);
  if (!parsed.success) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const result = await pool.query(`UPDATE affiliate_commissions SET status=$2,paid_at=CASE WHEN $2='PAID' THEN now() ELSE paid_at END
    WHERE id=$1 AND status='PENDING' RETURNING id,amount_cents,status,paid_at`, [req.params.id, parsed.data.status]);
  if (!result.rowCount) throw appError('COMMISSION_NOT_FOUND_OR_CLOSED', { code: 'COMMISSION_NOT_FOUND_OR_CLOSED', http: 404, expose: true });
  await audit(req.user!.id, 'UPDATE_AFFILIATE_COMMISSION', 'AFFILIATE_COMMISSION', String(req.params.id), { status: parsed.data.status, requestId: requestId(req) });
  res.json({ id: result.rows[0].id, amountCents: Number(result.rows[0].amount_cents), status: result.rows[0].status, paidAt: result.rows[0].paid_at });
}));

api.get('/admin/organizations/:id/members', auth, requirePermission('ADMIN_SYSTEM'), asyncRoute(async (req, res) => {
  const result = await pool.query(`SELECT m.organization_id,m.user_id,m.role,u.name,u.email,u.active
    FROM organization_members m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 ORDER BY u.name`, [req.params.id]);
  res.json(result.rows.map((row) => ({ organizationId: row.organization_id, userId: row.user_id, role: row.role, name: row.name, email: row.email, active: row.active })));
}));

api.post('/admin/organizations/:id/members', auth, requirePermission('ADMIN_SYSTEM'), asyncRoute(async (req, res) => {
  const parsed = organizationMemberSchema.safeParse(req.body);
  if (!parsed.success) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const result = await pool.query(`INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,$3)
    ON CONFLICT(organization_id,user_id) DO UPDATE SET role=EXCLUDED.role RETURNING organization_id,user_id,role`, [req.params.id, parsed.data.userId, parsed.data.role]);
  await audit(req.user!.id, 'UPSERT_ORGANIZATION_MEMBER', 'ORGANIZATION', String(req.params.id), { memberId: parsed.data.userId, role: parsed.data.role, requestId: requestId(req) });
  res.status(201).json(result.rows[0]);
}));

api.delete('/admin/organizations/:id/members/:userId', auth, requirePermission('ADMIN_SYSTEM'), asyncRoute(async (req, res) => {
  await pool.query('DELETE FROM organization_members WHERE organization_id=$1 AND user_id=$2', [req.params.id, req.params.userId]);
  await audit(req.user!.id, 'REMOVE_ORGANIZATION_MEMBER', 'ORGANIZATION', String(req.params.id), { memberId: req.params.userId, requestId: requestId(req) });
  res.status(204).end();
}));

api.get('/organization/context', auth, asyncRoute(async (req, res) => {
  const result = await pool.query(`SELECT o.id,o.name,o.slug,o.primary_color,o.accent_color,o.logo_url,o.custom_domain,o.settings,m.role
    FROM organization_members m JOIN organizations o ON o.id=m.organization_id
    WHERE m.user_id=$1 AND o.active=true ORDER BY o.created_at LIMIT 1`, [req.user!.id]);
  if (!result.rowCount) { res.json({ organization: null }); return; }
  const row = result.rows[0];
  res.json({ organization: { id: row.id, name: row.name, slug: row.slug, primaryColor: row.primary_color, accentColor: row.accent_color, logoUrl: row.logo_url, customDomain: row.custom_domain, settings: row.settings ?? {}, role: row.role } });
}));

api.get('/admin/queries', auth, requirePermission('VIEW_AUDIT'), asyncRoute(async (_req, res) => {
  const queries = await pool.query(`SELECT q.id,q.plate,q.status,q.credits_cost,q.provider,q.created_at,q.completed_at,q.error_code,
      p.name AS product_name,u.name AS customer_name,u.email AS customer_email
    FROM vehicle_queries q
    JOIN users u ON u.id=q.user_id
    JOIN query_products p ON p.id=q.product_id
    ORDER BY q.created_at DESC LIMIT 200`);
  res.json(queries.rows.map((row) => ({
    id: row.id,
    plate: row.plate,
    status: row.status,
    creditsCost: Number(row.credits_cost),
    provider: row.provider,
    productName: row.product_name,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    errorCode: row.error_code,
    customer: { name: row.customer_name, email: row.customer_email }
  })));
}));

api.post('/admin/lookups', auth, requirePermission('VIEW_SENSITIVE_DATA'), asyncRoute(async (req, res) => {
  const parsed = z.object({ plate: plateSchema, productId: z.string().trim().min(1).max(80) }).safeParse(req.body);
  if (!parsed.success) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const product = await pool.query('SELECT id,name FROM query_products WHERE id=$1 AND active=true', [parsed.data.productId]);
  if (!product.rowCount) throw appError('PRODUCT_NOT_FOUND', { code: 'PRODUCT_NOT_FOUND', http: 404, expose: true });
  const provider = getProvider();
  try {
    const output = await performAdminLookup({ provider, plate: parsed.data.plate, productId: parsed.data.productId, productName: product.rows[0].name, timeoutMs: env.QUERY_REQUEST_TIMEOUT_MS, normalize: normalizeBdrp });
    await audit(req.user!.id, 'ADMIN_LOOKUP', 'VEHICLE_QUERY', null, { plate: parsed.data.plate, productId: parsed.data.productId, provider: provider.name, status: 'SUCCESS', requestId: requestId(req) });
    res.status(200).json({ ...output, result: { ...output.result, diagnostic: diagnostic(output.result) } });
  } catch (error) {
    const errorCode = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'PROVIDER_ERROR';
    await audit(req.user!.id, 'ADMIN_LOOKUP', 'VEHICLE_QUERY', null, { plate: parsed.data.plate, productId: parsed.data.productId, provider: provider.name, status: 'FAILED', errorCode, requestId: requestId(req) });
    throw error;
  }
}));

api.get('/admin/products', auth, requirePermission('MANAGE_PRICING'), asyncRoute(async (_req, res) => {
  const products = await pool.query(`SELECT id,name,description,credit_cost,active,slug,features,is_free,commercial_status,featured
    FROM query_products ORDER BY display_order,credit_cost`);
  res.json(products.rows.map((product) => ({ id: product.id, name: product.name, description: product.description, creditCost: Number(product.credit_cost), active: Boolean(product.active), slug: product.slug, features: product.features, isFree: Boolean(product.is_free), commercialStatus: product.commercial_status, featured: Boolean(product.featured) })));
}));

api.patch('/admin/products/:id', auth, requirePermission('MANAGE_PRICING'), asyncRoute(async (req, res) => {
  const parsed = productUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const values: unknown[] = [];
  const assignments: string[] = [];
  if (parsed.data.name !== undefined) { values.push(parsed.data.name); assignments.push(`name=$${values.length}`); }
  if (parsed.data.description !== undefined) { values.push(parsed.data.description); assignments.push(`description=$${values.length}`); }
  if (parsed.data.creditCost !== undefined) { values.push(parsed.data.creditCost); assignments.push(`credit_cost=$${values.length}`); }
  if (parsed.data.active !== undefined) { values.push(parsed.data.active); assignments.push(`active=$${values.length}`); }
  assignments.push('updated_at=now()');
  values.push(req.params.id);
  const product = await pool.query(`UPDATE query_products SET ${assignments.join(', ')} WHERE id=$${values.length} RETURNING id,name,description,credit_cost,active`, values);
  if (!product.rowCount) throw appError('PRODUCT_NOT_FOUND', { code: 'PRODUCT_NOT_FOUND', http: 404, expose: true });
  await audit(req.user!.id, 'UPDATE_QUERY_PRODUCT', 'QUERY_PRODUCT', String(req.params.id), { fields: Object.keys(parsed.data), requestId: requestId(req) });
  const row = product.rows[0];
  res.json({ id: row.id, name: row.name, description: row.description, creditCost: Number(row.credit_cost), active: Boolean(row.active) });
}));

api.get('/admin/users', auth, requirePermission('MANAGE_USERS'), asyncRoute(async (_req, res) => {
  const users = await pool.query(`SELECT u.id,u.name,u.email,u.role,u.active,u.created_at,u.last_login_at,
    coalesce(w.balance,0) AS balance,
    (SELECT count(*) FROM vehicle_queries q WHERE q.user_id=u.id) AS queries_count
    FROM users u LEFT JOIN wallets w ON w.user_id=u.id
    WHERE u.deleted_at IS NULL ORDER BY u.created_at DESC LIMIT 200`);
  res.json(users.rows.map((row) => ({ id: row.id, name: row.name, email: row.email, role: row.role, active: row.active, createdAt: row.created_at, lastLoginAt: row.last_login_at, balance: Number(row.balance), queriesCount: Number(row.queries_count) })));
}));

api.patch('/admin/users/:id', auth, requirePermission('MANAGE_USERS'), asyncRoute(async (req, res) => {
  const parsed = adminUserUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  if (String(req.params.id) === req.user!.id) throw appError('ADMIN_SELF_CHANGE_FORBIDDEN', { code: 'ADMIN_SELF_CHANGE_FORBIDDEN', http: 409, expose: true });
  if (parsed.data.role === 'ADMIN' && !hasPermission(req.user!.role, 'ADMIN_SYSTEM')) throw appError('FORBIDDEN', { code: 'FORBIDDEN', http: 403, expose: true });
  const target = await pool.query('SELECT id,role FROM users WHERE id=$1 AND deleted_at IS NULL', [req.params.id]);
  if (!target.rowCount) throw appError('USER_NOT_FOUND', { code: 'USER_NOT_FOUND', http: 404, expose: true });
  if (target.rows[0].role === 'SUPER_ADMIN' && !hasPermission(req.user!.role, 'ADMIN_SYSTEM')) throw appError('FORBIDDEN', { code: 'FORBIDDEN', http: 403, expose: true });
  const assignments: string[] = []; const values: unknown[] = [];
  if (parsed.data.active !== undefined) { values.push(parsed.data.active); assignments.push(`active=$${values.length}`); }
  if (parsed.data.role !== undefined) { values.push(parsed.data.role); assignments.push(`role=$${values.length}`); }
  values.push(req.params.id);
  const updated = await pool.query(`UPDATE users SET ${assignments.join(', ')} WHERE id=$${values.length} RETURNING id,name,email,role,active`, values);
  await audit(req.user!.id, 'ADMIN_UPDATE_USER', 'USER', String(req.params.id), { fields: Object.keys(parsed.data), requestId: requestId(req) });
  res.json(updated.rows[0]);
}));

api.delete('/admin/users/:id', auth, requirePermission('ADMIN_SYSTEM'), asyncRoute(async (req, res) => {
  if (String(req.params.id) === req.user!.id) {
    throw appError('ADMIN_SELF_DELETION_FORBIDDEN', { code: 'ADMIN_SELF_DELETION_FORBIDDEN', http: 409, expose: true });
  }
  const removed = await tx(async (client) => {
    const target = await client.query('SELECT id,name,email,role FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [req.params.id]);
    if (!target.rowCount) throw appError('USER_NOT_FOUND', { code: 'USER_NOT_FOUND', http: 404, expose: true });
    await client.query('UPDATE users SET active=false,deleted_at=now() WHERE id=$1', [req.params.id]);
    await client.query('UPDATE user_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [req.params.id]);
    return target.rows[0] as { id: string; email: string; role: string };
  });
  await audit(req.user!.id, 'ADMIN_SOFT_DELETE_USER', 'USER', removed.id, { targetEmail: removed.email, targetRole: removed.role, requestId: requestId(req) });
  res.status(204).end();
}));

api.post('/admin/users/:id/wallet-adjustments', auth, requirePermission('MANAGE_BILLING'), asyncRoute(async (req, res) => {
  const parsed = adminWalletAdjustmentSchema.safeParse(req.body);
  if (!parsed.success) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const result = await tx(async (client) => {
    const user = await client.query('SELECT id FROM users WHERE id=$1 AND active=true AND deleted_at IS NULL', [req.params.id]);
    if (!user.rowCount) throw appError('USER_NOT_FOUND', { code: 'USER_NOT_FOUND', http: 404, expose: true });
    const wallet = await client.query('SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE', [req.params.id]);
    const before = Number(wallet.rows[0]?.balance ?? 0); const after = before + parsed.data.amount;
    if (after < 0) throw appError('WALLET_BALANCE_INVALID', { code: 'WALLET_BALANCE_INVALID', http: 409, expose: true });
    await client.query('INSERT INTO wallets(user_id,balance) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET balance=EXCLUDED.balance,updated_at=now()', [req.params.id, after]);
    const transaction = await client.query(`INSERT INTO wallet_transactions(user_id,kind,amount,balance_before,balance_after,description,metadata)
      VALUES($1,'ADMIN_ADJUSTMENT',$2,$3,$4,$5,$6::jsonb) RETURNING id`, [req.params.id, parsed.data.amount, before, after, parsed.data.description, JSON.stringify({ adminId: req.user!.id, requestId: requestId(req) })]);
    return { transactionId: transaction.rows[0].id, balanceBefore: before, balanceAfter: after, balance: after };
  });
  await audit(req.user!.id, 'ADMIN_WALLET_ADJUSTMENT', 'WALLET', String(req.params.id), { amount: parsed.data.amount, requestId: requestId(req) });
  res.status(201).json(result);
}));

api.get('/admin/payments', auth, requirePermission('MANAGE_BILLING'), asyncRoute(async (_req, res) => {
  const payments = await pool.query(`SELECT p.id,p.status,p.amount_cents,p.credits,p.provider,p.external_id,p.created_at,p.paid_at,u.name,u.email
    FROM payments p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 200`);
  res.json(payments.rows.map((row) => ({ id: row.id, status: row.status, amountCents: Number(row.amount_cents), credits: Number(row.credits), provider: row.provider, externalId: row.external_id, createdAt: row.created_at, paidAt: row.paid_at, customer: { name: row.name, email: row.email } })));
}));

api.get('/admin/audit', auth, requirePermission('VIEW_AUDIT'), asyncRoute(async (_req, res) => {
  const entries = await pool.query(`SELECT a.id,a.action,a.entity,a.entity_id,a.created_at,u.name AS actor_name,u.email AS actor_email
    FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 200`);
  res.json(entries.rows.map((row) => ({ id: row.id, action: row.action, entity: row.entity, entityId: row.entity_id, createdAt: row.created_at, actor: row.actor_name ? { name: row.actor_name, email: row.actor_email } : null })));
}));

api.get('/admin/permissions', auth, requirePermission('ADMIN_SYSTEM'), (req, res) => {
  res.json({ role: req.user!.role, permissions: permissionsFor(req.user!.role), canManagePricing: hasPermission(req.user!.role, 'MANAGE_PRICING') });
});

app.use('/api', api);
app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  const known = error as AppError;
  const status = known.http ?? 500;
  const code = known.code ?? 'INTERNAL_ERROR';
  log('error', 'request_failed', { requestId: requestId(req), path: req.path, method: req.method, status, code, message: error instanceof Error ? error.message : 'Unknown error' });
  res.status(status).json({ error: code, message: known.expose ? humanMessage(code) : 'Não foi possível concluir esta operação agora. Tente novamente.' });
});

function parseOAuthProvider(value: string): OAuthProvider {
  if (value === 'google' || value === 'microsoft' || value === 'apple') return value;
  throw appError('OAUTH_PROVIDER_UNSUPPORTED', { code: 'OAUTH_PROVIDER_UNSUPPORTED', http: 404, expose: true });
}

function hashIp(ip: string | undefined): string | null {
  if (!ip) return null;
  return crypto.createHash('sha256').update(`${env.JWT_SECRET}:${ip}`).digest('hex');
}

function humanMessage(code: string): string {
  const messages: Record<string, string> = {
    INVALID_INPUT: 'Revise os dados informados e tente novamente.',
    INVALID_PLATE: 'Informe uma placa válida no padrão brasileiro.',
    INVALID_CREDENTIALS: 'E-mail ou senha inválidos.',
    EMAIL_ALREADY_EXISTS: 'Já existe uma conta para este e-mail.',
    AUTH_REQUIRED: 'Entre na sua conta para continuar.',
    INVALID_TOKEN: 'Sua sessão expirou. Entre novamente para continuar.',
    FORBIDDEN: 'Sua conta não tem permissão para realizar esta ação.',
    PRODUCT_NOT_FOUND: 'Este produto de consulta não está disponível.',
    QUERY_NOT_FOUND: 'A consulta solicitada não foi encontrada.',
    QUERY_IN_PROGRESS: 'Já existe uma consulta em processamento para esta solicitação.',
    SANDBOX_DISABLED: 'A compra de créditos de teste não está disponível neste ambiente.',
    OAUTH_PROVIDER_UNSUPPORTED: 'Este provedor de acesso não é suportado.',
    OAUTH_PROVIDER_NOT_CONFIGURED: 'Este provedor de acesso ainda não foi configurado pela plataforma.',
    OAUTH_TICKET_INVALID: 'Esta solicitação de acesso expirou. Tente entrar novamente.',
    PASSWORD_RESET_UNAVAILABLE: 'A recuperação por e-mail está temporariamente indisponível porque o envio de e-mail ainda não foi configurado. Tente novamente mais tarde ou fale com o suporte.',
    USER_NOT_FOUND: 'O usuário solicitado não foi encontrado.',
    ADMIN_SELF_CHANGE_FORBIDDEN: 'Para segurança, use outro administrador para alterar o próprio acesso.',
    WALLET_BALANCE_INVALID: 'Este ajuste deixaria a carteira com saldo negativo.',
    CREDIT_PACKAGE_NOT_FOUND: 'O pacote de créditos solicitado não está disponível.',
    PAYMENT_PROVIDER_NOT_CONFIGURED: 'O checkout de pagamento ainda não foi configurado para este ambiente.',
    PAYMENT_PROVIDER_REQUEST_FAILED: 'Não foi possível abrir o checkout agora. Tente novamente em alguns instantes.',
    FIPE_FEATURE_DISABLED: 'A consulta FIPE gratuita está em ativação para este ambiente.',
    FIPE_PROVIDER_UNAVAILABLE: 'A consulta não respondeu de forma válida. Tente novamente em alguns instantes.',
    FIPE_NOT_FOUND: 'A combinação de veículo informada não foi encontrada na tabela vigente.',
    FIPE_REFERENCE_MISSING: 'A referência mensal da consulta não está disponível no momento.',
    FIPE_PLATE_DATA_INVALID: 'Não foi possível identificar os dados do veículo para esta placa.',
    FIPE_PLATE_NOT_FOUND: 'Não identificamos um veículo para esta placa. Confira os dados e tente novamente.',
    FIPE_PLATE_UNAVAILABLE: 'Não foi possível consultar os dados do veículo agora. Tente novamente em instantes.',
    FIPE_PLATE_VEHICLE_NOT_IDENTIFIED: 'Não encontramos a versão FIPE correspondente a esta placa.',
    FIPE_SELECTION_REQUIRED: 'Informe a placa ou selecione o veículo para consultar a FIPE.',
    FIPE_DAILY_LIMIT: 'O limite diário de consultas FIPE foi atingido. Tente novamente amanhã.',
    REPORT_NOT_FOUND: 'O relatório solicitado não foi encontrado ou não está disponível.',
    FIPE_INVALID_REPORT: 'O relatório FIPE não pôde ser validado.'
  };
  return messages[code] ?? 'Não foi possível concluir esta operação agora. Tente novamente.';
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(__dirname, '../../web/dist');
app.use(express.static(webDist, { index: false, maxAge: env.NODE_ENV === 'production' ? '1h' : 0, etag: true }));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path === '/health') return next();
  res.sendFile(path.join(webDist, 'index.html'));
});

app.listen(env.PORT, '0.0.0.0', () => log('info', 'server_started', { port: env.PORT, provider: env.DATA_PROVIDER, environment: env.NODE_ENV }));
