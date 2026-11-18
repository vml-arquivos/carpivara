import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { useTestEnv } from './helpers/db.mjs';

/**
 * Estados semânticos de "não há ocorrência" (diretiva do dono do produto):
 *   E1 ocorrência encontrada · E2 nada consta confirmado pela fonte · E3 sem retorno · E4 fora da cobertura · E5 consulta indisponível.
 * Ausência de campo, erro, timeout ou seção não contratada jamais pode ser lida como "nada consta".
 * Cobre os 12 pontos da auditoria `auditoria/C-matriz-cobertura.md` §8.
 */
useTestEnv();
const { buildReportV2, viewReport } = await import('../dist/report/normalizeV2.js');
const { classifyText, flagIsClear, buildLayeredEnvelope, STATE_LINE, STATE_LABEL, SOURCE_STATES, flagText } = await import('../dist/report/layers.js');
const { leilaoLevel, leilaoAnalyses } = await import('../dist/report/analiseLeilao.js');
const { buildAdvice } = await import('../dist/report/advice.js');
const { toAuctionPiece, queryAnycarAuction } = await import('../dist/providers/anycarProvider.js');
const { CredifyVehicleProvider, resetCredifyTokenCache } = await import('../dist/providers/credifyProvider.js');

const read = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const vt = read('veiculototal-sucesso.json');
const base = read('exemplo-retorno-provedor.json');
const item = (r, key) => r.sections.flatMap((s) => s.items).find((i) => i.key === key);
const jwt = () => `h.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 86400 })).toString('base64url')}.s`;
const consulta = (id) => ({ CODIGORESPOSTA: '1', DATAHORA: '01/01/2026 10:00:00', LOGON: '1', IDCONSULTA: id });
const ok = (id, resposta) => ({ CONSULTA: consulta(id), RESPOSTA: { CODIGO: '1', ...resposta } });
const withFlags = (flags) => { const c = structuredClone(base); Object.assign(c.RESPOSTA.VEICULOSBDRP.RETORNO, flags); return c; };
/** Bloco do Veículo Total com código posicional próprio. */
const withBlock = (name, patch, code) => { const x = structuredClone(vt); x.RESPOSTA[name] = patch; if (code) { const i = ['INDICIOSINISTROVEICULAR', 'RECALL', 'HISTORICOROUBOFURTO', 'LEILAOCONJUGADO', 'HISTORICOPROPRIETARIO', 'VEICULARBNACIONAL', 'PRECIFICADORFIPE', 'VEICULOSBDRP'].indexOf(name); x.RESPOSTA.CODIGO[i] = code; } return x; };

function fakeFetch(routes) {
  const calls = []; const bodies = {};
  const fn = async (url, init) => {
    const path = new URL(String(url)).pathname;
    calls.push(path);
    if (init?.body) bodies[path] = String(init.body);
    if (path === '/auth') return new Response(JSON.stringify({ Success: true, Dados: jwt() }), { status: 200 });
    const h = routes[path];
    if (!h) throw new Error(`chamada inesperada: ${path}`);
    if (h.status && h.status >= 400) return new Response(JSON.stringify(h.body ?? {}), { status: h.status });
    return new Response(JSON.stringify(h.body ?? h), { status: 200 });
  };
  fn.paid = () => calls.filter((c) => c !== '/auth');
  fn.bodies = bodies;
  return fn;
}
const opts = (fetchImpl) => ({ baseUrl: 'https://api.credify.test', clientId: 'cid', clientSecret: 'sec', method: 'post', timeoutMs: 3000, fetchImpl });
const layeredItems = async (routes, productId = 'COMPLETE', sources = undefined) => {
  resetCredifyTokenCache();
  const f = fakeFetch(routes);
  const out = await new CredifyVehicleProvider(opts(f)).queryByPlate('AAA0000', { productId, ...(sources ? { sources } : {}) });
  return { out, f, items: new Map(buildReportV2(out.raw).sections.flatMap((s) => s.items).map((i) => [i.key, i])), report: buildReportV2(out.raw) };
};
const baseLayers = (extra = {}) => ({ '/debitosrestricoesproprietarios': base, '/indiciosinistro': ok('450', { DESCRICAORETORNO: 'Sucesso', INDICIODESINISTRO: '0' }), '/veicularbnacionalonline': ok('369', { DESCRICAORETORNO: 'SUCESSO', PLACA: 'AAA0000', CHASSI: '9BWZZZ377VT004251', MARCA: 'VW', MODELO: 'GOL' }), '/leilaoconjugado': { CONSULTA: consulta('448'), RESPOSTA: { CODIGO: '2', DESCRICAORETORNO: 'O VEICULO NAO FOI APRESENTADO NA BASE DE LEILAO.' } }, ...extra });

