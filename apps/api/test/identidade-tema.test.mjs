import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Manual de Marca BL aplicado nos temas claro e escuro: cores, botões, tipografia e arquivos de logo.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const web = path.join(root, 'apps/web');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');
const tokens = read('src/shared/tokens.css');
const block = (css, selector) => {
  const i = css.indexOf(selector);
  assert.ok(i >= 0, `bloco ${selector} não encontrado`);
  return css.slice(i, css.indexOf('\n}', i));
};
const tok = (css, name) => (css.match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`)) || [])[1]?.toUpperCase();
const light = block(tokens, ':root {');
const dark = block(tokens, ":root[data-theme='dark'] {");

test('tema claro: Azul Principal, Azul Escuro no hover, Cinza Neutro nas linhas e gradiente oficial', () => {
  assert.equal(tok(light, '--primary'), '#2563EB');
  assert.equal(tok(light, '--primary-hover'), '#1E40AF');
  assert.equal(tok(light, '--action'), '#2563EB');
  assert.equal(tok(light, '--border'), '#E5E7EB');
  assert.equal(tok(light, '--bg'), '#FFFFFF');
  assert.match(light, /--grad-brand:\s*linear-gradient\(180deg,\s*#60A5FA 0%,\s*#2563EB 50%,\s*#1E40AF 100%\)/i);
});

test('tema escuro: superfícies derivadas do Azul Escuro (sem cinza neutro), texto claro, botão com texto branco', () => {
  for (const nome of ['--bg', '--bg-soft', '--surface', '--surface-2', '--border']) {
    const hex = tok(dark, nome);
    assert.ok(hex, `${nome} ausente no tema escuro`);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    assert.ok(b - r >= 12, `${nome} ${hex} é cinza neutro: o escuro deve puxar para o azul`);
  }
  assert.equal(tok(dark, '--bg'), '#0B1220');
  assert.equal(tok(dark, '--primary'), '#60A5FA');
  assert.equal(tok(dark, '--action'), '#2563EB');
  assert.equal(tok(dark, '--on-action'), '#FFFFFF');
  // o estado "ok" continua verde no escuro (é resultado da fonte, não marca)
  assert.equal(tok(dark, '--ok-ink'), '#7FE3BC');
});

test('botão primário usa o fundo de ação nos dois temas e a página inicial não traz fundo cinza-preto', () => {
  const ui = read('src/shared/ui.css');
  assert.match(ui, /\.btn-primary \{[^}]*background: var\(--action\)/);
  const landing = read('src/client/pages/landing.css');
  assert.match(landing, /\.buscar-entry \{[^}]*background: var\(--hero-bg\)/);
  assert.doesNotMatch(landing, /#171717|#272727|#18223a/i);
  assert.match(tokens, /--hero-bg:\s*linear-gradient\(160deg,\s*#2563EB 0%,\s*#1E40AF 100%\)/i);
  assert.match(tokens, /--hero-bg:\s*linear-gradient\(160deg,\s*#1E40AF 0%,\s*#0B1220 100%\)/i);
});

test('títulos em SemiBold, botões em SemiBold e nenhum amarelo ou laranja de marca nas folhas de estilo', () => {
  assert.match(tokens, /h1, h2, h3, h4 \{ font-weight: 600; \}/);
  const css = ['src/shared/ui.css', 'src/client/client.css', 'src/client/pages/landing.css', 'src/admin/admin.css'].map(read).join('\n');
  assert.match(css, /\.btn \{[^}]*font-weight: 600/);
  assert.doesNotMatch(css, /font-weight: 300/);
  // âmbar só como estado (--warn) e no WhatsApp/farol; estrelas e gráficos usam os azuis da marca
  assert.doesNotMatch(css, /#F5A524|#E0A020|#B7791F|#fff6d6/i);
});

test('arquivos de logo do manual: ícone e monograma em gradiente, versões P&B horizontais', () => {
  const brand = path.join(web, 'public/brand');
  for (const f of ['logo-app-icon.svg', 'logo-monograma.svg', 'favicon.svg']) {
    const svg = fs.readFileSync(path.join(brand, f), 'utf8');
    assert.match(svg, /#60A5FA/i, `${f}: falta o topo do gradiente`);
    assert.match(svg, /#2563EB/i, `${f}: falta o meio do gradiente`);
    assert.match(svg, /#1E40AF/i, `${f}: falta a base do gradiente`);
  }
  assert.match(fs.readFileSync(path.join(brand, 'logo-horizontal-mono.svg'), 'utf8'), /fill="#000000"/);
  assert.match(fs.readFileSync(path.join(brand, 'logo-horizontal-mono-white.svg'), 'utf8'), /fill="#FFFFFF"/i);
  const hero = fs.readFileSync(path.join(brand, 'hero-night.svg'), 'utf8');
  assert.doesNotMatch(hero, /#13492C|#FFD27A|#FF6BD6|#BB2200/i, 'a ilustração das capas não pode trazer verde, amarelo ou rosa');
});
