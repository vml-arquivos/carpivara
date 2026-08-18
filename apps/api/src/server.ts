import crypto from 'node:crypto';

import path from 'node:path';
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
import { pool, tx } from './db.js';
import { normalizeBdrp } from './normalizer.js';
import { hasPermission, permissionsFor, requirePermission } from './permissions.js';
import { getProvider } from './providers/index.js';
import { getFipeProvider, quoteWithFallback, type FipeCatalogProvider } from './providers/fipeProvider.js';
import { fipePdf, fipePrintHtml, makeFipeQuote, reportSnapshot } from './fipeReport.js';
import { createAsaasCheckout, eventReference, externalPaymentId, hasValidAsaasWebhookToken, isAsaasConfigured, type AsaasWebhookEvent } from './payments/asaas.js';
import { ensureSchema } from './schema.js';
import type { FipeQuote, FipeSelectionItem, FipeVehicleType, NormalizedVehicle } from './types.js';

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
  marketingOptIn: z.boolean().optional().default(false)
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
const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(10).max(128) });
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
const checkoutSchema = z.object({ packageSlug: z.string().trim().min(2).max(80) });

type AppError = Error & { code?: string; http?: number; expose?: boolean };
type FipeStoredResult = { __type: 'FIPE_QUOTE'; quote: FipeQuote };
type QueryRow = { id: string; status: string; credits_cost: number; normalized: NormalizedVehicle | FipeStoredResult | null };

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
  const result = isFipe
    ? { fipe: publicFipeQuote((normalized as FipeStoredResult).quote), blocks: (normalized as FipeStoredResult).quote.blocks, diagnostic: { level: 'CLEAR', title: 'Valor FIPE consultado', reason: 'A Tabela FIPE foi consultada; a situação documental não está incluída nesta modalidade.' } }
    : normalized ? { ...(normalized as NormalizedVehicle), diagnostic: diagnostic(normalized as NormalizedVehicle) } : null;
  return {
    id: row.id,
    plate: row.plate,
    productId: row.product_id,
    productName: row.product_name,
    status: row.status,
    creditsCost: row.credits_cost,
    createdAt: row.created_at,
    completedAt: row.completed_at,
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
app.use(express.json({ limit: '256kb', type: 'application/json' }));
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
      const user = await client.query('INSERT INTO users(email,password_hash,name,role) VALUES($1,$2,$3,$4) RETURNING id,email,name,role', [email, passwordHash, parsed.data.name, 'CLIENTE']);
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

api.post('/auth/change-password', auth, asyncRoute(async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const result = await pool.query('SELECT password_hash FROM users WHERE id=$1 AND active=true', [req.user!.id]);
  if (!result.rowCount || !(await bcrypt.compare(parsed.data.currentPassword, result.rows[0].password_hash))) {
    throw appError('INVALID_CREDENTIALS', { code: 'INVALID_CREDENTIALS', http: 401, expose: true });
  }
  await pool.query('UPDATE users SET password_hash=$2,password_enabled=true WHERE id=$1', [req.user!.id, await bcrypt.hash(parsed.data.newPassword, 12)]);
  await pool.query('UPDATE user_sessions SET revoked_at=now() WHERE user_id=$1 AND id <> $2 AND revoked_at IS NULL', [req.user!.id, req.sessionId ?? '']);
  await audit(req.user!.id, 'PASSWORD_CHANGED', 'USER', req.user!.id, { requestId: requestId(req) });
  res.status(204).end();
}));