// ─────────────────────────────────────────────────────────────────────────────
// Item 1 — vocabulário único e marcadores "não informado / não disponível"
// ─────────────────────────────────────────────────────────────────────────────
test('1. vocabulário único: os cinco estados existem e classificam o texto da fonte', () => {
  assert.deepEqual([...SOURCE_STATES].sort(), ['CONFIRMED_NONE', 'NO_RETURN', 'OCCURRENCE', 'OUT_OF_SCOPE', 'UNAVAILABLE']);
  assert.match(STATE_LABEL.CONFIRMED_NONE, /nada consta/i);
  assert.equal(classifyText('NAO INFORMADO'), 'NO_RETURN');
  assert.equal(classifyText('NAO DISPONIVEL'), 'NO_RETURN');
  assert.equal(classifyText('NAO LOCALIZADO'), 'NO_RETURN');
  assert.equal(classifyText('N/A'), 'NO_RETURN');
  assert.equal(classifyText('INDEFINIDO'), 'NO_RETURN');
  assert.equal(classifyText('NADA CONSTA'), 'CONFIRMED_NONE');
  assert.equal(classifyText('SEM RESTRICAO'), 'CONFIRMED_NONE');
  assert.equal(classifyText('O VEICULO NAO FOI APRESENTADO NA BASE DE LEILAO.'), 'CONFIRMED_NONE');
  assert.equal(classifyText('CONSTA REGISTRO DE ROUBO'), 'OCCURRENCE');
  assert.equal(classifyText('ERRO'), 'UNAVAILABLE');
  assert.equal(classifyText('CONSULTA EM ANDAMENTO'), 'NO_RETURN');
  // texto que o sistema não reconhece não tem estado: ninguém pode ler como ausência
  assert.equal(classifyText('BLA BLA QUARENTA E DOIS'), undefined);
  // nunca "limpo" (item 1: esses marcadores não iníbem a consulta complementar)
  for (const t of ['NAO INFORMADO', 'NAO DISPONIVEL', 'NAO LOCALIZADO', '', null, []]) assert.equal(flagIsClear(t), false, String(t));
  assert.equal(flagIsClear('NADA CONSTA'), true);
  assert.equal(flagIsClear('NAO POSSUI RECALL'), true);
  assert.equal(flagText('  NADA CONSTA '), 'NADA CONSTA');
});

test('1. marcador "NAO INFORMADO" no cadastro não supre a compra de /recall e /historicoroubofurto', async () => {
  const { f, items } = await layeredItems(baseLayers({
    '/debitosrestricoesproprietarios': withFlags({ RECALL: 'NAO INFORMADO', RESFURTO: 'NAO DISPONIVEL' }),
    '/recall': ok('452', { DESCRICAORETORNO: 'SUCESSO', REGISTRO_1: { MONTADORA: 'VW', DESCRICAO: 'CAMPANHA X' } }),
    '/historicoroubofurto': ok('456', { DESCRICAORETORNO: 'SUCESSO', DESCRICAOOCORRENCIA: 'FURTO CONSUMADO', UF_DUT: 'DF' })
  }));
  assert.ok(f.paid().includes('/recall'), 'compra /recall');
  assert.ok(f.paid().includes('/historicoroubofurto'), 'compra /historicoroubofurto');
  assert.equal(items.get('VT_ROUBOFURTO').state, 'ALERT', 'a consulta extra achou a ocorrência que o marcador não souzia dizer');
  assert.equal(items.get('VT_RECALL').state, 'ALERT');
});

test('1. marcador "NAO INFORMADO" nunca vira "nada consta" no relatório', () => {
  const r = buildReportV2({ RESPOSTA: { CODIGO: '1', VEICULOSBDRP: { DESCRICAORETORNO: 'SUCESSO', RETORNO: { ...base.RESPOSTA.VEICULOSBDRP.RETORNO, RESFURTO: 'NAO INFORMADO', RESJUDICIAL: 'NAO DISPONIVEL', DEBIPVA: 'NAO LOCALIZADO' } } } });
  assert.equal(item(r, 'RESFURTO').state, 'NOT_PROVIDED');
  assert.equal(item(r, 'RESJUDICIAL').state, 'NOT_PROVIDED');
  assert.equal(item(r, 'DEBIPVA').state, 'NOT_PROVIDED', 'dinheiro sem valor não é "sem débito"');
  for (const k of ['RESFURTO', 'RESJUDICIAL', 'DEBIPVA']) {
    const it = item(r, k);
    assert.equal(it.state, 'NOT_PROVIDED');
    assert.equal(it.sourceState, 'NO_RETURN');
    assert.match(it.display, /não equivale a .*nada consta/i);
    // A explicacao obrigatoria contem a propria expressao entre aspas ("isso nao equivale a nada consta").
    // O que a diretiva proibe e AFIRMAR ausencia: verificamos a frase de abertura, que e a destacada na tela e no PDF.
    assert.ok(!/^(sem restricao|nada consta|sem restri[cç][ãa]o)/i.test(String(it.display ?? '').split(/[:.;]/)[0].trim()), k);
  }
  assert.notEqual(r.verdict.level, 'CLEAR', 'três lacunas não podem dar veredito limpo');
});

