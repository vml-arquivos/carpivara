// Gera os PNG/WebP/JPG da marca BL Buscarr a partir dos SVGs de apps/web/public/brand:
// ícones do app (PWA e apple-touch), imagem de compartilhamento (og-image), capas das páginas e imagens das consultas.
// Antes, rode `python3 scripts/brand/build-logos.py` se mudar o logo ou a paleta.
// Requer Playwright e um Chrome/Chromium: PLAYWRIGHT_MODULE (caminho do módulo, se não estiver instalado) e CHROME_PATH (opcional).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const pub = path.join(root, 'apps/web/public');
const brand = path.join(pub, 'brand');
mkdirSync(path.join(brand, 'capas'), { recursive: true });
mkdirSync(path.join(brand, 'produtos'), { recursive: true });

// Cores e textos vêm da marca (apps/web/src/shared/brand.ts), lidos direto do arquivo para não depender de compilação.
const brandTs = readFileSync(path.join(root, 'apps/web/src/shared/brand.ts'), 'utf8');
const pick = (k) => (brandTs.match(new RegExp(`${k}:\\s*'([^']+)'`)) || [])[1];
const NIGHT = pick('night'), GOLD = pick('gold'), ONDARK = pick('onDark'), NAME = pick('name'), TAGLINE = pick('tagline');
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',');

