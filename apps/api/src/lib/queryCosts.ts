import { AsyncLocalStorage } from 'node:async_hooks';
import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import { env } from '../config.js';
import { log } from './http.js';
/**
 * Custo de cada etapa paga de uma consulta.
 *
 * Antes deste módulo o gasto por chamada só existia em memória (classe `Spend`) e em variável de ambiente: nada era
 * gravado e não havia como conferir quanto cada fonte cobrou por consulta. Aqui cada chamada registra uma linha em
 * `vehicle_query_costs` (fonte, etapa, custo, desfecho, duração), o preço unitário vem de `source_call_prices`
 * (tabela do painel) e o teto por consulta passa a ser checado antes da chamada sair.
 *
 * Regras:
 *  - registrar nunca altera o resultado da consulta: falha de gravação é logada e ignorada (o gasto continua real);
 *  - preço não publicado fica marcado como 'desconhecido' — nada de inventar zero nem estimativa da fonte;
 *  - placa, CPF e token não passam por aqui: a linha só tem consulta, fonte, etapa, custo e desfecho.
 */

export type CallKind = 'essencial' | 'opcional' | 'condicional' | 'backfill';
/** `cobrado`: respondeu com dado. `sem_retorno`: respondeu sem dado (placa não encontrada). `falha`: recusou antes de consultar. `nao_cobrado`: não saiu, ou saiu com desfecho incerto. */
export type CostOutcome = 'cobrado' | 'sem_retorno' | 'falha' | 'nao_cobrado';
export type PriceSource = 'tabela_admin' | 'env' | 'desconhecido';

export interface StepCost {
  queryId: string;
  provider: string;
  step: string;
  callKind: CallKind;
  externalCallId: string | null;
  costCents: number;
  priceSource: PriceSource;
  outcome: CostOutcome;
  durationMs: number | null;
}

export interface StepInput {
  provider: string;
  step: string;
  outcome: CostOutcome;
  kind?: CallKind;
  /** Custo em centavos; vazio = busca o preço da etapa (tabela do painel → variável de ambiente → desconhecido). */
  costCents?: number | null;
  priceSource?: PriceSource;
  externalCallId?: string | null;
  durationMs?: number | null;
  /** Fora do fluxo de uma consulta (rotinas do painel) a consulta precisa ser informada; dentro do fluxo vem do contexto. */
  queryId?: string | null;
}

/** Nome estável da etapa a partir do caminho da fonte: `/veicularbnacionalonline` → `veicularbnacionalonline`. */
export const stepFromPath = (path: string | null | undefined): string => String(path ?? '').trim().toLowerCase().replace(/^\/+/, '').replace(/[^a-z0-9]+/g, '-');

/* ------------------------------------------------------------------ preço por etapa */

const PRICE_TTL_MS = 60_000;
const priceCache = new Map<string, { at: number; costCents: number | null; priceSource: PriceSource }>();

export interface StepPrice {
  costCents: number | null;
  priceSource: PriceSource;
  /** true = preço conhecido (tabela do painel ou variável). false = custo não publicado. */
  known: boolean;
  /** Regra da fase de roteamento: sem preço conhecido a rota não é elegível para a conta de menor custo. */
  eligible: boolean;
}

const asPrice = (costCents: number | null, priceSource: PriceSource): StepPrice => ({ costCents, priceSource, known: costCents != null, eligible: costCents != null });

/** Preço vigente de uma etapa: tabela administrada (`source_call_prices`) → variável de ambiente → desconhecido. */
export async function priceFor(source: string, step: string): Promise<StepPrice> {
  const key = `${source}|${step}`;
  const hit = priceCache.get(key);
  if (hit && Date.now() - hit.at < PRICE_TTL_MS) return asPrice(hit.costCents, hit.priceSource);
  let found: { costCents: number | null; priceSource: PriceSource } | null = null;
  if (await tableAvailable('source_call_prices', 'priceTableReady')) {
    try {
      const r = await pool.query(
        `SELECT cost_cents FROM source_call_prices
          WHERE source=$1 AND step=$2 AND valid_from <= now() AND (valid_to IS NULL OR valid_to > now())
          ORDER BY valid_from DESC LIMIT 1`, [source, step]);
      if (r.rowCount) {
        const raw = r.rows[0].cost_cents;
        found = raw == null ? { costCents: null, priceSource: 'desconhecido' } : { costCents: Number(raw), priceSource: 'tabela_admin' };
      }
    } catch (e) {
      log('warn', 'query_cost_price_read_failed', { source, step, error: e instanceof Error ? e.message : 'erro' });
    }
  }
  if (!found) {
    // A variável continua valendo (CREDIFY_COST_CENTS), mas só para a fonte que ela descreve.
    const fromEnv = source === 'credify' ? env.CREDIFY_COST_CENTS?.[`/${step}`] : undefined;
    found = fromEnv != null ? { costCents: Number(fromEnv), priceSource: 'env' } : { costCents: null, priceSource: 'desconhecido' };
  }
  priceCache.set(key, { at: Date.now(), ...found });
  return asPrice(found.costCents, found.priceSource);
}

