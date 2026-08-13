import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config.js';
import { pool, tx } from './db.js';
import { ensureSchema } from './schema.js';
import { auth, signToken } from './auth.js';
import { getProvider } from './providers/index.js';
import { normalizeBdrp } from './normalizer.js';
await ensureSchema();
const app = express();
app.set('trust proxy', env.TRUST_PROXY);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: env.NODE_ENV === 'production' ? false : env.WEB_ORIGIN, credentials: false }));
app.use(express.json({ limit: '256kb' }));
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));
app.get('/health', async (_req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ ok: true, app: env.APP_NAME, provider: env.DATA_PROVIDER, database: 'ok' });
    }
    catch {
        res.status(503).json({ ok: false, database: 'unavailable' });
    }
});
const api = express.Router();
api.post('/auth/login', async (req, res) => {
    const parsed = z.object({ email: z.string().email(), password: z.string().min(8) }).safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: 'INVALID_INPUT' });
    const q = await pool.query('SELECT * FROM users WHERE lower(email)=lower($1) AND active=true', [parsed.data.email]);
    if (!q.rowCount || !(await bcrypt.compare(parsed.data.password, q.rows[0].password_hash)))
        return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    const u = q.rows[0];
    const user = { id: u.id, email: u.email, name: u.name, role: u.role };
    await pool.query('INSERT INTO audit_logs(user_id,action,entity,entity_id) VALUES($1,$2,$3,$4)', [u.id, 'LOGIN', 'USER', u.id]);
    res.json({ token: signToken(user), user });
});
api.get('/me', auth, async (req, res) => {
    const q = await pool.query('SELECT balance FROM wallets WHERE user_id=$1', [req.user.id]);
    res.json({ user: req.user, balance: q.rows[0]?.balance ?? 0, sandbox: env.DATA_PROVIDER === 'mock' });
});
api.get('/query-products', auth, async (_req, res) => {
    const q = await pool.query('SELECT id,name,description,credit_cost FROM query_products WHERE active=true ORDER BY credit_cost');
    res.json(q.rows);
});
api.post('/queries', auth, async (req, res) => {
    const parsed = z.object({ plate: z.string().min(7).max(8), productId: z.string() }).safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: 'INVALID_INPUT' });
    const plate = parsed.data.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate))
        return res.status(400).json({ error: 'INVALID_PLATE' });
    const provider = getProvider();
    let queryId = '';
    let cost = 0;
    try {
        await tx(async (c) => {
            const p = await c.query('SELECT credit_cost FROM query_products WHERE id=$1 AND active=true', [parsed.data.productId]);
            if (!p.rowCount)
                throw Object.assign(new Error('PRODUCT_NOT_FOUND'), { http: 404 });
            cost = p.rows[0].credit_cost;
            const w = await c.query('SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE', [req.user.id]);
            if (!w.rowCount || w.rows[0].balance < cost)
                throw Object.assign(new Error('INSUFFICIENT_CREDITS'), { http: 402 });
            const before = w.rows[0].balance, after = before - cost;
            const q = await c.query(`INSERT INTO vehicle_queries(user_id,plate,product_id,status,credits_cost,provider) VALUES($1,$2,$3,'PROCESSING',$4,$5) RETURNING id`, [req.user.id, plate, parsed.data.productId, cost, provider.name]);
            queryId = q.rows[0].id;
            await c.query('UPDATE wallets SET balance=$2,updated_at=now() WHERE user_id=$1', [req.user.id, after]);
            await c.query(`INSERT INTO wallet_transactions(user_id,kind,amount,balance_before,balance_after,query_id,description) VALUES($1,'QUERY',$2,$3,$4,$5,$6)`, [req.user.id, -cost, before, after, queryId, `Consulta ${plate}`]);
        });
        const out = await provider.queryByPlate(plate);
        const normalized = normalizeBdrp(out.raw);
        await tx(async (c) => {
            await c.query('INSERT INTO vehicle_query_results(query_id,normalized,raw_response) VALUES($1,$2::jsonb,$3::jsonb)', [queryId, JSON.stringify(normalized), JSON.stringify(out.raw)]);
            await c.query(`UPDATE vehicle_queries SET status='SUCCESS',provider_query_id=$2,completed_at=now() WHERE id=$1`, [queryId, out.providerQueryId ?? null]);
            await c.query('INSERT INTO audit_logs(user_id,action,entity,entity_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)', [req.user.id, 'VEHICLE_QUERY', 'VEHICLE_QUERY', queryId, JSON.stringify({ plate, productId: parsed.data.productId })]);
        });
        res.status(201).json({ id: queryId, status: 'SUCCESS', creditsCost: cost, result: normalized });
    }
    catch (error) {
        if (queryId) {
            await tx(async (c) => { const q = await c.query('SELECT status FROM vehicle_queries WHERE id=$1 FOR UPDATE', [queryId]); if (q.rowCount && q.rows[0].status === 'PROCESSING') {
                const w = await c.query('SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE', [req.user.id]);
                const before = w.rows[0].balance, after = before + cost;
                await c.query('UPDATE wallets SET balance=$2,updated_at=now() WHERE user_id=$1', [req.user.id, after]);
                await c.query(`INSERT INTO wallet_transactions(user_id,kind,amount,balance_before,balance_after,query_id,description) VALUES($1,'REFUND',$2,$3,$4,$5,$6)`, [req.user.id, cost, before, after, queryId, `Estorno consulta ${plate}`]);
                await c.query(`UPDATE vehicle_queries SET status='REFUNDED',error_code=$2,error_message=$3,completed_at=now() WHERE id=$1`, [queryId, error.code ?? 'PROVIDER_ERROR', String(error.message).slice(0, 250)]);
            } });
        }
        res.status(error.http ?? (error.code === 'NOT_FOUND' ? 404 : 502)).json({ error: error.message ?? 'QUERY_FAILED', refunded: Boolean(queryId) });
    }
});
api.get('/queries', auth, async (req, res) => { const q = await pool.query(`SELECT q.id,q.plate,q.product_id,q.status,q.credits_cost,q.created_at,q.completed_at,r.normalized FROM vehicle_queries q LEFT JOIN vehicle_query_results r ON r.query_id=q.id WHERE q.user_id=$1 ORDER BY q.created_at DESC LIMIT 100`, [req.user.id]); res.json(q.rows); });
api.get('/wallet/transactions', auth, async (req, res) => { const q = await pool.query('SELECT * FROM wallet_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [req.user.id]); res.json(q.rows); });
api.post('/payments/sandbox', auth, async (req, res) => {
    if (env.NODE_ENV === 'production' && !env.SANDBOX_CREDIT_PURCHASE_ENABLED)
        return res.status(403).json({ error: 'SANDBOX_DISABLED_IN_PRODUCTION' });
    const parsed = z.object({ credits: z.number().int().min(10).max(10000) }).safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: 'INVALID_INPUT' });
    const credits = parsed.data.credits, amountCents = credits * 100;
    const result = await tx(async (c) => { const p = await c.query(`INSERT INTO payments(user_id,provider,status,amount_cents,credits,paid_at) VALUES($1,'sandbox','PAID',$2,$3,now()) RETURNING id`, [req.user.id, amountCents, credits]); const w = await c.query('SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE', [req.user.id]); const before = w.rows[0].balance, after = before + credits; await c.query('UPDATE wallets SET balance=$2,updated_at=now() WHERE user_id=$1', [req.user.id, after]); await c.query(`INSERT INTO wallet_transactions(user_id,kind,amount,balance_before,balance_after,payment_id,description) VALUES($1,'PURCHASE',$2,$3,$4,$5,$6)`, [req.user.id, credits, before, after, p.rows[0].id, 'Créditos SANDBOX']); return { paymentId: p.rows[0].id, balance: after }; });
    res.status(201).json({ status: 'PAID', credits, ...result });
});
app.use('/api', api);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(__dirname, '../../web/dist');
app.use(express.static(webDist, { index: false, maxAge: env.NODE_ENV === 'production' ? '1h' : 0 }));
app.get('*', (req, res, next) => { if (req.path.startsWith('/api/') || req.path === '/health')
    return next(); res.sendFile(path.join(webDist, 'index.html')); });
app.listen(env.PORT, '0.0.0.0', () => console.log(`${env.APP_NAME} listening on :${env.PORT}`));
