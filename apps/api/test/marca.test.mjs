// Marca única: a fonte da API e a do front são iguais, os arquivos estáticos seguem a mesma marca
// e nenhum texto da marca anterior sobrou fora das migrações antigas.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND, hexToUnit } from '../dist/lib/brand.js';
import { pageMeta } from '../dist/seo.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const webSrc = read('apps/web/src/shared/brand.ts');
// o front é TypeScript: transpila o arquivo e importa para comparar o objeto inteiro
const ts = (await import('typescript')).default;
const js = ts.transpileModule(webSrc, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { BRAND: WEB } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

describe('marca única', () => {
  it('API e front dizem a mesma coisa (objeto inteiro)', () => {
    assert.deepEqual(WEB, BRAND);
  });
  it('artigos em português seguem o nome', () => {
    assert.equal(BRAND.name, 'BL Buscarr');
    assert.deepEqual([BRAND.the, BRAND.of, BRAND.in, BRAND.to, BRAND.by], ['o BL Buscarr', 'do BL Buscarr', 'no BL Buscarr', 'ao BL Buscarr', 'pelo BL Buscarr']);
    assert.deepEqual([BRAND.The, BRAND.Of], ['O BL Buscarr', 'Do BL Buscarr']);
    assert.equal(BRAND.upper, 'BL BUSCARR');
  });
  it('endereços derivam do domínio e nomes técnicos não usam espaço nem acento', () => {
    assert.equal(BRAND.url, `https://${BRAND.domain}`);
    assert.equal(BRAND.adminHost, `admin.${BRAND.domain}`);
    assert.equal(BRAND.adminUrl, `https://${BRAND.adminHost}`);
    for (const k of ['slug', 'fileSlug', 'compact', 'prefix', 'docPrefix']) assert.match(BRAND[k], /^[A-Za-z0-9-]+$/, k);
  });
  it('dados legais e do grupo que faltam ficam marcados com [PREENCHER] (nada inventado)', () => {
    for (const v of Object.values(BRAND.legal)) assert.match(v, /^\[PREENCHER: .+\]$/);
    assert.equal(BRAND.group.name, 'Sorte Tech');
  });
  it('arquivos estáticos do front seguem a marca', () => {
    const index = read('apps/web/index.html');
    for (const s of [`content="${BRAND.name}"`, `href="${BRAND.url}/"`, `${BRAND.url}/brand/og-image.png`, `<title>${pageMeta["/"].title}</title>`, `content="${BRAND.colors.night}"`]) assert.ok(index.includes(s), `index.html sem ${s}`);
    assert.ok(read('apps/web/admin.html').includes(`<title>Painel | ${BRAND.name}</title>`));
    assert.ok(read('apps/web/admin.html').includes(BRAND.colors.night));
    const manifest = JSON.parse(read('apps/web/public/site.webmanifest'));
    assert.equal(manifest.short_name, BRAND.name);
    assert.equal(manifest.name, `${BRAND.name} | ${BRAND.tagline}`);
    assert.equal(manifest.theme_color, BRAND.colors.night);
    assert.equal(manifest.background_color, BRAND.colors.night);
  });
  it('tokens.css usa as cores da marca', () => {
    const css = read('apps/web/src/shared/tokens.css');
    const tok = (n) => (css.match(new RegExp(`--${n}:\\s*(#[0-9A-Fa-f]{6})`)) || [])[1]?.toUpperCase();
    assert.equal(tok('primary'), BRAND.colors.primary.toUpperCase());
    assert.equal(tok('primary-hover'), BRAND.colors.primaryHover.toUpperCase());
    assert.equal(tok('primary-soft'), BRAND.colors.primarySoft.toUpperCase());
    assert.equal(tok('primary-ink'), BRAND.colors.primaryInk.toUpperCase());
    assert.equal(tok('night'), BRAND.colors.night.toUpperCase());
    assert.equal(tok('gold'), BRAND.colors.gold.toUpperCase());
  });
  it('hexToUnit converte cor para o pdf-lib', () => {
    assert.deepEqual(hexToUnit('#FF0000'), [1, 0, 0]);
    assert.deepEqual(hexToUnit('#fff'), [1, 1, 1]);
  });
  it('logos e ícones existem e trazem o nome da marca', () => {
    for (const f of ['logo-horizontal.svg', 'logo-horizontal-dark.svg', 'logo-vertical.svg', 'logo-mark.svg', 'logo-app-icon.svg']) assert.ok(read(`apps/web/public/brand/${f}`).includes(`aria-label="${BRAND.name}"`), f);
    assert.ok(read('apps/web/public/favicon.svg').includes(`aria-label="${BRAND.name}"`));
    const pngs = { 'icon-192.png': [192, 192], 'icon-512.png': [512, 512], 'icon-maskable-192.png': [192, 192], 'icon-maskable-512.png': [512, 512], 'apple-touch-icon.png': [180, 180], 'og-image.png': [1200, 630] };
    for (const [file, dimensions] of Object.entries(pngs)) {
      const png = readFileSync(path.join(root, 'apps/web/public/brand', file));
      assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', file);
      assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], dimensions, file);
    }
  });
  it('nenhum texto da marca anterior fora das migrações antigas e do histórico', () => {
    // padrões montados em pedaços para este arquivo não se achar sozinho
    const antigos = [['Placa', ' na ', 'M'].join(''), ['placa', 'na', 'mao'].join(''), ['pl', 'mao'].join(''), ['placa', '-na-', 'mao'].join(''), ['Placa', 'Na', 'Mao'].join(''), ['PLACA', ' NA ', 'M'].join('')];
    const rx = new RegExp(antigos.join('|'), 'i');
    const ignorar = new Set(['node_modules', 'dist', '.git']);
    const achados = [];
    (function walk(dir) {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (ignorar.has(e.name)) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        const rel = path.relative(root, p).split(path.sep).join('/');
        if (!/\.(ts|tsx|mjs|md|json|html|css|svg|sh|py|yml|webmanifest|example)$/.test(e.name) && e.name !== 'Dockerfile') continue;
        if (/^apps\/api\/src\/migrations(\.produto|\.marca)?\.ts$/.test(rel) || rel === 'package-lock.json') continue;
        if (rx.test(readFileSync(p, 'utf8'))) achados.push(rel);
      }
    })(root);
    assert.deepEqual(achados, [], 'ainda há texto da marca anterior nestes arquivos');
  });
});