/** Esquece preços e a checagem de tabelas: o painel chama ao gravar uma tabela nova; os testes usam para isolar. */
export function resetPriceCache(): void { priceCache.clear(); probedTables.clear(); }

const probedTables = new Map<string, boolean>();
/** As tabelas entram com as migrações 092/093; num banco antigo ou mínimo nada disto pode quebrar a consulta. */
async function tableAvailable(table: string, _tag: string): Promise<boolean> {
  const known = probedTables.get(table);
  if (known !== undefined) return known;
  let ok = false;
  try { ok = Boolean((await pool.query(`SELECT to_regclass('public.${table}') AS t`)).rows[0]?.t); } catch { ok = false; }
  probedTables.set(table, ok);
  return ok;
}

/* ------------------------------------------------------------------ coleta por consulta */

interface CostScope { queryId: string; provider: string; rows: StepCost[] }
const store = new AsyncLocalStorage<CostScope>();
let warnedNoContext = false;

/**
 * Abre o contexto de custo de uma consulta: o que os adaptadores registrarem dentro de `run` fica acumulado e é
 * gravado junto do que a consulta já persiste (sucesso, estorno) ou do que a rotina administrativa grava.
 */
export async function withQueryCosts<T>(info: { queryId: string; provider: string }, run: () => Promise<T>): Promise<T> {
  return store.run({ queryId: info.queryId, provider: info.provider, rows: [] }, run);
}

/** Consulta em curso para as rotinas que chamam a fonte fora do fluxo do cliente (backfill de gravame, ficha FIPE). */
export function currentQueryCostScope(): { queryId: string; provider: string } | null {
  const s = store.getStore();
  return s ? { queryId: s.queryId, provider: s.provider } : null;
}

/** Registra uma etapa paga (ou barrada). Nunca lança: observar não pode derrubar a consulta. */
export async function recordStep(input: StepInput): Promise<StepCost | null> {
  if (!env.QUERY_COST_LOG_ENABLED) return null;
  const scope = store.getStore();
  const queryId = input.queryId ?? scope?.queryId ?? null;
  if (!queryId) {
    if (!warnedNoContext) { warnedNoContext = true; log('warn', 'query_cost_without_context', { provider: input.provider, step: input.step }); }
    return null;
  }
  let costCents = input.costCents;
  let priceSource = input.priceSource;
  if (costCents == null || !priceSource) {
    const p = await priceFor(input.provider, input.step);
    costCents = costCents ?? p.costCents ?? 0;
    priceSource = priceSource ?? p.priceSource;
  }
  const row: StepCost = {
    queryId,
    provider: input.provider,
    step: input.step,
    callKind: input.kind ?? 'essencial',
    externalCallId: input.externalCallId ?? null,
    costCents: Math.max(0, Math.round(Number(costCents) || 0)),
    priceSource,
    outcome: input.outcome,
    durationMs: input.durationMs == null ? null : Math.max(0, Math.round(Number(input.durationMs)))
  };
  if (scope) { scope.rows.push(row); return row; }
  await insertCosts(null, [row]);
  return row;
}

/** Etapas registradas até agora no contexto atual (para a conta do teto e para o log de conferência). */
export function pendingStepCosts(): StepCost[] { return store.getStore()?.rows.slice() ?? []; }

let savepointCount = 0;
/**
 * Grava as etapas coletadas. Com `client` (dentro de transação) usa SAVEPOINT: um problema no registro não pode
 * desfazer a consulta nem o estorno já calculados.
 */
export async function persistStepCosts(client: PoolClient | null = null): Promise<number> {
  const scope = store.getStore();
  if (!scope || !scope.rows.length) return 0;
  const rows = scope.rows.splice(0, scope.rows.length);
  if (!env.QUERY_COST_LOG_ENABLED) return 0;
  if (!client) return insertCosts(null, rows);
  const name = `custo_etapa_${(savepointCount += 1)}`;
  await client.query(`SAVEPOINT ${name}`).catch(() => undefined);
  try {
    const done = await insertCosts(client, rows);
    await client.query(`RELEASE SAVEPOINT ${name}`).catch(() => undefined);
    return done;
  } catch (e) {
    await client.query(`ROLLBACK TO SAVEPOINT ${name}`).catch(() => undefined);
    await client.query(`RELEASE SAVEPOINT ${name}`).catch(() => undefined);
    log('warn', 'query_cost_persist_failed', { queryId: scope.queryId, steps: rows.length, error: e instanceof Error ? e.message : 'erro' });
    return 0;
  }
}

