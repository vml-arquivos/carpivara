import type { PoolClient } from 'pg';
import { appError, log } from './http.js';
import { pool, tx } from '../db.js';
import { env } from '../config.js';

/**
 * Travas de segurança para consultas que gastam crédito no fornecedor (Credify).
 *  - runExclusive: a mesma consulta (mesma chave) não roda duas vezes ao mesmo tempo, mesmo com clique duplo ou duas abas.
 *  - CallBudget: teto de chamadas pagas por hora e por dia; ao atingir, a fonte nem é chamada.
 * A parte local vive em memória; a parte distribuída vive no banco (advisory lock + `provider_call_log`), para que
 * reinício do processo ou uma segunda réplica não reabra a janela de gasto duplicado. Sem banco disponível, o
 * comportamento volta ao de antes (trava local) e isso fica registrado no log.
 */

const running = new Map<string, { token: symbol; startedAt: number }>();

/**
 * Executa `task` só se não houver outra execução com a mesma `key` em andamento; senão responde QUERY_IN_PROGRESS (409)
 * sem chamar a fonte. A trava é solta ao terminar (com sucesso ou erro). `staleAfterMs` evita trava eterna se algo não terminar.
 * Além da trava local, pega uma `pg_advisory_lock` de sessão no banco: outra réplica que tentar a mesma chave fica de fora.
 */
export async function runExclusive<T>(key: string, task: () => Promise<T>, staleAfterMs = 10 * 60_000, now: () => number = Date.now): Promise<T> {
  const current = running.get(key);
  if (current && now() - current.startedAt < staleAfterMs) throw inProgress();
  const token = Symbol(key);
  running.set(key, { token, startedAt: now() });
  // Retomar uma trava local vencida é decisão deste processo; a trava de banco só entra quando não havia nada em mãos.
  const lock = current ? { held: null as PoolClient | null, blocked: false } : await acquireSessionLock(key);
  if (lock.blocked) {
    if (running.get(key)?.token === token) running.delete(key);
    throw inProgress();
  }
  try {
    return await task();
  } finally {
    if (lock.held) await releaseSessionLock(key, lock.held);
    // Só solta a própria trava (uma execução antiga, já vencida, não pode soltar a de uma execução nova).
    if (running.get(key)?.token === token) running.delete(key);
  }
}

function inProgress(): Error { return appError('QUERY_IN_PROGRESS', { code: 'QUERY_IN_PROGRESS', http: 409, expose: true }); }

/**
 * Trava de sessão: o cliente fica preso à tarefa e é devolvido ao pool no fim.
 * `blocked` = outra execução já tem a chave; sem banco disponível nada é bloqueado (segue só a trava local).
 */
async function acquireSessionLock(key: string): Promise<{ held: PoolClient | null; blocked: boolean }> {
  if (!(await guardDatabaseReady())) return { held: null, blocked: false };
  let client: PoolClient | null = null;
  try {
    client = await pool.connect();
    const r = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [`vqlock:${key}`]);
    if (r.rows[0]?.locked === true) return { held: client, blocked: false };
    client.release();
    return { held: null, blocked: true };
  } catch (e) {
    client?.release();
    log('warn', 'provider_guard_lock_failed', { error: e instanceof Error ? e.message : 'erro' });
    return { held: null, blocked: false };
  }
}

async function releaseSessionLock(key: string, client: PoolClient): Promise<void> {
  try { await client.query('SELECT pg_advisory_unlock(hashtext($1))', [`vqlock:${key}`]); } catch { /* a conexão cai e a trava junto */ }
  client.release();
}

export function exclusiveRunning(): number { return running.size; }
export function resetExclusiveLocks(): void { running.clear(); }

/* ------------------------------------------------------------------ disponibilidade do banco */

let dbReady: boolean | null = null;
let dbCheckedAt = 0;
const DB_RETRY_MS = 60_000;

/** As travas distribuídas dependem do banco: sem `DATABASE_URL` ou com o banco fora, segue só a trava local (e o log avisa). */
async function guardDatabaseReady(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  if (dbReady === true) return true;
  if (dbReady === false && Date.now() - dbCheckedAt < DB_RETRY_MS) return false;
  dbCheckedAt = Date.now();
  let ok = true;
  try { await pool.query('SELECT 1'); } catch { ok = false; }
  dbReady = ok;
  if (!ok) log('warn', 'provider_guard_db_unavailable', { aviso: 'travas e contadores seguem só em memória neste processo' });
  return ok;
}

let logTableReady: boolean | null = null;
/** O contador em banco entra com a migração 093; em banco sem a migração nada é exigido dela. */
async function guardLogTableReady(): Promise<boolean> {
  if (!(await guardDatabaseReady())) return false;
  if (logTableReady !== null) return logTableReady;
  try { logTableReady = Boolean((await pool.query(`SELECT to_regclass('public.provider_call_log') AS t`)).rows[0]?.t); }
  catch { logTableReady = false; }
  return logTableReady;
}

/** Esquece o que foi sondado sobre banco e tabela de chamadas (testes e recuperação após migrar o banco). */
export function resetGuardProbes(): void { dbReady = null; dbCheckedAt = 0; logTableReady = null; }

/* ------------------------------------------------------------------ teto de volume de chamadas pagas */

type Failure = Error & { code: string; detail?: string };

