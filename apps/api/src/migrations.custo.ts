import type { Migration } from './migrations.js';
/**
 * Custo por etapa de consulta. Tudo aqui é aditivo: tabelas novas, nenhuma coluna alterada nas tabelas que já existem,
 * e nenhum valor de custo de produto mexido. O `down` desfaz exatamente o que o `up` criou (drop de tabela), sem
 * subtrair valor de coluna — quem precisa reverter não perde nada do que existia antes.
 */

/** Data de referência da tabela de preços: a que vale enquanto o painel não cadastrar uma vigência nova. */
const PRECO_VIGENCIA = '2026-01-01T00:00:00Z';

/**
 * Preço unitário de cada consulta da Credify, em centavos, retirado da soma que a migração 071 já usava
 * (custo do produto = soma das chamadas). `null` = preço não publicado em lugar nenhum do contrato: a etapa fica
 * marcada como 'desconhecido' e a rota que depende dela não é elegível para roteamento até alguém preencher.
 */
const PRECOS_CREDIFY: Array<[string, number | null, string, string]> = [
  ['debitosrestricoesproprietarios', 215, '487', 'Base de cadastro, débitos, restrições e alienação'],
  ['indiciosinistro', 133, '450', 'Indício de sinistro'],
  ['veicularbnacionalonline', 117, '369', 'Cadastro nacional (restrições 01 a 04 e situação do chassi)'],
  ['leilaoconjugado', 1676, '448', 'Confirmação de passagem por leilão'],
  ['precificadorfipe', 11, '454', 'FIPE pela placa'],
  ['gravame', 137, '533', 'Gravame detalhado: banco, CNPJ, contrato e datas'],
  ['renajud', 160, '483', 'Restrições judiciais'],
  ['historicoproprietario', 800, '458', 'Histórico de proprietários'],
  ['renainf', 64, '536', 'Infrações e multas detalhadas'],
  ['historicoroubofurto', 731, '456', 'Histórico de roubo e furto (condicional: só quando a base acusa)'],
  ['recall', 197, '452', 'Campanha de recall (condicional: só quando a base acusa)'],
  ['veiculototal', null, '467', 'Pacote fechado: custo unitário não publicado na tabela do contrato'],
  ['veiculoproprietarioplaca', null, '514', 'Sem preço publicado: a migração 089 somou 53 centavos por suposição, não por tabela'],
  ['farolleilao', null, '517', 'Sem preço publicado: pré-consulta usada como filtro do leilão conjugado']
];

/** Fontes fora da Credify: registradas para aparecerem com o estado real no painel, ainda sem preço. */
const PRECOS_OUTRAS: Array<[string, string, number | null, string]> = [
  ['anycar', 'leilao-simples', null, 'Histórico de leilão (AnyCar): custo por chamada não publicado'],
  ['consultarplaca', 'cadastro-placa', null, 'Cadastro pela placa (ConsultarPlaca): custo por crédito do plano, não tabelado'],
  ['consultarplaca', 'cadastro-chassi', null, 'Cadastro pelo chassi (ConsultarPlaca): custo por crédito do plano, não tabelado'],
  ['fipe', 'tabela-fipe', 0, 'Tabela FIPE pública: nenhuma chamada cobrada']
];

export const costMigrations: Migration[] = [
  {
    id: '092_custo_por_etapa',
    name: 'Custo de cada etapa paga por consulta (vehicle_query_costs) e preço por fonte/etapa (source_call_prices), com o que não tem preço publicado marcado como desconhecido',
    up: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS source_call_prices (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          source text NOT NULL,
          step text NOT NULL,
          cost_cents integer CHECK (cost_cents IS NULL OR cost_cents >= 0),
          valid_from timestamptz NOT NULL DEFAULT now(),
          valid_to timestamptz,
          note text,
          UNIQUE (source, step, valid_from)
        );
        CREATE INDEX IF NOT EXISTS source_call_prices_lookup_idx ON source_call_prices(source, step, valid_from DESC);
      `);
      for (const [step, cost, consulta, note] of PRECOS_CREDIFY) {
        await client.query(
          `INSERT INTO source_call_prices(source,step,cost_cents,valid_from,note) VALUES('credify',$1,$2,$3,$4) ON CONFLICT (source,step,valid_from) DO NOTHING`,
          [step, cost, PRECO_VIGENCIA, `IdConsulta ${consulta}. ${note}`]
        );
      }
      for (const [source, step, cost, note] of PRECOS_OUTRAS) {
        await client.query(
          `INSERT INTO source_call_prices(source,step,cost_cents,valid_from,note) VALUES($1,$2,$3,$4,$5) ON CONFLICT (source,step,valid_from) DO NOTHING`,
          [source, step, cost, PRECO_VIGENCIA, note]
        );
      }
      await client.query(`
        CREATE TABLE IF NOT EXISTS vehicle_query_costs (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          query_id uuid NOT NULL REFERENCES vehicle_queries(id) ON DELETE CASCADE,
          provider text NOT NULL,
          step text NOT NULL,
          call_kind text NOT NULL DEFAULT 'essencial' CHECK (call_kind IN ('essencial','opcional','condicional','backfill')),
          external_call_id text,
          cost_cents integer NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
          price_source text NOT NULL DEFAULT 'desconhecido' CHECK (price_source IN ('tabela_admin','env','desconhecido')),
          outcome text NOT NULL DEFAULT 'cobrado' CHECK (outcome IN ('cobrado','sem_retorno','falha','nao_cobrado')),
          duration_ms integer,
          created_at timestamptz NOT NULL DEFAULT now()
        );
      `);
      // Duas linhas para a mesma etapa paga da mesma consulta não podem existir: reenvio, retry ou worker concorrente
      // atualizam a linha que já está lá em vez de somar custo de novo.
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicle_query_costs_step
          ON vehicle_query_costs(query_id,provider,step,external_call_id) NULLS NOT DISTINCT
          WHERE cost_cents > 0;
        CREATE INDEX IF NOT EXISTS idx_vehicle_query_costs_query ON vehicle_query_costs(query_id);
        CREATE INDEX IF NOT EXISTS idx_vehicle_query_costs_created ON vehicle_query_costs(created_at);
      `);
    },
    down: async (client) => {
      // Nada do que existia antes é tocado: as duas tabelas são novas e o histórico delas vai junto com a reversão.
      await client.query(`DROP TABLE IF EXISTS vehicle_query_costs`);
      await client.query(`DROP TABLE IF EXISTS source_call_prices`);
    }
  },
  {
    id: '093_guardas_de_chamada_persistidas',
    name: 'Contador de chamadas pagas em banco (provider_call_log), para que reinício do processo ou segunda réplica não zere o teto de volume',
    up: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS provider_call_log (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          scope text NOT NULL,
          provider text NOT NULL,
          step text,
          called_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_provider_call_log_scope_time ON provider_call_log(scope, called_at);
      `);
    },
    down: async (client) => {
      await client.query(`DROP TABLE IF EXISTS provider_call_log`);
    }
  }
];