/**
 * Insere linha a linha: a chave única por (consulta, fonte, etapa, chamada externa) troca por atualização, então
 * reenvio, retry ou worker concorrente não somam custo duas vezes.
 */
async function insertCosts(client: PoolClient | null, rows: StepCost[]): Promise<number> {
  const q = client ?? pool;
  let done = 0;
  for (const r of rows) {
    try {
      await q.query(
        `INSERT INTO vehicle_query_costs(query_id,provider,step,call_kind,external_call_id,cost_cents,price_source,outcome,duration_ms)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (query_id,provider,step,external_call_id) WHERE cost_cents > 0
         DO UPDATE SET outcome=EXCLUDED.outcome, price_source=EXCLUDED.price_source, duration_ms=COALESCE(EXCLUDED.duration_ms, vehicle_query_costs.duration_ms)`,
        [r.queryId, r.provider, r.step, r.callKind, r.externalCallId, r.costCents, r.priceSource, r.outcome, r.durationMs]);
      done += 1;
    } catch (e) {
      log('warn', 'query_cost_row_rejected', { queryId: r.queryId, step: r.step, error: e instanceof Error ? e.message : 'erro' });
    }
  }
  return done;
}

/* ------------------------------------------------------------------ teto por consulta */

/** Teto definido fora do ambiente: é por aqui que o painel administrativo passa a escrever na fase dele. */
let capOverride: number | null | undefined;
export function configureCostCap(cents: number | null | undefined): void { capOverride = cents == null ? undefined : Math.max(0, Math.round(cents)); }

export interface CostCapState { capCents: number | null; origin: 'painel' | 'env' | 'nenhum' }
/** De onde vem o teto de custo por consulta: painel (fase seguinte) → variável da fonte → variável geral → nenhum. */
export function costCapState(fonte: string): CostCapState {
  if (capOverride != null) return { capCents: capOverride, origin: 'painel' };
  if (fonte === 'credify' && env.CREDIFY_COST_BUDGET_CENTS != null) return { capCents: env.CREDIFY_COST_BUDGET_CENTS, origin: 'env' };
  if (env.QUERY_COST_CAP_CENTS != null) return { capCents: env.QUERY_COST_CAP_CENTS, origin: 'env' };
  return { capCents: null, origin: 'nenhum' };
}

export interface BudgetDecision { allowed: boolean; reason: 'teto_atingido' | 'custo_nao_tabelado' | null; capCents: number | null; spentCents: number; costCents: number }
let warnedNoCap = false;

/**
 * Decide antes da chamada sair se ela cabe no teto da consulta. Diferente do controle antigo (`Spend.allow`, que só
 * segurava opcionais): com teto configurado, a chamada essencial também é barrada. O que é barrado vira
 * "fora da cobertura do pacote" / "não consultado" — nunca "nada consta".
 * Sem teto configurado nada é barrado, mas isso fica no log (uma vez por processo) em vez de ser silencioso.
 */
export async function assertBudget(queryId: string | null, fonte: string, step: string, custo: number | null, kind: CallKind = 'opcional'): Promise<BudgetDecision> {
  const cap = costCapState(fonte);
  const spent = await spentForQuery(queryId);
  if (cap.capCents === null) {
    if (!warnedNoCap) {
      warnedNoCap = true;
      log('warn', 'query_cost_cap_not_configured', { fonte, aviso: 'nenhum teto de custo por consulta; as chamadas seguem sem limite de valor' });
    }
    return { allowed: true, reason: null, capCents: null, spentCents: spent, costCents: custo ?? 0 };
  }
  if (custo == null) {
    // Essencial do caminho principal sai mesmo sem preço (senão o produto ficaria sem entrega); os extras não.
    if (kind === 'essencial') return { allowed: true, reason: null, capCents: cap.capCents, spentCents: spent, costCents: 0 };
    log('warn', 'query_cost_cap_unknown_price', { fonte, step, capCents: cap.capCents });
    return { allowed: false, reason: 'custo_nao_tabelado', capCents: cap.capCents, spentCents: spent, costCents: 0 };
  }
  if (spent + custo > cap.capCents) {
    log('warn', 'query_cost_cap_reached', { fonte, step, capCents: cap.capCents, spentCents: spent, costCents: custo });
    return { allowed: false, reason: 'teto_atingido', capCents: cap.capCents, spentCents: spent, costCents: custo };
  }
  return { allowed: true, reason: null, capCents: cap.capCents, spentCents: spent, costCents: custo };
}