/** Limites de chamadas pagas. 0 = sem limite naquele período. */
export interface BudgetLimits { perHour: number; perDay: number }

export class CallBudget {
  private stamps: number[] = [];
  constructor(private readonly now: () => number = Date.now) {}

  usage(at = this.now()): { lastHour: number; lastDay: number } {
    this.prune(at);
    return { lastHour: this.stamps.filter((t) => t > at - 3_600_000).length, lastDay: this.stamps.length };
  }

  /** Reserva uma chamada paga. Se o teto de hora ou de dia foi atingido, lança PROVIDER_BUDGET_EXCEEDED sem reservar. */
  take(limits: BudgetLimits): void {
    const at = this.now();
    const used = this.usage(at);
    if (limits.perHour > 0 && used.lastHour >= limits.perHour) throw budgetError(hourText(used.lastHour, limits.perHour));
    if (limits.perDay > 0 && used.lastDay >= limits.perDay) throw budgetError(dayText(used.lastDay, limits.perDay));
    this.stamps.push(at);
  }

  reset(): void { this.stamps = []; }

  private prune(at: number): void {
    const cutoff = at - 86_400_000;
    if (this.stamps.length && this.stamps[0] <= cutoff) this.stamps = this.stamps.filter((t) => t > cutoff);
  }
}

const hourText = (used: number, max: number) => `Limite de segurança atingido: ${used} consultas na última hora (máximo ${max}). Nenhuma consulta nova foi enviada à Credify.`;
const dayText = (used: number, max: number) => `Limite de segurança atingido: ${used} consultas nas últimas 24 horas (máximo ${max}). Nenhuma consulta nova foi enviada à Credify.`;

/** Contagem de chamadas pagas no banco (última hora e últimas 24 h), para o teto sobreviver a reinício do processo. */
export async function paidCallUsage(scope: string): Promise<{ lastHour: number; lastDay: number }> {
  const r = await pool.query(
    `SELECT count(*) FILTER (WHERE called_at > now() - interval '1 hour')::int AS last_hour, count(*)::int AS last_day
       FROM provider_call_log WHERE scope=$1 AND called_at > now() - interval '2 days'`, [scope]);
  return { lastHour: Number(r.rows[0]?.last_hour ?? 0), lastDay: Number(r.rows[0]?.last_day ?? 0) };
}

/**
 * Reserva uma chamada paga no contador do banco, sob `pg_advisory_xact_lock`: duas réplicas não passam as duas
 * pelo mesmo teto. Se o teto já estava cheio, nada é gravado (a transação desfaz) e o erro é o mesmo de sempre.
 */
export async function reservePaidCall(scope: string, limits: BudgetLimits, info: { provider: string; step?: string | null } = { provider: scope }): Promise<void> {
  if (limits.perHour <= 0 && limits.perDay <= 0) { recordPaidCall(scope, info); return; }
  await tx(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`vqbudget:${scope}`]);
    const used = await paidCallUsage(scope);
    if (limits.perHour > 0 && used.lastHour >= limits.perHour) throw budgetError(hourText(used.lastHour, limits.perHour));
    if (limits.perDay > 0 && used.lastDay >= limits.perDay) throw budgetError(dayText(used.lastDay, limits.perDay));
    await client.query('INSERT INTO provider_call_log(scope,provider,step) VALUES($1,$2,$3)', [scope, info.provider, info.step ?? null]);
    await client.query(`DELETE FROM provider_call_log WHERE scope=$1 AND called_at < now() - interval '2 days'`, [scope]);
  });
}

/** Só observa: guarda a chamada paga no histórico do contador, sem exigir nada (ligado sempre que a tabela existe). */
export function recordPaidCall(scope: string, info: { provider: string; step?: string | null }): void {
  void pool.query('INSERT INTO provider_call_log(scope,provider,step) VALUES($1,$2,$3)', [scope, info.provider, info.step ?? null])
    .then(() => pool.query(`DELETE FROM provider_call_log WHERE scope=$1 AND called_at < now() - interval '2 days'`, [scope]))
    .catch(() => undefined);
}

/**
 * Reserva uma chamada paga no processo (como sempre) e, com o contador em banco, também no banco.
 * `PROVIDER_GUARD_PERSISTED` decide se o contador do banco vale como teto; enquanto estiver desligado, as chamadas
 * continuam sendo registradas lá (para conferência), mas quem manda no teto de volume é a memória do processo.
 */
export async function takePaidCall(budget: CallBudget, limits: BudgetLimits, info: { scope: string; provider: string; step?: string | null }): Promise<void> {
  budget.take(limits);
  if (!(await guardLogTableReady())) return;
  if (!env.PROVIDER_GUARD_PERSISTED) { recordPaidCall(info.scope, info); return; }
  try {
    await reservePaidCall(info.scope, limits, info);
  } catch (e) {
    if ((e as { code?: string })?.code === 'PROVIDER_BUDGET_EXCEEDED') throw e;
    log('warn', 'provider_guard_reserve_failed', { error: e instanceof Error ? e.message : 'erro' });
    recordPaidCall(info.scope, info);
  }
}

function budgetError(detail: string): Failure {
  return Object.assign(new Error('PROVIDER_BUDGET_EXCEEDED'), { code: 'PROVIDER_BUDGET_EXCEEDED', detail });
}