// ─────────────────────────────────────────────────────────────────────────────
// Item 2 — VN_RESTRICAO_1..4 com "NAO DISPONIVEL"
// ─────────────────────────────────────────────────────────────────────────────
test('2. base nacional: "NAO DISPONIVEL" na restrição não é "Sem restrição"', () => {
  const x = structuredClone(vt);
  Object.assign(x.RESPOSTA.VEICULARBNACIONAL.REGISTRO_1, { RESTRICAO1: 'NAO DISPONIVEL', RESTRICAO2: 'NAO INFORMADO', RESTRICAO3: 'SEM RESTRICAO', RESTRICAO4: 'BUSCA E APREENSAO' });
  const r = buildReportV2({ placa: 'AAA0000', data: x });
  assert.equal(item(r, 'VN_RESTRICAO_1').state, 'NOT_PROVIDED');
  assert.equal(item(r, 'VN_RESTRICAO_1').sourceState, 'NO_RETURN');
  assert.ok(!/sem restri/i.test(String(item(r, 'VN_RESTRICAO_1').display)), 'não afirma ausência');
  assert.equal(item(r, 'VN_RESTRICAO_2').state, 'NOT_PROVIDED');
  assert.equal(item(r, 'VN_RESTRICAO_3').state, 'CLEAR');
  assert.equal(item(r, 'VN_RESTRICAO_3').sourceState, 'CONFIRMED_NONE');
  assert.equal(item(r, 'VN_RESTRICAO_4').state, 'ALERT');
});

// ─────────────────────────────────────────────────────────────────────────────
// Item 3 — DEFAULT_CLEAR do normalizador
// ─────────────────────────────────────────────────────────────────────────────
test('3. só ausência confirmada pela fonte vira CLEAR; "INEXISTENTE", "NORMAL", "OK" e "SEM INFORMAÇÃO" viram sem retorno', () => {
  const state = (valor) => buildReportV2({ RESPOSTA: { CODIGO: '1', VEICULOSBDRP: { DESCRICAORETORNO: 'SUCESSO', RETORNO: { ...base.RESPOSTA.VEICULOSBDRP.RETORNO, RESGUINCHO: valor } } } })
    .sections.flatMap((s) => s.items).find((i) => i.key === 'RESGUINCHO');
  assert.equal(state('INEXISTENTE').state, 'NOT_PROVIDED');
  assert.equal(state('NORMAL').state, 'NOT_PROVIDED');
  assert.equal(state('OK').state, 'NOT_PROVIDED');
  assert.equal(state('SEM INFORMACAO').state, 'NOT_PROVIDED');
  assert.equal(state('NADA CONSTA').state, 'CLEAR');
  assert.equal(state('SEM RESTRICAO').state, 'CLEAR');
  // o claro por campo (catálogo) continua valendo: remarcação NORMAL e inspeção OK
  const okField = buildReportV2({ RESPOSTA: { CODIGO: '1', VEICULOSBDRP: { DESCRICAORETORNO: 'SUCESSO', RETORNO: { ...base.RESPOSTA.VEICULOSBDRP.RETORNO, TIPOREMARCACAOCHASSI: 'NORMAL', RESAMBIENTAL: 'VEICULO COM INSPECAO VEICULAR OK' } } } });
  assert.equal(item(okField, 'TIPOREMARCACAOCHASSI').state, 'CLEAR');
  assert.equal(item(okField, 'RESAMBIENTAL').state, 'CLEAR');
});

// ─────────────────────────────────────────────────────────────────────────────
// Item 4 — /gravame: envelope vazio, "não informado" e registro sem STATUS
// ─────────────────────────────────────────────────────────────────────────────
const GRAV = (g) => ({ CONSULTA: { IDCONSULTA: '533' }, RESPOSTA: { CODIGO: '1', GRAVAME: { PLACA: 'AAA0000', CHASSI: '9BWZZZ377VT004251', MARCA_MODELO: 'VW/GOL', GRAVAMES: g } } });
const lien = { NUMERO_RESTRICAO: '123456', DATA_RESTRICAO: '2023-03-15', ESTADO_RESTRICAO: 'SP', STATUS: 'ATIVO', NOME_AGENTE: 'BANCO ITAU S.A.', DOCUMENTO_AGENTE: '60701190000104', NUMERO_CONTRATO: 'CT-998877' };
const noBdrp = () => { const x = structuredClone(vt); x.RESPOSTA.CODIGO = ['2', '1', '1', '1', '1', '1', '2', '2']; x.RESPOSTA.VEICULOSBDRP = { DESCRICAORETORNO: 'NAO FOI POSSIVEL LOCALIZAR', RETORNO: {} }; return x; };
const lienReport = (g) => buildReportV2({ placa: 'AAA0000', idConsulta: '467', data: noBdrp(), ...(g ? { gravame: g } : {}) });

test('4. envelope do /gravame vazio é "sem retorno", nunca quitação', () => {
  for (const vazio of [{ data: {} }, { data: { CONSULTA: {}, RESPOSTA: { CODIGO: '1' } } }, { data: null }]) {
    const r = lienReport(vazio);
    const flag = item(r, 'RESTRICAOFINAN');
    assert.equal(flag.state, 'NOT_PROVIDED', JSON.stringify(vazio));
    // O cadastro desta placa não trouxe a flag: quem explica a lacuna é o item do /gravame, com o estado da consulta.
    assert.equal(item(r, 'GR_SITUACAO').sourceState, 'NO_RETURN');
    assert.match(item(r, 'GR_SITUACAO').value, /Não informado pela fonte/);
    assert.doesNotMatch(item(r, 'GR_SITUACAO').value, /Sem gravame ou alienação fiduciária registrados/);
    assert.match(item(r, 'GR_SITUACAO').value, /não equivale a .nada consta/);
  }
});