/** Quanto a consulta já custou: o que está na memória + o que já foi gravado (outros processos incluídos). */
export async function spentForQuery(queryId: string | null): Promise<number> {
  const scope = store.getStore();
  const pending = scope ? scope.rows.reduce((s, r) => s + r.costCents, 0) : 0;
  const id = queryId ?? scope?.queryId ?? null;
  if (!id || !(await tableAvailable('vehicle_query_costs', 'costTableReady'))) return pending;
  try {
    const r = await pool.query(`SELECT COALESCE(SUM(cost_cents),0)::int AS cents FROM vehicle_query_costs WHERE query_id=$1`, [id]);
    return pending + Number(r.rows[0]?.cents ?? 0);
  } catch { return pending; }
}

/* ------------------------------------------------------------------ leitura para conferência */

export interface CostLine { step: string; provider: string; callKind: CallKind; costCents: number; priceSource: PriceSource; outcome: CostOutcome; durationMs: number | null; externalCallId: string | null; createdAt: string }

/** Etapas de uma consulta com o total. Sem dado pessoal: fonte, etapa, custo e desfecho. */
export async function stepsOfQuery(queryId: string): Promise<{ steps: CostLine[]; totalCents: number; unpricedSteps: number }> {
  const r = await pool.query(
    `SELECT step,provider,call_kind,cost_cents,price_source,outcome,duration_ms,external_call_id,created_at
       FROM vehicle_query_costs WHERE query_id=$1 ORDER BY created_at, step`, [queryId]);
  const steps: CostLine[] = r.rows.map((x) => ({
    step: String(x.step), provider: String(x.provider), callKind: x.call_kind as CallKind, costCents: Number(x.cost_cents),
    priceSource: x.price_source as PriceSource, outcome: x.outcome as CostOutcome, durationMs: x.duration_ms == null ? null : Number(x.duration_ms),
    externalCallId: x.external_call_id == null ? null : String(x.external_call_id), createdAt: String(x.created_at)
  }));
  return { steps, totalCents: steps.reduce((s, x) => s + x.costCents, 0), unpricedSteps: steps.filter((x) => x.priceSource === 'desconhecido').length };
}

export interface CostBucket {
  bucket: string; provider: string; product: string | null; queries: number; steps: number;
  costCents: number; confirmedCents: number; estimatedCents: number; blockedSteps: number; avgCostCents: number;
}

/** Total apurado por período (dia ou mês), fonte e produto. `estimatedCents` é o que não tem preço confirmado na fonte. */
export async function costTotals(input: { from?: string; to?: string; provider?: string; productId?: string; group?: 'day' | 'month' } = {}): Promise<CostBucket[]> {
  const group = input.group === 'month' ? 'month' : 'day';
  const where: string[] = [];
  const args: unknown[] = [group];
  if (input.from) { args.push(input.from); where.push(`c.created_at >= $${args.length}::date`); }
  if (input.to) { args.push(input.to); where.push(`c.created_at < ($${args.length}::date + interval '1 day')`); }
  if (input.provider) { args.push(input.provider); where.push(`c.provider = $${args.length}`); }
  if (input.productId) { args.push(input.productId); where.push(`q.product_id = $${args.length}`); }
  const r = await pool.query(
    `SELECT to_char(date_trunc($1::text, c.created_at), 'YYYY-MM-DD') AS bucket, c.provider, q.product_id,
            count(DISTINCT c.query_id)::int AS queries, count(*)::int AS steps,
            COALESCE(SUM(c.cost_cents),0)::int AS total_cents,
            COALESCE(SUM(c.cost_cents) FILTER (WHERE c.price_source <> 'desconhecido'),0)::int AS confirmed_cents,
            COALESCE(SUM(c.cost_cents) FILTER (WHERE c.price_source = 'desconhecido'),0)::int AS estimated_cents,
            count(*) FILTER (WHERE c.outcome = 'nao_cobrado')::int AS blocked_steps
       FROM vehicle_query_costs c JOIN vehicle_queries q ON q.id = c.query_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY 1,2,3 ORDER BY 1 DESC, total_cents DESC`, args);
  return r.rows.map((x) => {
    const costCents = Number(x.total_cents);
    const queries = Number(x.queries);
    return {
      bucket: String(x.bucket), provider: String(x.provider), product: x.product_id == null ? null : String(x.product_id),
      queries, steps: Number(x.steps), costCents, confirmedCents: Number(x.confirmed_cents),
      estimatedCents: Number(x.estimated_cents), blockedSteps: Number(x.blocked_steps),
      avgCostCents: costCents && queries ? Math.round(costCents / queries) : 0
    };
  });
}
