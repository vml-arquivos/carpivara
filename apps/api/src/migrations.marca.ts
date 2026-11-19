import type { Migration } from './migrations.js';

/**
 * Migrações da marca BL Buscarr. As migrações antigas (001–090) ficam como foram escritas; este ajuste, rodado por último,
 * troca o nome da marca anterior nos textos que elas gravaram no banco (modelos de relatório, autor dos artigos e
 * respostas prontas do suporte). Só mexe em linhas que ainda têm o nome antigo e é seguro rodar de novo.
 */
const OLD = 'Placa na Mão';
const NEW_NAME = 'BL Buscarr';

/** Expressão SQL que troca "da/na/à/pela/a/A Placa na Mão" pelo texto com o artigo certo e, depois, o nome puro. */
function replaceExpr(col: string): string {
  const rules: Array<[string, string]> = [
    ['\\mda ' + OLD, 'do ' + NEW_NAME], ['\\mDa ' + OLD, 'Do ' + NEW_NAME],
    ['\\mna ' + OLD, 'no ' + NEW_NAME], ['\\mNa ' + OLD, 'No ' + NEW_NAME],
    ['\\mà ' + OLD, 'ao ' + NEW_NAME], ['\\mÀ ' + OLD, 'Ao ' + NEW_NAME],
    ['\\mpela ' + OLD, 'pelo ' + NEW_NAME], ['\\mPela ' + OLD, 'Pelo ' + NEW_NAME],
    ['\\ma ' + OLD, 'o ' + NEW_NAME], ['\\mA ' + OLD, 'O ' + NEW_NAME],
    [OLD, NEW_NAME]
  ];
  return rules.reduce((expr, [from, to]) => `regexp_replace(${expr}, '${from}', '${to}', 'g')`, col);
}

export const brandMigrations: Migration[] = [
  {
    id: '091_marca_bl_buscar',
    name: 'Marca BL Buscarr: troca o nome da marca anterior nos textos gravados pelas migrações antigas (modelos de relatório, autor dos artigos, respostas prontas do suporte)',
    up: async (client) => {
      await client.query(`UPDATE report_templates SET config = (${replaceExpr('config::text')})::jsonb WHERE config::text LIKE '%${OLD}%'`);
      await client.query(`UPDATE articles SET author = ${replaceExpr('author')} WHERE author LIKE '%${OLD}%'`);
      await client.query(`ALTER TABLE articles ALTER COLUMN author SET DEFAULT 'Equipe ${NEW_NAME}'`);
      await client.query(`UPDATE support_canned_replies SET body = ${replaceExpr('body')} WHERE body LIKE '%${OLD}%'`);
    },
    down: async () => { /* só ajuste de texto da marca: nada a desfazer */ }
  }
];