test('4. /gravame respondendo o veículo com GRAVAMES vazio é nada consta confirmado', () => {
  const r = lienReport({ data: GRAV({}) });
  assert.equal(item(r, 'RESTRICAOFINAN').state, 'CLEAR');
  assert.equal(item(r, 'RESTRICAOFINAN').sourceState, 'CONFIRMED_NONE');
  assert.match(item(r, 'GR_SITUACAO').value, /Sem gravame ou alienação fiduciária registrados/);
  const nf = lienReport({ notFound: true });
  assert.equal(item(nf, 'RESTRICAOFINAN').sourceState, 'CONFIRMED_NONE', 'notFound hoje só vem do CODIGO=2 da própria fonte');
});

test('4. "NAO INFORMADO" na flag de gravame não exibe frase de quitação', () => {
  const x = structuredClone(vt);
  Object.assign(x.RESPOSTA.VEICULOSBDRP.RETORNO, { RESTRICAOFINAN: 'NAO INFORMADO', RESTRICAONOMEAGENTE: '', CGCFINANCEIRA: '' });
  const r = buildReportV2({ placa: 'AAA0000', data: x });
  assert.equal(item(r, 'RESTRICAOFINAN').state, 'NOT_PROVIDED');
  assert.match(item(r, 'GR_SITUACAO').value, /Não informado pela fonte/);
  assert.doesNotMatch(item(r, 'GR_SITUACAO').value, /Sem gravame ou alienação fiduciária registrados/);
});

test('4. registro de gravame sem STATUS não pode ser afirmado como ativo', () => {
  const semStatus = { ...lien, STATUS: '' };
  const r = lienReport({ data: GRAV({ REGISTRO_1: semStatus }) });
  assert.match(item(r, 'GR_SITUACAO').value, /situa/i);
  assert.doesNotMatch(item(r, 'GR_SITUACAO').value, /Há gravame \/ alienação fiduciária ativo/);
  assert.doesNotMatch(JSON.stringify(item(r, 'GR_DETALHES').table.rows), /Gravame ativo \(alienação fiduciária\)/);
  assert.match(JSON.stringify(item(r, 'GR_DETALHES').table.rows), /não informad/i);
  // com STATUS afirmativo continua afirmando
  const comStatus = lienReport({ data: GRAV({ REGISTRO_1: lien }) });
  assert.match(item(comStatus, 'GR_SITUACAO').value, /Há gravame \/ alienação fiduciária ativo — BANCO ITAU S\.A\./);
});

// ─────────────────────────────────────────────────────────────────────────────
// Item 5 — CODIGO=2 / HTTP 404 / 410
// ─────────────────────────────────────────────────────────────────────────────
test('5. HTTP 404 e 410 não são "placa não encontrada": viram consulta indisponível', async () => {
  resetCredifyTokenCache();
  for (const status of [404, 410]) {
    const f = fakeFetch({ '/debitosrestricoesproprietarios': { status, body: { Message: 'recurso não disponível' } } });
    // Código já mapeado na rota (424 + estorno), mas distinto de NOT_FOUND: endpoint fora do contrato não é "placa não encontrada".
    await assert.rejects(() => new CredifyVehicleProvider(opts(f)).queryByPlate('AAA0000', { productId: 'COMPLETE' }),
      (e) => e.code === 'DATA_PROVIDER_UNAVAILABLE' && e.code !== 'NOT_FOUND' && /fora do contrato/.test(e.detail ?? ''), `HTTP ${status}`);
  }
  // e continua sendo "placa não encontrada" quando a própria fonte responde CODIGO=2
  resetCredifyTokenCache();
  const f2 = fakeFetch({ '/debitosrestricoesproprietarios': { CONSULTA: consulta('487'), RESPOSTA: { CODIGO: '2', MSG: 'NAO ENCONTRADO' } } });
  await assert.rejects(() => new CredifyVehicleProvider(opts(f2)).queryByPlate('AAA0000', { productId: 'COMPLETE' }), { code: 'NOT_FOUND' });
});

test('5. 404 no /leilaoconjugado em camadas não vira "não consta em base de leilão"', async () => {
  const { out, items, report } = await layeredItems(baseLayers({ '/leilaoconjugado': { status: 404, body: { Message: 'endpoint não provisionado' } } }));
  assert.equal(out.raw.parcial, true, 'a peça que falhou deixa o resultado parcial');
  const leilao = items.get('VT_LEILAO');
  assert.equal(leilao.state, 'NOT_PROVIDED');
  assert.equal(leilao.sourceState, 'UNAVAILABLE');
  assert.ok(!/n[ãa]o consta/i.test(String(leilao.display)));
  assert.match(String(leilao.display), /Não informado pela fonte/);
  assert.notEqual(report.verdict.level, 'CLEAR');
});

