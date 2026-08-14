import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { auth, signToken, type AuthUser } from './auth.js';
import { env } from './config.js';
import { pool, tx } from './db.js';
import { normalizeBdrp } from './normalizer.js';
import { hasPermission, permissionsFor, requirePermission } from './permissions.js';
import { getProvider } from './providers/index.js';
import { ensureSchema } from './schema.js';
import type { NormalizedVehicle } from './types.js';

await ensureSchema();

const app = express();
const api = express.Router();
const plateSchema = z.string().trim().min(7).max(16).transform((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, '')).refine((value) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(value), 'INVALID_PLATE');
const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(10).max(128)
});
const loginSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) });
const requestQuerySchema = z.object({ plate: plateSchema, productId: z.string().trim().min(1).max(80) });
const sandboxCreditSchema = z.object({ credits: z.number().int().min(10).max(10000) });
const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(10).max(128) });
const productUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().min(2).max(400).optional(),
  creditCost: z.number().int().min(0).max(100000).optional(),
  active: z.boolean().optional()
}).refine((input) => Object.keys(input).length > 0, 'EMPTY_UPDATE');

type AppError = Error & { code?: string; http?: number; expose?: boolean };
type QueryRow = { id: string; status: string; credits_cost: number; normalized: NormalizedVehicle | null };

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
  return {
    id: row.id,
    plate: row.plate,
    productId: row.product_id,
    productName: row.product_name,
    status: row.status,
    creditsCost: row.credits_cost,
    provider: row.provider,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    result: normalized ? { ...normalized, diagnostic: diagnostic(normalized) } : null
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
if (env.RATE_LIMIT_ENABLED) {
  app.use(rateLimit({ windowMs: env.RATE_LIMIT_WINDOW_MS, limit: env.RATE_LIMIT_MAX_REQUESTS, standardHeaders: true, legacyHeaders: false, skip: (req) => req.path === '/health' }));
}

app.get('/health', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, app: env.APP_NAME, provider: env.DATA_PROVIDER, database: 'ok' });
}));

const loginRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TOO_MANY_ATTEMPTS', message: 'Muitas tentativas. Aguarde alguns minutos para tentar novamente.' }
});

api.post('/auth/register', asyncRoute(async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) throw appError('INVALID_INPUT', { code: 'INVALID_INPUT', http: 400, expose: true });
  const email = parsed.data.email.toLowerCase();
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  try {
    const created = await tx(async (client) => {
      const user = await client.query('INSERT INTO users(email,password_hash,name,role) VALUES($1,$2,$3,$4) RETURNING id,email,name,role', [email, passwordHash, parsed.data.name, 'CLIENTE']);
      await client.query('INSERT INTO wallets(user_id,balance) VALUES($1,0)', [user.rows[0].id]);
      return user.rows[0] as AuthUser;
    });
    await audit(created.id, 'REGISTER', 'USER', created.id, { requestId: requestId(req) });
    res.status(201).json({ token: signToken(created), user: created });
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') throw appError('EMAIL_ALREADY_EXISTS', { code: 'EMAIL_ALREADY_EXISTS', http: 409, expose: true });
    throw error;
  }
}));

api.post('/auth/login', loginRateLimit, asyncRoute(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) throw appError('INVALID_CREDENTIALS', { code: 'INVALID_CREDENTIALS', http: 401, expose: true });
  const email = parsed.data.email.toLowerCase();
  const result = await pool.query('SELECT id,email,password_hash,name,role,active,failed_login_attempts,locked_until FROM users WHERE lower(email)=lower($1)', [email]);
  const account = result.rows[0] as (Record<string, unknown> | undefined);
  const lockedUntil = account?.locked_until ? new Date(String(account.locked_until)) : undefined;
  const isLocked = lockedUntil && lockedUntil.getTime() > Date.now();
  const passwordMatches = account ? await bcrypt.compare(parsed.data.password, String(account.password_hash)) : false;
  if (!account || !account.active || isLocked || !passwordMatches) {
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
  await audit(user.id, 'LOGIN', 'USER', user.id, { requestId: requestId(req) });
  res.json({ token: signToken(user), user });
}));

api.post('/auth/logout', auth, asyncRoute(async (req, res) => {
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
  await pool.query('UPDATE users SET password_hash=$2 WHERE id=$1', [req.user!.id, await bcrypt.hash(parsed.data.newPassword, 12)]);
  await audit(req.user!.id, 'PASSWORD_CHANGED', 'USER', req.user!.id, { requestId: requestId(req) });
  res.status(204).end();
}));

api.get('/me', auth, asyncRoute(async (req, res) => {
  const wallet = await pool.query('SELECT balance FROM wallets WHERE user_id=$1', [req.user!.id]);
  res.json({ user: req.user, balance: wallet.rows[0]?.balance ?? 0, permissions: permissionsFor(req.user!.role), sandbox: env.DATA_PROVIDER === 'mock' });
}));

api.get('/query-products', auth, asyncRoute(async (_req, res) => {
  const products = await pool.query('SELECT id,name,description,credit_cost,slug,features,display_order FROM query_products WHERE active=true ORDER BY display_order,credit_cost');
  res.json(products.rows.map((product) => ({ id: product.id, name: product.name, description: product.description, creditCost: product.credit_cost, slug: product.slug, features: product.features })));
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

api.get('/admin/overview', auth, requirePermission('VIEW_AUDIT'), asyncRoute(async (_req, res) => {
  const summary = await pool.query(`SELECT
    (SELECT count(*) FROM users WHERE active=true) AS active_users,
    (SELECT count(*) FROM vehicle_queries WHERE created_at >= date_trunc('day', now())) AS queries_today,
    (SELECT count(*) FROM vehicle_queries WHERE status='SUCCESS') AS successful_queries,
    (SELECT count(*) FROM vehicle_queries WHERE status='REFUNDED') AS refunds,
    (SELECT coalesce(sum(credits),0) FROM payments WHERE status='PAID') AS credits_sold,
    (SELECT coalesce(sum(abs(amount)),0) FROM wallet_transactions WHERE kind='QUERY') AS credits_consumed`);
  res.json(summary.rows[0]);
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
    SANDBOX_DISABLED: 'A compra de créditos de teste não está disponível neste ambiente.'
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
