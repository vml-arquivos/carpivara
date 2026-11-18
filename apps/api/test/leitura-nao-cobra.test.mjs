import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import { integration, loadCore, uid, useTestEnv } from './helpers/db.mjs';
import { adminSession, hostRequest, startServer } from './helpers/server.mjs';

// Regra do produto: reabrir relatório, comparar, baixar PDF ou contestar nunca dispara consulta cobrada.
// A conta de chamadas é feita na Credify de mentira: cada acerto dela é uma consulta paga real.
const jwt = () => `h.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 86400 })).toString('base64url')}.s`;
const lienAnswer = { CONSULTA: {}, RESPOSTA: { CODIGO: '1', GRAVAME: { GRAVAMES: { REGISTRO_1: { NUMERO_RESTRICAO: '5', DATA_RESTRICAO: '2022-02-02', ESTADO_RESTRICAO: 'SP', NOME_AGENTE: 'BANCO DO BRASIL S.A.', DOCUMENTO_AGENTE: '00000000000191', DATA_CONTRATO: '2022-02-01', ESTADO_CONTRATO: 'SP', NUMERO_CONTRATO: 'X9', STATUS: 'ATIVO' } } } } };
// REN3J33 é a placa de teste com restrição financeira ativa: o relatório dela nasce em ALERT sem a resposta do /gravame.
const PLATE = 'REN3J33';