test('5. produto Leilão (core): 404 no /leilaoconjugado derruba e estorna em vez de afirmar nada consta', async () => {
  resetCredifyTokenCache();
  const f = fakeFetch({ '/debitosrestricoesproprietarios': base, '/leilaoconjugado': { status: 404, body: { Message: 'endpoint não provisionado' } } });
  await assert.rejects(() => new CredifyVehicleProvider(opts(f)).queryByPlate('AAA0000', { productId: 'AUCTION' }), (e) => e.code !== 'NOT_FOUND');
});

test('5. CODIGO=2 com texto da fonte continua sendo ausência confirmada (E2)', () => {
  const r = buildReportV2(withBlock('LEILAOCONJUGADO', { DESCRICAORETORNO: 'O VEICULO NAO FOI APRESENTADO NA BASE DE LEILAO.' }, '2'));
  assert.equal(item(r, 'VT_LEILAO').state, 'CLEAR');
  assert.equal(item(r, 'VT_LEILAO').sourceState, 'CONFIRMED_NONE');
});

// ─────────────────────────────────────────────────────────────────────────────
// Item 6 — AnyCar
// ─────────────────────────────────────────────────────────────────────────────
test('6. AnyCar: 404 e "status:true" sem lista não são "nada consta"', async () => {
  await assert.rejects(queryAnycarAuction('ABC1D23', { fetchImpl: async () => new Response('{}', { status: 404 }), apiKey: 'k1', baseUrl: 'https://anycar.test' }),
    (e) => e.code === 'DATA_PROVIDER_UNAVAILABLE');
  await assert.rejects(queryAnycarAuction('ABC1D23', { fetchImpl: async () => new Response('{}', { status: 410 }), apiKey: 'k1', baseUrl: 'https://anycar.test' }),
    (e) => e.code === 'DATA_PROVIDER_UNAVAILABLE');
  // "status:true" sozinho não afirma ausência de leilão: é resposta sem retorno
  assert.throws(() => toAuctionPiece({ status: true, dados: [] }), (e) => e.code === 'DATA_PROVIDER_INVALID_RESPONSE');
  assert.throws(() => toAuctionPiece({ status: true, dados: { leiloes: [] } }), (e) => e.code === 'DATA_PROVIDER_INVALID_RESPONSE');
  // texto que afirma ausência na base é E2 legítimo
  assert.equal(toAuctionPiece({ status: false, mensagem: 'Nenhum registro de leilão encontrado' }).kind, 'notFound');
  const { items } = await layeredItems(baseLayers(), 'X', ['SINISTRO', 'NATIONAL', 'AUCTION_SIMPLE']);
  // (sem chave da AnyCar no teste: a fonte falha e o leilão fica sem retorno, nunca limpo)
  const leilao = items.get('VT_LEILAO');
  assert.notEqual(leilao.state, 'CLEAR');
});

