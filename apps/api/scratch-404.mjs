// Experimento: o que acontece quando uma peça responde "não encontrado" (CODIGO=2) vs HTTP 404.
import fs from 'node:fs';
import { useTestEnv } from './test/helpers/db.mjs';
useTestEnv();
const { CredifyVehicleProvider, resetCredifyTokenCache } = await import('./dist/providers/credifyProvider.js');
const { PRODUCT_CONTRACT, BASE_PATH } = await import('./dist/lib/productContract.js');
const { sourcesForProduct } = await import('./dist/lib/dataSources.js');
const { buildReportV2 } = await import('./dist/report/normalizeV2.js');

const sample = JSON.parse(fs.readFileSync(new URL('./test/fixtures/exemplo-retorno-provedor.json', import.meta.url), 'utf8'));
const jwt = () => `h.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 86400 })).toString('base64url')}.s`;
const consulta = (id) => ({ CODIGORESPOSTA: '1', DATAHORA: '01/01/2026 10:00:00', LOGON: '1', IDCONSULTA: id });
const ok = (id, resposta) => ({ CONSULTA: consulta(id), RESPOSTA: { CODIGO: '1', ...resposta } });
const absent = (id, text) => ({ CONSULTA: consulta(id), RESPOSTA: { CODIGO: '2', DESCRICAORETORNO: text } });

function fakeFetch(overrides = {}) {
  const routes = {
    [BASE_PATH]: sample,
    '/indiciosinistro': ok('450', { DESCRICAORETORNO: 'Sucesso', INDICIODESINISTRO: '0' }),
    '/veicularbnacionalonline': ok('369', { DESCRICAORETORNO: 'SUCESSO', PLACA: 'AAA0000' }),
    '/leilaoconjugado': absent('448', 'O VEICULO NAO FOI APRESENTADO NA BASE DE LEILAO.'),
    '/historicoproprietario': ok('458', { DESCRICAORETORNO: 'SUCESSO', QUANTIDADE: '2' }),
    '/precificadorfipe': ok('454', { DESCRICAORETORNO: 'SUCESSO', PRECO: '50000' }),
    '/renainf': ok('536', { DESCRICAORETORNO: 'SUCESSO' }),
    '/veiculoproprietarioplaca': ok('514', { DESCRICAORETORNO: 'SUCESSO', NOME_PROPRIETARIO: 'FULANO DE TAL' }),
    '/historicoroubofurto': ok('456', { DESCRICAORETORNO: 'SUCESSO', OCORRENCIA: 'FURTO' }),
    '/recall': ok('452', { DESCRICAORETORNO: 'SUCESSO', MONTADORA: 'VW' }),
    '/gravame': ok('533', { GRAVAME: { PLACA: 'AAA0000', GRAVAMES: { REGISTRO_1: { NUMERO_RESTRICAO: '1' } } } }),
    '/renajud': ok('483', { RENAJUD: { REGISTRO_1: { NUMERODOPROCESSO: '1' } } }),
    ...overrides
  };
  const calls = [];
  const fn = async (url) => {
    const path = new URL(String(url)).pathname;
    if (path === '/auth') return new Response(JSON.stringify({ Success: true, Dados: jwt() }), { status: 200 });
    calls.push(path);
    const h = routes[path];
    if (!h) throw new Error(`chamada inesperada: ${path}`);
    if (typeof h === 'function') return h(calls.filter((c) => c === path).length);
    if (h.status && h.status >= 400) return new Response('{}', { status: h.status });
    return new Response(JSON.stringify(h), { status: 200 });
  };
  fn.count = (p) => calls.filter((c) => c === p).length;
  return fn;
}
const opts = (fetchImpl) => ({ baseUrl: 'https://api.credify.test', clientId: 'cid', clientSecret: 'sec', method: 'post', timeoutMs: 3000, fetchImpl });
const run = (f, id) => new CredifyVehicleProvider(opts(f)).queryByPlate('AAA0000', { productId: id, sources: sourcesForProduct(id) });

const show = (label, out) => {
  const items = new Map(buildReportV2(out.raw).sections.flatMap((s) => s.items).map((i) => [i.key, i]));
  const keys = ['FIPE_PRECO', 'VT_FIPE', 'PROPRIETARIO', 'NM_MUNICIPIO', 'VT_LEILAO'];
  console.log(label, '| parcial =', out.raw.parcial);
  for (const k of keys) { const it = items.get(k); if (it) console.log('   ', k, it.state, it.sourceState, JSON.stringify(String(it.display ?? '').slice(0, 80))); }
};

// A) HTTP 404 (como o teste hoje)
resetCredifyTokenCache();
try {
  const f = fakeFetch({ '/veiculoproprietarioplaca': { status: 404 }, '/precificadorfipe': { status: 404 } });
  show('A 404:', await run(f, 'COMPLETE'));
  console.log('   tentativas fipe:', f.count('/precificadorfipe'));
} catch (e) { console.log('A 404 → ERRO', e.code, e.message); }

// B) CODIGO=2 no corpo (é assim que a Credify publica "dado não encontrado")
resetCredifyTokenCache();
try {
  const f = fakeFetch({
    '/veiculoproprietarioplaca': absent('514', 'PLACA NAO ENCONTRADA'),
    '/precificadorfipe': absent('454', 'VEICULO NAO ENCONTRADO NA TABELA FIPE')
  });
  show('B CODIGO=2:', await run(f, 'COMPLETE'));
} catch (e) { console.log('B CODIGO=2 → ERRO', e.code, (e.detail ?? e.message)); }