describe('leitura de relatório não cobra: nada de /gravame ao abrir, baixar, comparar, contestar ou validar', integration, () => {
  let pool; let mock; let app; let credify; let hits = []; let token; let sa; let apiKey;
  let premiumId; let lienId; let apiUserId;
  before(async () => {
    useTestEnv({ DATA_ENCRYPTION_KEY: 'test-data-encryption-key-0123456789abcdef' });
    ({ pool } = await loadCore());
    // O provedor de teste (mock) serve só para montar as consultas legadas; ele não tem chamada paga nenhuma.
    mock = await startServer({});
    credify = http.createServer((req, res) => {
      req.on('data', () => {});
      req.on('end', () => {
        hits.push(String(req.url).split('?')[0]);
        const send = (obj) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
        if (req.url === '/auth') return send({ Success: true, Dados: jwt() });
        if (req.url === '/gravame') return send(lienAnswer);
        return send({ CONSULTA: {}, RESPOSTA: { CODIGO: '2', DESCRICAORETORNO: 'NAO USADO NESTE TESTE' } });
      });
    });
    await new Promise((r) => credify.listen(0, '127.0.0.1', r));
    // O servidor que importa as asserções: fonte real, capaz de cobrar, com o backfill de gravame ligado.
    app = await startServer({
      DATA_PROVIDER: 'real', VEHICLE_API_PROVIDER: 'credify', CREDIFY_BASE_URL: `http://127.0.0.1:${credify.address().port}`,
      CREDIFY_CLIENT_ID: 'cid', CREDIFY_CLIENT_SECRET: 'sec', CREDIFY_GRAVAME_BACKFILL: 'true', PUBLIC_API_ENABLED: 'true', PLATE_CACHE_HOURS: '0',
      FIPE_PRIMARY_BASE_URL: 'http://127.0.0.1:9', FIPE_SECONDARY_BASE_URL: 'http://127.0.0.1:9'
    });
    const reg = await hostRequest(mock.base, '/api/auth/register', { method: 'POST', body: { name: 'Cliente Leitura', email: `${uid('lnc')}@cliente.local`, password: 'Senha-Forte-123!', acceptTerms: true, acceptPrivacy: true } });
    token = reg.json.token;
    apiUserId = reg.json.user.id;
    await pool.query('UPDATE wallets SET balance_cents=100000 WHERE user_id=$1', [apiUserId]);
    sa = await adminSession({ server: app, pool, role: 'SUPER_ADMIN' });
    const key = await hostRequest(app.base, '/api/account/api-keys', { method: 'POST', token, body: { name: 'ERP leitura' } });
    assert.equal(key.status, 201, key.text);
    apiKey = key.json.key;
    premiumId = await legacyQuery('PREMIUM');
    lienId = await legacyQuery('LIEN');
  });
  after(async () => { await app?.stop(); await mock?.stop(); credify?.close(); await pool.end(); });

  /** Retrato de consulta antiga: concluída, com a restrição financeira em ALERT e o bruto sem a resposta do /gravame. */
  async function legacyQuery(productId) {
    const r = await hostRequest(mock.base, '/api/queries', { method: 'POST', token, body: { plate: PLATE, productId } });
    assert.equal(r.status, 201, r.text);
    const id = r.json.id;
    const stored = await pool.query(`SELECT q.status, (r.raw_enc IS NOT NULL) AS has_raw, r.normalized::text AS n
      FROM vehicle_queries q JOIN vehicle_query_results r ON r.query_id=q.id WHERE q.id=$1`, [id]);
    const row = stored.rows[0];
    assert.equal(row.status, 'SUCCESS', 'a consulta legada está concluída'); assert.ok(row.has_raw, 'a consulta legada tem o bruto cifrado guardado');
    assert.ok(!row.n.includes('BANCO DO BRASIL'), 'sem banco, contrato e datas: é o retrato da consulta antiga');
    // A fixture é trazida para o valor que a fonte REAL publica em RESTRICAOFINAN numa consulta com alienação
    // ("ALIENACAO FIDUCIARIA"). O texto de demonstração do banco de teste ("GRAVAME FICTICIO PARA TESTE") não é um valor
    // do domínio da Credify: desde o vocabulário único de estados (layers.ts) um texto que não afirma ocorrência nem
    // ausência é lido como "sem retorno" (E3), nunca como alerta — por isso a asserção abaixo, que confere o mesmo
    // predicado SQL de lienRefresh.ts, exige o payload real de uma consulta legada. Verificado antes de mexer aqui:
    // com o payload real o predicado continua elegendo a consulta (queriesMissingLien) e continua excluindo as que já
    // têm a resposta do /gravame, ou seja, o predicado não ficou cego — a fixture é que estava escrita fora do formato.
    await rewriteLegacyLien(id);
    // É exatamente o predicado que o backfill pago usa para decidir a consulta: a fixture tem de cair nele.
    const eligible = await pool.query(`SELECT 1 FROM vehicle_queries q JOIN vehicle_query_results r ON r.query_id=q.id
      WHERE q.id=$1 AND q.status='SUCCESS' AND q.product_id IN ('PREMIUM','LIEN') AND r.raw_enc IS NOT NULL AND r.normalized ? 'v2'
        AND jsonb_path_exists(r.normalized, '$.v2.sections[*].items[*] ? (@.key=="RESTRICAOFINAN" && @.state=="ALERT")')`, [id]);
    assert.equal(eligible.rowCount, 1, 'a consulta antiga está no alvo do backfill de gravame');
    const { decryptRaw } = await import('../dist/lib/rawStore.js');
    const storedRaw = await pool.query('SELECT raw_enc FROM vehicle_query_results WHERE query_id=$1', [id]);
    assert.equal(decryptRaw(storedRaw.rows[0].raw_enc).gravame, undefined, 'o bruto não tem a resposta de /gravame: ali é onde a leitura antiga cobrava');
    return id;
  }

  /** Reescreve o bruto e o relatório guardados com o payload de uma consulta legada de verdade: alienação afirmada no
   * cadastro (RESTRICAOFINAN em ALERT) e nenhuma resposta do /gravame. Não toca em mais nenhum campo. */
  async function rewriteLegacyLien(queryId) {
    const { decryptRaw, encryptRaw } = await import('../dist/lib/rawStore.js');
    const { normalizeBdrp } = await import('../dist/normalizer.js');
    const { NORMALIZER_VERSION } = await import('../dist/report/normalizeV2.js');
    const findReturn = (o, depth = 0) => {
      if (!o || typeof o !== 'object' || depth > 5) return null;
      for (const [k, v] of Object.entries(o)) {
        const key = k.toUpperCase();
        if (key === 'RESPOSTA' && v && typeof v === 'object' && v.VEICULOSBDRP && v.VEICULOSBDRP.RETORNO) return v.VEICULOSBDRP.RETORNO;
        const inner = findReturn(v, depth + 1); if (inner) return inner;
      }
      return null;
    };
    const stored = await pool.query('SELECT raw_enc FROM vehicle_query_results WHERE query_id=$1', [queryId]);
    const raw = decryptRaw(stored.rows[0].raw_enc);
    const ret = findReturn(raw);
    assert.ok(ret, 'o bruto da consulta legada tem o RETORNO do cadastro');
    ret.RESTRICAOFINAN = 'ALIENACAO FIDUCIARIA';
    ret.RESTRICAONOMEAGENTE = ''; ret.NUMEROCONTRATOFINANCEIRA = ''; ret.RESTRICAODATAINCLUSAO = ''; ret.CGCFINANCEIRA = '';
    const fresh = normalizeBdrp(raw);
    await pool.query('UPDATE vehicle_query_results SET normalized=$2::jsonb, raw_enc=$3, normalizer_version=$4 WHERE query_id=$1',
      [queryId, JSON.stringify(fresh), encryptRaw(raw), NORMALIZER_VERSION]);
  }

  /** Zera o contador e devolve o que a Credify recebeu depois disso (login não é consulta paga). */
  function reset() { hits = []; }
  const paid = () => hits.filter((h) => h !== '/auth');
  const code = (id) => String(id).slice(0, 8).toUpperCase();

  it('(a) abrir o relatório em JSON não chama a fonte paga', async () => {
    for (const id of [premiumId, lienId]) {
      reset();
      const r = await hostRequest(app.base, `/api/queries/${id}/report`, { token });
      assert.equal(r.status, 200, r.text);
      assert.deepEqual(paid(), [], 'abrir o relatório não pode consultar o provedor pago');
      assert.equal(r.json.verificationCode, code(id), 'o código de validação é o de sempre');
      const gravame = r.json.report.sections.find((s) => s.key === 'GRAVAME');
      assert.ok(gravame, 'a seção de gravame continua no relatório');
      assert.match(JSON.stringify(gravame), /RESTRICAOFINAN/, 'a alienação segue visível para o cliente');
      assert.ok(!JSON.stringify(gravame).includes('BANCO DO BRASIL'), 'e o relatório sai como estava guardado, sem completude paga');
    }
  });

  it('(b) baixar o PDF do relatório não chama a fonte paga', async () => {
    for (const id of [premiumId, lienId]) {
      reset();
      const res = await app.request(`/api/queries/${id}/report/pdf`, { token });
      const buf = Buffer.from(await res.arrayBuffer());
      assert.equal(res.status, 200, `pdf ${res.status}`);
      assert.equal(res.headers.get('content-type'), 'application/pdf');
      assert.equal(buf.subarray(0, 5).toString('latin1'), '%PDF-', 'PDF entregue, não vazio');
      assert.ok(buf.length > 1000, `PDF com ${buf.length} bytes`);
      assert.match(String(res.headers.get('content-disposition')), new RegExp(code(id)));
      assert.deepEqual(paid(), [], 'gerar o PDF de novo não gasta consulta paga');
    }
  });

  it('(c) abrir a versão de impressão não chama a fonte paga', async () => {
    for (const id of [premiumId, lienId]) {
      reset();
      const r = await hostRequest(app.base, `/api/queries/${id}/report/print`, { token });
      assert.equal(r.status, 200, r.text);
      assert.match(String(r.headers['content-type']), /html/);
      assert.match(r.text, new RegExp(PLATE), 'a placa continua na página impressa');
      assert.deepEqual(paid(), []);
    }
  });

  it('(d) gerar o dossiê da placa não chama a fonte paga', async () => {
    reset();
    const res = await app.request(`/api/vehicles/${PLATE}/dossier.pdf`, { token });
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(res.status, 200, `dossie ${res.status}`);
    assert.equal(buf.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.ok(buf.length > 1000, `dossiê com ${buf.length} bytes`);
    assert.deepEqual(paid(), [], 'reunir relatórios salvos é leitura pura');
  });

  it('(e) contestar um dado não chama a fonte paga', async () => {
    reset();
    const r = await hostRequest(app.base, `/api/queries/${premiumId}/report/dispute`, { method: 'POST', token, body: { field: 'RESTRICAOFINAN', message: 'Esta alienação não existe no meu veículo, por favor conferir.' } });
    assert.equal(r.status, 201, r.text);
    assert.ok(r.json.id, 'a contestação virou chamado');
    assert.deepEqual(paid(), []);
  });

  it('(f) conferir anúncio não chama a fonte paga, com ou sem snapshot', async () => {
    for (const path of [`/api/queries/${premiumId}/ad-check`, `/api/queries/${premiumId}/ad-check?snapshot=1`]) {
      reset();
      const r = await hostRequest(app.base, path, { method: 'POST', token, body: { priceCents: 4500000, model: 'GOL' } });
      assert.equal(r.status, 200, r.text);
      assert.deepEqual(paid(), [], 'a conferência de anúncio só lê o que está guardado');
    }
  });

  it('(g) a rota v1 de PDF por chave de API não chama a fonte paga', async () => {
    reset();
    const res = await app.request(`/api/v1/vehicles/${lienId}/pdf`, { headers: { authorization: `Bearer ${apiKey}` } });
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(res.status, 200, `v1 pdf ${res.status}`);
    assert.equal(buf.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.ok(buf.length > 1000);
    assert.deepEqual(paid(), [], 'quem integra por API também não paga por reabertura');
  });

  it('a entrega continua a mesma: o mesmo relatório pelos dois servidores bate no JSON, salvos os endereços de cada um', async () => {
    // O servidor de teste nunca teve fonte paga; o outro tem e poderia cobrar. Entregar o mesmo corpo prova que a leitura não mudou.
    const scrub = (o) => JSON.parse(JSON.stringify(o).replace(/http:\/\/127\.0\.0\.1:\d+/g, 'http://servidor'));
    for (const id of [premiumId, lienId]) {
      reset();
      const viaApp = await hostRequest(app.base, `/api/queries/${id}/report`, { token });
      const viaMock = await hostRequest(mock.base, `/api/queries/${id}/report`, { token });
      assert.deepEqual(paid(), [], 'nem um dos dois caminhos cobrou nada');
      assert.equal(viaApp.status, 200); assert.equal(viaMock.status, 200);
      assert.deepEqual(scrub(viaApp.json), scrub(viaMock.json), 'a troca do padrão de enriquecimento não muda o que o cliente recebe');
      assert.equal(viaApp.json.verificationCode, viaMock.json.verificationCode);
      assert.equal(viaApp.json.productName, viaMock.json.productName);
    }
  });

  it('(h) a completude continua disponível: só pela ação explícita do administrador', async () => {
    const preview = await sa.call('/api/admin/queries/refresh-gravame', { method: 'POST', body: {} });
    assert.equal(preview.status, 200, preview.text);
    assert.ok(Number(preview.json.pending) >= 1, 'a lista administrativa ainda vê a consulta legada incompleta');

    reset();
    const stillReading = await hostRequest(app.base, `/api/queries/${lienId}/report`, { token });
    assert.equal(stillReading.status, 200);
    assert.deepEqual(paid(), [], 'antes do clique do administrador, nada é cobrado');

    const done = await sa.call(`/api/admin/queries/${lienId}/refresh-gravame`, { method: 'POST' });
    assert.equal(done.status, 200, done.text);
    assert.equal(done.json.result, 'UPDATED');
    assert.deepEqual(paid(), ['/gravame'], 'a rota administrativa faz exatamente uma chamada paga');

    const n = (await pool.query('SELECT normalized::text AS n FROM vehicle_query_results WHERE query_id=$1', [lienId])).rows[0].n;
    assert.match(n, /BANCO DO BRASIL S\.A\./, 'o banco da alienação entrou no relatório pela via administrativa');
    const opened = await hostRequest(app.base, `/api/queries/${lienId}/report`, { token });
    assert.equal(opened.status, 200);
    assert.deepEqual(paid(), ['/gravame'], 'reabrir depois da completude também não cobra de novo');
    const audited = await pool.query(`SELECT 1 FROM audit_logs WHERE action='QUERY_GRAVAME_REFRESHED' AND entity_id=$1`, [lienId]);
    assert.ok(audited.rowCount >= 1, 'a completude paga fica registrada em auditoria');
  });
});