test('6. relatório de leilão da Credify: notFound da consulta só vira "não consta" com a resposta da fonte', () => {
  const l = buildReportV2({ ...structuredClone(base), leilao: { data: { CONSULTA: {}, RESPOSTA: { CODIGO: '1', LEILAOCONJUGADO: { DESCRICAORETORNO: 'O VEÍCULO NÃO FOI APRESENTADO NA BASE DE LEILÃO.' } } } } });
  assert.equal(item(l, 'AU_LEILAO').state, 'CLEAR');
  assert.equal(item(l, 'AU_LEILAO').sourceState, 'CONFIRMED_NONE');
  const indisponivel = buildReportV2({ ...structuredClone(base), leilao: { unavailable: true } });
  assert.equal(item(indisponivel, 'AU_LEILAO').state, 'NOT_PROVIDED');
  assert.equal(item(indisponivel, 'AU_LEILAO').sourceState, 'UNAVAILABLE');
  assert.match(String(item(indisponivel, 'AU_LEILAO').display), /Não informado pela fonte/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Item 7 — DESCRICAORETORNO desconhecido não é ocorrência
// ─────────────────────────────────────────────────────────────────────────────
test('7. DESCRICAORETORNO desconhecido no bloco de ocorrência vira sem retorno, não alerta', () => {
  for (const desc of ['CONSULTA EM ANDAMENTO', 'PLACA SEM CADASTRO', 'LIMITE DE CONSULTA', 'RESPOSTA PARCIAL', 'NAO DISPONIVEL']) {
    const r = buildReportV2(withBlock('HISTORICOROUBOFURTO', { DESCRICAORETORNO: desc }, '1'));
    const it = item(r, 'VT_ROUBOFURTO');
    assert.equal(it.state, 'NOT_PROVIDED', desc);
    assert.ok([undefined, 'NO_RETURN', 'UNAVAILABLE'].includes(it.sourceState), desc);
    assert.notEqual(r.verdict.level, 'HIGH_RISK', desc);
  }
  // texto afirmativo continua sendo alerta
  const achado = buildReportV2(withBlock('HISTORICOROUBOFURTO', { DESCRICAORETORNO: 'VEICULO COM REGISTRO DE ROUBO' }, '1'));
  assert.equal(item(achado, 'VT_ROUBOFURTO').state, 'ALERT');
  assert.equal(item(achado, 'VT_ROUBOFURTO').sourceState, 'OCCURRENCE');
  assert.equal(achado.verdict.level, 'HIGH_RISK');
});

// ─────────────────────────────────────────────────────────────────────────────
// Item 8 — VT_SINISTRO só com valor numericamente afirmativo
// ─────────────────────────────────────────────────────────────────────────────
test('8. indício de sinistro: só valor afirmativo gera alerta', () => {
  const sin = (valor) => buildReportV2(withBlock('INDICIOSINISTROVEICULAR', { DESCRICAORETORNO: 'SUCESSO', INDICIODESINISTRO: valor }, '1'));
  assert.equal(item(sin('0'), 'VT_SINISTRO').state, 'CLEAR');
  assert.equal(item(sin('0'), 'VT_SINISTRO').sourceState, 'CONFIRMED_NONE');
  assert.equal(item(sin('1'), 'VT_SINISTRO').state, 'ALERT');
  assert.equal(item(sin('2'), 'VT_SINISTRO').state, 'ALERT');
  assert.equal(item(sin('S'), 'VT_SINISTRO').state, 'ALERT');
  assert.equal(item(sin('N'), 'VT_SINISTRO').state, 'CLEAR', 'N é negativa, não ocorrência');
  assert.equal(item(sin(''), 'VT_SINISTRO').state, 'NOT_PROVIDED');
  assert.equal(item(sin('NAO DISPONIVEL'), 'VT_SINISTRO').state, 'NOT_PROVIDED');
  assert.equal(item(sin('CONSULTA INDISPONIVEL'), 'VT_SINISTRO').state, 'NOT_PROVIDED');
  assert.notEqual(sin('N').verdict.level, 'HIGH_RISK');
});

// ─────────────────────────────────────────────────────────────────────────────
// Item 9 — aviso de escopo independentemente do veredito
// ─────────────────────────────────────────────────────────────────────────────
test('9. produto sem débitos/restricções avisa a cobertura mesmo com risco alto', () => {
  const x = structuredClone(vt);
  Object.assign(x.RESPOSTA.VEICULOSBDRP.RETORNO, { RESTRICAOFINAN: 'ALIENACAO FIDUCIARIA', RESTRICAONOMEAGENTE: 'BANCO ITAU S.A.', RESJUDICIAL: 'BUSCA E APREENSAO - 2A VARA CIVEL' });
  const full = buildReportV2({ placa: 'AAA0000', data: x });
  const lien = viewReport(full, { audience: 'client', tier: 3, sections: ['IDENTIFICACAO', 'CARACTERISTICAS', 'REGISTRO', 'GRAVAME'] });
  assert.equal(lien.verdict.level, 'HIGH_RISK', 'não perde o alerta');
  assert.ok(lien.verdict.alerts.length > 0, 'os alertas continuam no veredito');
  assert.match(lien.verdict.reason, /n[ãa]o inclui/i);
  assert.match(lien.verdict.reason, /d[ée]bitos/i);
  assert.match(lien.verdict.reason, /restri[çc][õo]es/i);
  assert.ok(lien.scope.notIncluded.some((n) => n.key === 'DEBITOS'));
  // veredito limpo mantém o comportamento antigo (Consulta parcial / INCONCLUSIVE)
  const limpo = viewReport(buildReportV2({ placa: 'AAA0000', data: structuredClone(vt) }), { audience: 'client', tier: 3, sections: ['IDENTIFICACAO', 'CARACTERISTICAS', 'REGISTRO', 'GRAVAME'] });
  assert.equal(limpo.verdict.level, 'INCONCLUSIVE');
  assert.equal(limpo.verdict.title, 'Consulta parcial');
});

// ─────────────────────────────────────────────────────────────────────────────
// Item 10 — estados separados no "não consultado" e rastro dos campos apagados
// ─────────────────────────────────────────────────────────────────────────────
test('10. advice distingue fora de cobertura, sem retorno e indisponível (sem fundir com "ou")', () => {
  const fake = (items, scope) => ({ sections: [{ key: 'HISTORICO', items }, { key: 'RESTRICOES', items: [] }, { key: 'DEBITOS', items: [] }], debts: { hasDebt: false, totalCents: 0, items: [], fineBreakdown: [], note: '' }, debtsHidden: true, ...(scope ? { scope } : {}) });
  const noReturn = buildAdvice(fake([{ key: 'VT_ROUBOFURTO', label: 'Roubo ou furto', kind: 'flag', state: 'INFO', value: 'x', display: STATE_LINE.NO_RETURN, sourceState: 'NO_RETURN', sensitivity: 'PUBLIC', tier: 1 }], { mode: 'SECTIONS', notIncluded: [] }));
  const theft = noReturn.checks.find((c) => c.key === 'theft');
  assert.equal(theft.status, 'NOT_CHECKED');
  assert.match(theft.detail, /fonte respondeu sem este dado|n[ãa]o retornou/i);
  assert.doesNotMatch(theft.detail, /ou a fonte|ou este|pacote/i, 'não pode fundir os dois estados');
  const fora = buildAdvice(fake([{ key: 'VT_ROUBOFURTO', label: 'Roubo ou furto', kind: 'flag', state: 'INFO', value: 'x', display: STATE_LINE.OUT_OF_SCOPE, sourceState: 'OUT_OF_SCOPE', sensitivity: 'PUBLIC', tier: 1 }], { mode: 'SECTIONS', notIncluded: [] }));
  assert.match(fora.checks.find((c) => c.key === 'theft').detail, /fora da cobertura|n[ãa]o faz parte/i);
  const indisponivel = buildAdvice(fake([{ key: 'VT_ROUBOFURTO', label: 'Roubo ou furto', kind: 'flag', state: 'INFO', value: 'x', display: STATE_LINE.UNAVAILABLE, sourceState: 'UNAVAILABLE', sensitivity: 'PUBLIC', tier: 1 }], { mode: 'SECTIONS', notIncluded: [] }));
  assert.match(indisponivel.checks.find((c) => c.key === 'theft').detail, /indispon|n[ãa]o respondeu/i);
});

test('10. camada não contratada deixa rastro legível nos campos que somem', () => {
  const envelope = buildLayeredEnvelope({
    baseRaw: { RESPOSTA: { CODIGO: '1', VEICULOSBDRP: { DESCRICAORETORNO: 'SUCESSO', RETORNO: base.RESPOSTA.VEICULOSBDRP.RETORNO } } },
    sinistro: { kind: 'data', resposta: { DESCRICAORETORNO: 'SUCESSO', INDICIODESINISTRO: '0' } },
    recall: { kind: 'none' }, theft: { kind: 'none' }, leilao: { kind: 'none' }, national: { kind: 'none' },
    owners: { kind: 'none' }, fipe: { kind: 'none' }, renainf: { kind: 'none' }, ownerPlate: { kind: 'none' }
  });
  const r = buildReportV2({ placa: 'AAA0000', data: envelope });
  for (const key of ['RN_MULTAS', 'VT_FIPE_PRECO', 'VN_RESTRICAO_1', 'VN_IMPORTACAO', 'VT_ROUBOFURTO', 'VT_RECALL']) {
    const it = item(r, key);
    assert.ok(it, `${key} deixou de sumir do relatório`);
    assert.equal(it.sourceState, 'OUT_OF_SCOPE', key);
    assert.match(String(it.display), /Não informado nesta consulta/);
    assert.ok(!/nada consta|sem restri|n[ãa]o consta/i.test(String(it.display)), key);
  }
  assert.ok(r.coverage.notProvidedKeys.includes('RN_MULTAS'), 'rastro também no coverage');
  // a mesma camada que falhou (com código) é indisponível, não fora de cobertura
  const falhou = buildLayeredEnvelope({
    baseRaw: { RESPOSTA: { CODIGO: '1', VEICULOSBDRP: { DESCRICAORETORNO: 'SUCESSO', RETORNO: base.RESPOSTA.VEICULOSBDRP.RETORNO } } },
    sinistro: { kind: 'none', code: 'PROVIDER_TIMEOUT' }, recall: { kind: 'none', code: 'PROVIDER_TIMEOUT' }, theft: { kind: 'none', code: 'DATA_PROVIDER_UNAVAILABLE' },
    leilao: { kind: 'none', code: 'PROVIDER_TIMEOUT' }, national: { kind: 'none', code: 'DATA_PROVIDER_UNAVAILABLE' }, owners: { kind: 'none' }, fipe: { kind: 'none' }, renainf: { kind: 'none' }
  });
  const rf = buildReportV2({ placa: 'AAA0000', data: falhou });
  assert.equal(item(rf, 'VN_RESTRICAO_1').sourceState, 'UNAVAILABLE');
  assert.equal(item(rf, 'VT_ROUBOFURTO').sourceState, 'UNAVAILABLE');
  assert.match(String(item(rf, 'VT_SINISTRO').display), /Não informado pela fonte/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Item 11 — indício ≠ confirmação e derivados rotulados
// ─────────────────────────────────────────────────────────────────────────────
test('11. farol verde sozinho não afirma "sem registro de leilão"', () => {
  const x = structuredClone(vt);
  x.RESPOSTA.CODIGO = ['1', '2', '2', '3', '1', '1', '1', '1'];
  delete x.RESPOSTA.LEILAOCONJUGADO;
  x.RESPOSTA.FAROLLEILAO = { PARECERTECNICO: '1', SEMAFORO: 'VERDE' };
  const r = buildReportV2({ placa: 'AAA0000', data: x });
  const leilao = item(r, 'VT_LEILAO');
  assert.equal(leilao.state, 'CLEAR');
  assert.match(String(leilao.display), /Farol verde/);
  assert.match(String(leilao.display), /ind[íi]cio|n[ãa]o foi consultado/i, 'qualifica que só houve indício');
  const score = item(r, 'AN_SCORE_LEILAO');
  assert.doesNotMatch(String(score.display), /Muito baixo — sem registro de leilão/);
  assert.match(String(score.display), /Farol/i);
  assert.match(String(score.display), /n[ãa]o [eé] nota de [óo]rg[ãa]o oficial/i, 'classificação própria');
  // o detalhe consultado continua afirmando ausência com a fonte falando
  const comResposta = buildReportV2(withBlock('LEILAOCONJUGADO', { DESCRICAORETORNO: 'O VEICULO NAO FOI APRESENTADO NA BASE DE LEILAO.' }, '2'));
  assert.match(String(item(comResposta, 'VT_LEILAO').display), /^N[ãa]o consta em base de leil[ãa]o$/i);
});

test('11. derivados nunca saem como fato: km, projeção, chassi, valores de gravame', () => {
  const x = structuredClone(vt);
  Object.assign(x.RESPOSTA.VEICULOSBDRP.RETORNO, { CHASSI: '9BWZZZ377VT004251', VEIANOMODELO: '2019', VEIANOFABR: '2018' });
  // Projeção de 6 meses exige 12 meses de histórico; dois pontos não geram EN_FIPE_PROJECAO.
  const fipeSeries = Array.from({ length: 13 }, (_, n) => {
    const d = new Date(Date.UTC(2025, 5 + n, 1));
    return { label: `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCFullYear()).slice(2)}`, time: d.getTime(), cents: 2800000 + n * 25000 };
  });
  // GR_VALORES só existe com gravame ativo, e a base de gravame chega como resposta do /gravame (raw.gravame.data),
  // exatamente como o lienRefresh grava.
  const r = buildReportV2({
    placa: 'AAA0000',
    data: x,
    gravame: { data: { CODIGO: '1', GRAVAMES: { REGISTRO_1: { NUMERO_RESTRICAO: '5', DATA_RESTRICAO: '2022-02-02', NOME_AGENTE: 'BANCO DO BRASIL S.A.', DOCUMENTO_AGENTE: '00000000000191', NUMERO_CONTRATO: 'X9', STATUS: 'ATIVO' } } } },
    enrichment: { fipeHistory: { series: fipeSeries } },
  });
  const km = String(item(r, 'EN_KM_REFERENCIA').display);
  assert.match(km, /estimativa/i);
  assert.match(km, /n[ãa]o [eé] a quilometragem real/i);
  assert.doesNotMatch(km, /^\s*Quilometragem:?\s*\d/i);
  assert.equal(item(r, 'EN_KM_REFERENCIA').derived, true, 'campo marcado como derivado');
  const proj = String(item(r, 'EN_FIPE_PROJECAO').display);
  assert.match(proj, /estimativa|n[ãa]o garantia/i);
  for (const key of ['EN_CHASSI_FABRICANTE', 'EN_CHASSI_ORIGEM']) assert.match(String(item(r, key).display), /decodifica|classifica[çc][ãa]o pr[óo]pria|crit[ée]rio do fabricante/i, key);
  assert.match(String(item(r, 'GR_VALORES')?.display ?? ''), /não informam saldo devedor/i);
  assert.doesNotMatch(String(item(r, 'GR_VALORES')?.display ?? ''), /R\$ \d/, 'aviso nunca mostra valor');
});

// ─────────────────────────────────────────────────────────────────────────────
// Item 12 — parcial chega ao relatório (JSON/HTML/PDF leem verdict.reason)
// ─────────────────────────────────────────────────────────────────────────────
test('12. consulta parcial não entrega veredito limpo e explica a lacuna', async () => {
  const { out, report } = await layeredItems(baseLayers({ '/indiciosinistro': { status: 500, body: { Message: 'indisponível' } }, '/veicularbnacionalonline': { status: 500, body: { Message: 'indisponível' } } }));
  assert.equal(out.raw.parcial, true);
  assert.equal(report.parcial, true, 'o flag do provedor chega ao relatório');
  assert.notEqual(report.verdict.level, 'CLEAR', 'parcial nunca é entregue como análise completa e limpa');
  assert.match(report.verdict.reason, /indispon|n[ãa]o respondeu|sem retorno/i);
  const client = viewReport(report, { audience: 'client', tier: 3 });
  assert.match(client.verdict.reason, /indispon|n[ãa]o respondeu|sem retorno/i, 'o aviso aparece no HTML/JSON/PDF, que imprimem verdict.reason');
  // sem parcial, um relatório limpo continua limpo
  const limpo = await layeredItems(baseLayers());
  assert.equal(limpo.out.raw.parcial, undefined);
  assert.notEqual(limpo.report.parcial, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulário usado também pelas análises derivadas (item 10/11 em conjunto)
// ─────────────────────────────────────────────────────────────────────────────
test('análises de leilão distinguem indício de ausência confirmada', () => {
  assert.equal(leilaoLevel({ state: 'CLEAR' }, { state: 'CLEAR' }).level, 'Muito baixo', 'ausência confirmada pela fonte');
  assert.match(leilaoLevel({ state: 'CLEAR', farolOnly: true }, { state: 'CLEAR' }).reason, /Farol|ind[íi]cio/i);
  assert.equal(leilaoAnalyses({ state: 'NOT_PROVIDED' }, undefined).size, 0, 'sem consulta, nada é calculado');
  const semDado = leilaoAnalyses({ state: 'NOT_PROVIDED', sourceState: 'UNAVAILABLE' }, undefined);
  assert.equal(semDado.size, 0, 'indisponível também não gera nível');
});
