// Prova de cenário: uma consulta legada de verdade (payload real da Credify, alienação no cadastro, sem raw.gravame)
// ainda é elegível ao backfill? E uma que já tem a resposta do /gravame continua fora do alvo?
import { loadCore, uid, useTestEnv } from './test/helpers/db.mjs';
useTestEnv({ DATA_ENCRYPTION_KEY: 'test-data-encryption-key-0123456789abcdef' });
const { pool } = await loadCore();
const { normalizeBdrp } = await import('./dist/normalizer.js');
const { NORMALIZER_VERSION } = await import('./dist/report/normalizeV2.js');
const { encryptRaw, decryptRaw } = await import('./dist/lib/rawStore.js');
const { queriesMissingLien } = await import('./dist/lib/lienRefresh.js');

const user = await pool.query(`INSERT INTO users(email,name,role,password_hash) VALUES($1,'Legado','CLIENTE','x') RETURNING id`, [`${uid('leg')}@cliente.local`]);
const userId = user.rows[0].id;

const bdrp = (restricaofinan) => ({
  placa: 'ABC1D23',
  data: {
    CONSULTA: { CODIGORESPOSTA: '1', IDCONSULTA: '487' },
    RESPOSTA: { CODIGO: '1', VEICULOSBDRP: { DESCRICAORETORNO: 'SUCESSO', RETORNO: {
      PLACA: 'ABC1D23', MARCA: 'VOLKSWAGEN', MODELO: 'GOL 1.0', VEIANOFABR: '2020', VEIANOMODELO: '2021', COR: 'PRATA', COMBUSTIVEL: 'FLEX',
      CHASSI: '9BWZZZ377VT004251', RENAVAM: '00000000000', UF: 'SP', MUNICIPIO: 'SAO PAULO', TIPO: 'AUTOMOVEL', ESPECIE: 'PASSAGEIRO',
      EXISTE_ERRO: '0', RESTRICAOFINAN: restricaofinan, RESTRICAONOMEAGENTE: '', NUMEROCONTRATOFINANCEIRA: '', RESTRICAODATAINCLUSAO: '', CGCFINANCEIRA: '',
      RESJUDICIAL: 'NADA CONSTA', RESFURTO: 'NADA CONSTA', RECALL: 'NAO POSSUI RECALL', SITUACAOVEICULO: 'CIRCULACAO'
    } } }
  }
});

async function seed(label, productId, raw) {
  const q = await pool.query(`INSERT INTO vehicle_queries(user_id,plate,product_id,status,credits_cost,price_cents,charge_source,provider,search_type,completed_at)
    VALUES($1,'ABC1D23',$2,'SUCCESS',1,1000,'WALLET','credify','PLATE',now()) RETURNING id`, [userId, productId]);
  const id = q.rows[0].id;
  const normalized = normalizeBdrp(raw);
  await pool.query('INSERT INTO vehicle_query_results(query_id,normalized,raw_response,raw_enc,normalizer_version) VALUES($1,$2::jsonb,$3::jsonb,$4,$5)',
    [id, JSON.stringify(normalized), JSON.stringify({ stored: true }), encryptRaw(raw), NORMALIZER_VERSION]);
  const item = (normalized.v2.sections ?? []).flatMap((s) => s.items).find((i) => i.key === 'RESTRICAOFINAN');
  console.log(`  ${label}: item RESTRICAOFINAN → state=${item?.state} sourceState=${item?.sourceState} display=${JSON.stringify(String(item?.display ?? '').slice(0, 40))}`);
  return id;
}

// 1) consulta legada REAL: alienação como a Credify publica, sem bloco de gravame
const legada = await seed('legada PREMIUM (ALIENACAO FIDUCIARIA, sem raw.gravame)', 'PREMIUM', bdrp('ALIENACAO FIDUCIARIA'));
// 2) legada já completada: tem a resposta do /gravame → não pode entrar no alvo
const comGravame = bdrp('ALIENACAO FIDUCIARIA');
comGravame.gravame = { data: { CONSULTA: {}, RESPOSTA: { CODIGO: '1', GRAVAME: { GRAVAMES: { REGISTRO_1: { NOME_AGENTE: 'BANCO DO BRASIL S.A.' } } } } } };
const jaCompleta = await seed('legada PREMIUM já com raw.gravame', 'PREMIUM', comGravame);
// 3) legada sem alienação alguma → fora do alvo
const limpa = await seed('legada PREMIUM (NADA CONSTA)', 'PREMIUM', bdrp('NADA CONSTA'));
// 4) payload do banco de teste de hoje (texto fictício), para mostrar o que o predicado deixou de ver
const ficticia = await seed('sandbox (GRAVAME FICTICIO PARA TESTE)', 'PREMIUM', bdrp('GRAVAME FICTICIO PARA TESTE'));

const found = await queriesMissingLien();
const has = (id) => found.includes(id);
console.log('queriesMissingLien():', found.length, 'consulta(s)');
console.log('  legada real detectada?', has(legada));
console.log('  já completa (tem /gravame) fica fora?', !has(jaCompleta));
console.log('  sem alienação fica fora?', !has(limpa));
console.log('  texto fictício do seed detectado?', has(ficticia));

// e o predicado de ensureLienDetail (o mesmo do teste), para o mesmo par de casos
const pred = async (id) => (await pool.query(`SELECT 1 FROM vehicle_queries q JOIN vehicle_query_results r ON r.query_id=q.id
  WHERE q.id=$1 AND q.status='SUCCESS' AND q.product_id IN ('PREMIUM','LIEN') AND r.raw_enc IS NOT NULL AND r.normalized ? 'v2'
    AND jsonb_path_exists(r.normalized, '$.v2.sections[*].items[*] ? (@.key=="RESTRICAOFINAN" && @.state=="ALERT")')`, [id])).rowCount;
console.log('  predicado SQL — legada real:', await pred(legada), '| já completa:', await pred(jaCompleta), '| fictícia:', await pred(ficticia));

await pool.end();