api.get('/me', auth, asyncRoute(async (req, res) => {
  const [wallet, identities] = await Promise.all([
    pool.query('SELECT balance FROM wallets WHERE user_id=$1', [req.user!.id]),
    pool.query('SELECT provider FROM user_identities WHERE user_id=$1 ORDER BY provider', [req.user!.id])
  ]);
  res.json({ user: req.user, balance: wallet.rows[0]?.balance ?? 0, permissions: permissionsFor(req.user!.role), sandbox: env.DATA_PROVIDER === 'mock', identities: identities.rows.map((row) => row.provider) });
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

async function recordFunnelEvent(userId: string | null, req: Request, eventType: string, metadata: Record<string, unknown> = {}): Promise<void> {
  try {
    await pool.query('INSERT INTO funnel_events(user_id,session_key,event_type,metadata) VALUES($1,$2,$3,$4::jsonb)', [userId, hashIp(req.ip), eventType, JSON.stringify(metadata)]);
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
  const ranked = items.map((item) => ({ item, score: matchScore(item.name, target) })).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const threshold = kind === 'brand' ? 60 : kind === 'model' ? 42 : 50;
  if (!best || best.score < threshold) throw appError('FIPE_PLATE_VEHICLE_NOT_IDENTIFIED', { code: 'FIPE_PLATE_VEHICLE_NOT_IDENTIFIED', http: 422, expose: true });
  return best.item;
}

function inferFipeVehicleType(vehicle: NormalizedVehicle): FipeVehicleType {
  const text = normalizeMatchText([vehicle.characteristics.type, vehicle.characteristics.species, vehicle.characteristics.category].filter(Boolean).join(' '));
  if (/moto|motocic|ciclomotor|scooter/.test(text)) return 'motorcycles';
  if (/caminhao|caminh|onibus|trator|reboque|semirreboque/.test(text)) return 'trucks';
  return 'cars';
}

async function resolveFipeSelectionFromPlate(plate: string): Promise<{ provider: 'parallelum' | 'brasilapi'; vehicleType: FipeVehicleType; brand: FipeSelectionItem; model: FipeSelectionItem; year: FipeSelectionItem }> {
  let normalized: NormalizedVehicle;
  try {
    const vehicleProvider = getProvider();
    const output = await withTimeout(vehicleProvider.queryByPlate(plate), env.QUERY_REQUEST_TIMEOUT_MS);
    normalized = normalizeBdrp(output.raw);
  } catch (error) {
    const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : '';
    if (code === 'NOT_FOUND') throw appError('FIPE_PLATE_NOT_FOUND', { code: 'FIPE_PLATE_NOT_FOUND', http: 404, expose: true });
    if (code === 'PROVIDER_TIMEOUT') throw appError('FIPE_PLATE_UNAVAILABLE', { code: 'FIPE_PLATE_UNAVAILABLE', http: 502, expose: true });
    throw appError('FIPE_PLATE_DATA_INVALID', { code: 'FIPE_PLATE_DATA_INVALID', http: 422, expose: true });
  }
  const brandTarget = normalized.identification.brand ?? normalized.identification.fullModel?.split(/\s+/)[0] ?? '';
  const modelTarget = normalized.identification.model ?? normalized.identification.fullModel ?? '';
  const yearTarget = normalized.characteristics.modelYear ?? normalized.characteristics.manufactureYear ?? '';
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
      return { provider: providerName, vehicleType, brand, model, year };
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError instanceof Error && 'code' in lastError && typeof lastError.code === 'string' && lastError.code === 'FIPE_PLATE_VEHICLE_NOT_IDENTIFIED') throw lastError;
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
  const scopeKey = `ip:${hashIp(req.ip) ?? 'unknown'}`;
  await reserveFipeQuota(scopeKey, env.FIPE_GUEST_DAILY_LIMIT);
  let input: { vehicleType: FipeVehicleType; brand: FipeSelectionItem; model: FipeSelectionItem; year: FipeSelectionItem };
  let preferredProvider: 'parallelum' | 'brasilapi' = 'parallelum';
  try {
    if (parsed.data.vehicleType && parsed.data.brand && parsed.data.model && parsed.data.year) {
      input = { vehicleType: parsed.data.vehicleType, brand: parsed.data.brand, model: parsed.data.model, year: parsed.data.year };
    } else if (plate) {
      const resolved = await resolveFipeSelectionFromPlate(plate);
      input = { vehicleType: resolved.vehicleType, brand: resolved.brand, model: resolved.model, year: resolved.year };
      preferredProvider = resolved.provider;
    } else {
      throw appError('FIPE_SELECTION_REQUIRED', { code: 'FIPE_SELECTION_REQUIRED', http: 400, expose: true });
    }
    await recordFunnelEvent(null, req, 'FREE_QUERY_STARTED', { vehicleType: input.vehicleType, plateLookup: Boolean(plate) });
    const providerStartedAt = Date.now();
    const cached = preferredProvider === 'parallelum' ? await findCachedFipeResult(input) : null;
    const result = cached ?? await quoteWithFallback({ ...input, provider: preferredProvider });
    if (!cached) await cacheFipeResult(result);
    const quote = makeFipeQuote(result, plate);
    await recordProviderHealth(quote.provider, 'SUCCESS', Date.now() - providerStartedAt);
    await saveFipeDocument(quote);
    await recordFunnelEvent(null, req, 'FREE_QUERY_COMPLETED', { provider: quote.provider, documentCode: quote.documentCode, cached: Boolean(cached), plateLookup: Boolean(plate) });
    res.status(201).json(publicFipeQuote(quote));
  } catch (error) {
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
      VALUES($1,'SEM-PLACA','FIPE_FREE','SUCCESS',0,$2,$3::jsonb,now()) RETURNING id`, [req.user!.id, quote.provider, JSON.stringify({ documentCode: quote.documentCode, source: quote.source })]);
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
  res.type('application/pdf').send(fipePdf(quote));
}));

api.get('/fipe/reports/:code/print', auth, asyncRoute(async (req, res) => {
  if (!env.FEATURE_FREE_FIPE) throw fipeUnavailable();
  const document = await pool.query('SELECT snapshot FROM report_documents WHERE document_code=$1 AND report_kind=\'FIPE_FREE\'', [req.params.code]);
  if (!document.rowCount) throw appError('REPORT_NOT_FOUND', { code: 'REPORT_NOT_FOUND', http: 404, expose: true });
  const quote = snapshotQuote(document.rows[0] as Record<string, unknown>);
  await recordFunnelEvent(null, req, 'REPORT_PRINTED', { documentCode: quote.documentCode });
  res.type('html').send(fipePrintHtml(quote));
}));

api.get('/validar-relatorio/:code', asyncRoute(async (req, res) => {
  const document = await pool.query(`SELECT document_code,report_kind,report_version,provider,report_hash,snapshot,created_at,superseded_at
    FROM report_documents WHERE document_code=$1`, [req.params.code]);
  if (!document.rowCount) return res.status(404).json({ authentic: false, status: 'NOT_FOUND' });
  const row = document.rows[0] as Record<string, unknown>;
  const quote = row.report_kind === 'FIPE_FREE' ? snapshotQuote(row) : null;
  res.json({ authentic: true, reportKind: row.report_kind, reportVersion: row.report_version, documentCode: row.document_code, createdAt: row.created_at, status: row.superseded_at ? 'UPDATED' : 'VALID', hash: row.report_hash, plate: quote?.plate ? `${quote.plate.slice(0, 3)}***${quote.plate.slice(-2)}` : null, fipeReferenceMonth: quote?.referenceMonth ?? null });
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
  res.json({ offers: products.rows.map((product) => ({ id: product.id, name: product.name, description: product.description, creditCost: Number(product.credit_cost), features: product.features, commercialStatus: product.commercial_status, featured: Boolean(product.featured) })) });
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

    const output = await withTimeout(provider.queryByPlate(parsed.data.plate), env.QUERY_REQUEST_TIMEOUT_MS);
    const normalized = normalizeBdrp(output.raw);
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

api.post('/payments/checkout', auth, requirePermission('BUY_CREDITS'), asyncRoute(async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  if (!isAsaasConfigured()) throw appError('PAYMENT_PROVIDER_NOT_CONFIGURED', { code: 'PAYMENT_PROVIDER_NOT_CONFIGURED', http: 503, expose: true });
  const draft = await tx(async (client) => {
    const pack = await client.query('SELECT id,slug,name,description,credits,price_cents FROM credit_packages WHERE slug=$1 AND active=true', [parsed.data.packageSlug]);
    if (!pack.rowCount) throw appError('CREDIT_PACKAGE_NOT_FOUND', { code: 'CREDIT_PACKAGE_NOT_FOUND', http: 404, expose: true });
    const profile = await client.query(`SELECT u.name,u.email,p.cpf_cnpj,p.phone FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id WHERE u.id=$1 AND u.active=true`, [req.user!.id]);
    if (!profile.rowCount) throw appError('AUTH_REQUIRED', { code: 'AUTH_REQUIRED', http: 401, expose: true });
    const externalReference = `carpivara_${crypto.randomUUID()}`;
    const order = await client.query(`INSERT INTO payment_orders(user_id,package_id,status,amount_cents,credits,provider,external_reference)
      VALUES($1,$2,'CREATED',$3,$4,'asaas',$5) RETURNING id`, [req.user!.id, pack.rows[0].id, pack.rows[0].price_cents, pack.rows[0].credits, externalReference]);
    return { orderId: order.rows[0].id as string, externalReference, pack: pack.rows[0] as Record<string, unknown>, customer: profile.rows[0] as Record<string, unknown> };
  });
  try {
    const checkout = await createAsaasCheckout({
      orderId: draft.externalReference,
      itemName: String(draft.pack.name),
      itemDescription: String(draft.pack.description),
      amountCents: Number(draft.pack.price_cents),
      customer: { name: String(draft.customer.name), email: String(draft.customer.email), cpfCnpj: draft.customer.cpf_cnpj ? String(draft.customer.cpf_cnpj) : undefined, phone: draft.customer.phone ? String(draft.customer.phone) : undefined }
    });
    await pool.query(`UPDATE payment_orders SET status='CHECKOUT_ACTIVE',provider_checkout_id=$2,checkout_url=$3,updated_at=now() WHERE id=$1`, [draft.orderId, checkout.id, checkout.link]);
    await audit(req.user!.id, 'CREATE_PAYMENT_CHECKOUT', 'PAYMENT_ORDER', draft.orderId, { packageSlug: parsed.data.packageSlug, requestId: requestId(req) });
    res.status(201).json({ orderId: draft.orderId, checkoutUrl: checkout.link, provider: 'asaas' });
  } catch (error) {
    await pool.query(`UPDATE payment_orders SET status='FAILED',updated_at=now() WHERE id=$1`, [draft.orderId]);
    throw error;
  }
}));

api.post('/payments/asaas/webhook', asyncRoute(async (req, res) => {
  const header = typeof req.headers['asaas-access-token'] === 'string' ? req.headers['asaas-access-token'] : undefined;
  if (!hasValidAsaasWebhookToken(header)) throw appError('PAYMENT_WEBHOOK_UNAUTHORIZED', { code: 'PAYMENT_WEBHOOK_UNAUTHORIZED', http: 401, expose: false });
  const event = req.body as AsaasWebhookEvent;
  const eventId = typeof event?.id === 'string' ? event.id : '';
  const eventType = typeof event?.event === 'string' ? event.event : '';
  if (!eventId || !eventType) throw appError('PAYMENT_WEBHOOK_INVALID', { code: 'PAYMENT_WEBHOOK_INVALID', http: 400, expose: false });
  const reference = eventReference(event);
  const paymentExternalId = externalPaymentId(event);
  let duplicate = false;
  await tx(async (client) => {
    const inserted = await client.query(`INSERT INTO payment_webhook_events(provider,provider_event_id,event_type,payload)
      VALUES('asaas',$1,$2,$3::jsonb) ON CONFLICT(provider,provider_event_id) DO NOTHING RETURNING id`, [eventId, eventType, JSON.stringify({ id: eventId, event: eventType, reference, externalId: paymentExternalId })]);
    if (!inserted.rowCount) { duplicate = true; return; }
    const order = reference ? await client.query('SELECT * FROM payment_orders WHERE external_reference=$1 FOR UPDATE', [reference]) : await client.query('SELECT * FROM payment_orders WHERE provider_checkout_id=$1 FOR UPDATE', [paymentExternalId]);
    if (!order.rowCount) {
      await client.query('UPDATE payment_webhook_events SET processing_error=$2,processed_at=now() WHERE id=$1', [inserted.rows[0].id, 'ORDER_NOT_FOUND']);
      return;
    }
    const current = order.rows[0] as Record<string, unknown>;
    const orderId = String(current.id);
    await client.query('UPDATE payment_webhook_events SET order_id=$2 WHERE id=$1', [inserted.rows[0].id, orderId]);
    const paid = eventType === 'CHECKOUT_PAID' || eventType === 'PAYMENT_RECEIVED';
    if (paid && current.status !== 'PAID') {
      const wallet = await client.query('SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE', [current.user_id]);
      const before = Number(wallet.rows[0]?.balance ?? 0); const credits = Number(current.credits); const after = before + credits;
      const payment = await client.query(`INSERT INTO payments(user_id,provider,status,amount_cents,credits,external_id,order_id,paid_at,provider_status,metadata)
        VALUES($1,'asaas','PAID',$2,$3,$4,$5,now(),$6,$7::jsonb) RETURNING id`, [current.user_id, current.amount_cents, credits, paymentExternalId, orderId, eventType, JSON.stringify({ eventId })]);
      await client.query('INSERT INTO wallets(user_id,balance) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET balance=EXCLUDED.balance,updated_at=now()', [current.user_id, after]);
      await client.query(`INSERT INTO wallet_transactions(user_id,kind,amount,balance_before,balance_after,payment_id,description,metadata)
        VALUES($1,'PURCHASE',$2,$3,$4,$5,$6,$7::jsonb)`, [current.user_id, credits, before, after, payment.rows[0].id, `Créditos adquiridos via Asaas`, JSON.stringify({ orderId, eventId })]);
      await client.query(`UPDATE payment_orders SET status='PAID',paid_at=now(),updated_at=now() WHERE id=$1`, [orderId]);
    } else if (!paid && current.status !== 'PAID') {
      const mapped = eventType.includes('EXPIRED') ? 'EXPIRED' : eventType.includes('CANCEL') ? 'CANCELLED' : eventType.includes('REFUND') ? 'REFUNDED' : 'CHECKOUT_ACTIVE';
      await client.query('UPDATE payment_orders SET status=$2,updated_at=now() WHERE id=$1', [orderId, mapped]);
    }
    await client.query('UPDATE payment_webhook_events SET processed_at=now() WHERE id=$1', [inserted.rows[0].id]);
  });
  res.status(200).json({ received: true, duplicate });
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
  res.json(summary.rows[0]);
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
  res.json(product.rows[0]);
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
    return { transactionId: transaction.rows[0].id, balance: after };
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