const svg = (p) => readFileSync(p, 'utf8');
const b64 = (s) => 'data:image/svg+xml;base64,' + Buffer.from(s).toString('base64');
const font = (f) => 'data:font/woff2;base64,' + readFileSync(path.join(pub, 'fonts', f)).toString('base64');
const ttf = (f) => 'data:font/ttf;base64,' + readFileSync(path.join(here, 'fonts', f)).toString('base64');
const FONTCSS = `<style>@font-face{font-family:'Inter';font-weight:100 900;src:url(${ttf('Inter-Variable.ttf')}) format('truetype')}</style>`;

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] } : {});
const ctx = await browser.newContext({ deviceScaleFactor: 1 });
async function shot(html, w, h, out, transparent = false) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><head>${FONTCSS}</head><body style="margin:0;background:${transparent ? 'transparent' : NIGHT}">${html}</body></html>`);
  await page.waitForTimeout(150);
  await page.screenshot({ path: out, omitBackground: transparent });
  await page.close();
}
const tmp = path.join(tmpdir(), 'bl-capas');
mkdirSync(tmp, { recursive: true });
function convert(png, out, quality) { execFileSync('convert', [png, '-quality', String(quality), '-define', 'webp:method=6', '-define', 'webp:sns-strength=0', '-define', 'webp:filter-strength=0', out]); }

// ---- ícones do app ----
const icon = b64(svg(path.join(brand, 'logo-app-icon.svg')));
const maskable = b64(svg(path.join(here, '_icon-maskable.svg')));
for (const s of [192, 512]) {
  await shot(`<img src="${icon}" width="${s}" height="${s}" style="display:block">`, s, s, path.join(brand, `icon-${s}.png`), true);
  await shot(`<img src="${maskable}" width="${s}" height="${s}" style="display:block">`, s, s, path.join(brand, `icon-maskable-${s}.png`));
}
await shot(`<img src="${maskable}" width="180" height="180" style="display:block">`, 180, 180, path.join(brand, 'apple-touch-icon.png'));

// ---- capas ----
const hero = b64(svg(path.join(brand, 'hero-night.svg')));
const logo = b64(svg(path.join(brand, 'logo-horizontal-dark.svg')));
const veil = `linear-gradient(90deg,rgba(${hexRgb(NIGHT)},.97) 0%,rgba(${hexRgb(NIGHT)},.80) 44%,rgba(${hexRgb(NIGHT)},0) 100%)`;
// textura fina (grão) por cima: evita faixas nos degradês e dá acabamento
const grain = `<div style="position:absolute;inset:0;opacity:.18;mix-blend-mode:screen;background-image:url(${b64('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="240" height="240" filter="url(#n)"/></svg>')})"></div>`;
const wide = ({ title, sub, withLogo = true, big = 64 }) => `<div style="width:1200px;height:630px;position:relative;overflow:hidden;font-family:'Inter',system-ui,sans-serif;color:#fff">
  <img src="${hero}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:78% center;filter:brightness(1.7) saturate(1.15) contrast(1.05)">
  <div style="position:absolute;inset:0;background:${veil}"></div>
  ${grain}
  ${withLogo ? `<img src="${logo}" style="position:absolute;left:72px;top:62px;height:64px">` : ''}
  <div style="position:absolute;left:72px;top:${withLogo ? 190 : 150}px;width:650px;font-size:${big}px;line-height:1.06;font-weight:800;letter-spacing:-.02em">${title}</div>
  <div style="position:absolute;left:72px;bottom:70px;width:640px;font-size:27px;font-weight:600;color:${ONDARK}"><span style="display:inline-block;width:46px;height:5px;border-radius:3px;background:${GOLD};vertical-align:middle;margin-right:16px"></span>${sub}</div>
</div>`;
const square = ({ title, sub, withLogo = true }) => `<div style="width:1200px;height:1200px;position:relative;overflow:hidden;font-family:'Inter',system-ui,sans-serif;color:#fff;text-align:center">
  <img src="${hero}" style="position:absolute;left:0;bottom:0;width:100%;height:760px;object-fit:cover;object-position:70% center;filter:brightness(1.7) saturate(1.15) contrast(1.05)">
  <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(${hexRgb(NIGHT)},1) 0%,rgba(${hexRgb(NIGHT)},.94) 40%,rgba(${hexRgb(NIGHT)},.05) 100%)"></div>
  ${grain}
  ${withLogo ? `<img src="${logo}" style="position:absolute;left:50%;transform:translateX(-50%);top:70px;height:96px">` : ''}
  <div style="position:absolute;left:80px;right:80px;top:${withLogo ? 240 : 160}px;font-size:104px;line-height:1.04;font-weight:800;letter-spacing:-.02em">${title}</div>
  <div style="position:absolute;left:80px;right:80px;top:${withLogo ? 430 : 350}px;font-size:40px;font-weight:600;color:${ONDARK}">${sub}</div>
</div>`;

const CAPAS = {
  'inicio': ['Consulta de placa online', 'Relatório claro, com PDF'],
  'fipe': ['Tabela FIPE grátis', 'Valor médio e histórico do veículo'],
  'consulta-placa': ['Consulta de placa online', 'Veja o que a placa conta sobre o carro'],
  'consulta-veicular': ['Consulta veicular completa', 'Histórico para comprar com segurança'],
  'consultar-gravame': ['Consultar gravame', 'Saiba se há financiamento ativo'],
  'consultar-sinistro-veiculo': ['Consultar sinistro', 'Indício de sinistro antes de comprar'],
  'consultar-leilao-veiculo': ['Consultar leilão', 'Passagem do veículo por leilão'],
  'consultar-debitos-veiculo': ['Consultar débitos', 'IPVA, licenciamento e multas'],
  'consultar-multas-veiculo': ['Consultar multas', 'Pendências antes de transferir'],
  'consultar-recall': ['Consultar recall', 'Campanhas de recall do veículo'],
  'historico-veicular': ['Histórico veicular', 'Confira antes de comprar usado'],
  'planos': ['Preços das consultas', 'Veja o preço antes de pagar'],
  'para-lojistas': ['Para lojistas', 'Consultas e histórico para sua loja'],
  'para-concessionarias': ['Para concessionárias', 'Avalie usados com mais segurança'],
  'sobre': [`Sobre o ${NAME}`, TAGLINE],
  'instalar': ['Instale o app', 'Android e iPhone, sem loja de aplicativos'],
  'contato': ['Contato e suporte', 'Fale com a equipe'],
  'blog': ['Blog de veículos', 'Guias para comprar e vender com segurança'],
  'combustivel': ['Etanol ou gasolina?', 'Quanto seu carro gasta por mês'],
  'comparar': ['Comparar carros', 'Ficha técnica lado a lado'],
  'privacidade': ['Política de privacidade', 'Como tratamos seus dados'],
  'simulador': ['Simulador de financiamento', 'Parcela, CET e custo total'],
  'simulador-carro': ['Financiamento de carro', 'Simule em CDC ou leasing'],
  'simulador-moto': ['Financiamento de moto', 'Simule parcela e custo total'],
  'simulador-caminhao': ['Financiamento de caminhão', 'Simule em CDC ou leasing'],
  'simulador-utilitario': ['Utilitário e van', 'Simule o financiamento']
};
for (const [slug, [title, sub]] of Object.entries(CAPAS)) {
  const png = path.join(tmp, slug + '.png');
  await shot(wide({ title, sub, big: title.length > 22 ? 58 : 66 }), 1200, 630, png);
  convert(png, path.join(brand, 'capas', slug + '.webp'), 92);
}

// ---- imagens das consultas (nomes de arquivo fixos: o SEO e as migrações usam) ----
const PRODUTOS = {
  'consulta-cadastral': ['Dados Cadastrais', 'O básico para conferir o veículo'],
  'consulta-completa': ['Consulta Completa', 'Informações para avaliar seu próximo carro'],
  'consulta-gravame': ['Consulta de Gravame', 'Saiba se há financiamento ativo'],
  'consulta-basica': ['Consulta Básica', 'Cadastro, débitos e restrições'],
  'consulta-avancada': ['Consulta Avançada', 'Mais histórico antes de decidir'],
  'consulta-premium': ['Consulta Premium', 'O relatório mais completo'],
  'leilao-e-dados-do-veiculo': ['Leilão e dados do veículo', 'Passagem por leilão e cadastro']
};
for (const [slug, [title, sub]] of Object.entries(PRODUTOS)) {
  const png = path.join(tmp, slug + '.png');
  if (slug === 'consulta-basica') continue; // a Básica só tem a imagem quadrada
  await shot(wide({ title, sub }), 1200, 630, png);
  convert(png, path.join(brand, 'produtos', slug + '.webp'), 95);
}
for (const slug of ['consulta-cadastral', 'consulta-completa', 'consulta-gravame', 'consulta-basica']) {
  const [title, sub] = PRODUTOS[slug];
  const png = path.join(tmp, slug + '-sq.png');
  await shot(square({ title, sub }), 1200, 1200, png);
  convert(png, path.join(brand, 'produtos', slug + '.jpg'), 86);
  if (['consulta-completa', 'consulta-gravame', 'consulta-basica'].includes(slug)) {
    const png2 = path.join(tmp, slug + '-sq2.png');
    await shot(square({ title, sub, withLogo: false }), 1200, 1200, png2);
    convert(png2, path.join(brand, 'produtos', slug + '-sem-logo.jpg'), 86);
  }
}

// ---- imagem de compartilhamento 1200x630 ----
await shot(wide({ title: `Conheça a história do carro <span style="color:#93C5FD">antes de decidir.</span>`, sub: 'Consulte pela placa. Relatório claro, com PDF.', big: 60 }), 1200, 630, path.join(brand, 'og-image.png'));
await browser.close();
rmSync(tmp, { recursive: true, force: true });
console.log('ok');
