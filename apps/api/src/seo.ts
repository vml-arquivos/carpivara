import { BRAND } from './lib/brand.js';
type SeoMeta = { title: string; description: string };

export const pageMeta: Record<string, SeoMeta> = {
  '/': { title: `Consulta de placa e histórico veicular | ${BRAND.name}`, description: 'Consulte a placa para conferir débitos, gravame, restrições e leilão, conforme a cobertura. Compare relatórios, acesse a Tabela FIPE e simule o financiamento.' },
  '/demonstracao': { title: `Exemplo de relatório veicular por placa | ${BRAND.name}`, description: 'Veja exemplos de consulta veicular com dados fictícios e baixe um modelo de relatório em PDF.' },
  '/fipe': { title: `Consulta FIPE grátis: valor médio vigente | ${BRAND.name}`, description: 'Consulte gratuitamente o valor médio FIPE vigente por tipo, marca, modelo e ano.' },
  '/consulta-placa': { title: `Consulta de placa veicular online | ${BRAND.name}`, description: 'Consulte a placa, compare a cobertura disponível e receba um relatório veicular organizado para apoiar sua decisão.' },
  '/consulta-veicular': { title: `Consulta veicular completa online | ${BRAND.name}`, description: 'Entenda o que uma consulta veicular pode verificar e escolha a cobertura adequada para sua negociação.' },
  '/consultar-gravame': { title: `Consultar gravame de veículo | ${BRAND.name}`, description: 'Saiba o que é gravame, por que verificar financiamento e como consultar a cobertura disponível para o veículo.' },
  '/consultar-sinistro-veiculo': { title: `Consultar sinistro de veículo | ${BRAND.name}`, description: 'Entenda como o histórico de sinistro pode influenciar uma compra e verifique a disponibilidade dessa cobertura.' },
  '/consultar-leilao-veiculo': { title: `Consultar passagem por leilão | ${BRAND.name}`, description: 'Veja por que a passagem por leilão merece atenção e acompanhe a disponibilidade dessa consulta veicular.' },
  '/consultar-debitos-veiculo': { title: `Consultar débitos de veículo | ${BRAND.name}`, description: 'Consulte a cobertura disponível para débitos veiculares e organize a verificação antes da transferência.' },
  '/consultar-multas-veiculo': { title: `Consultar multas de veículo | ${BRAND.name}`, description: 'Entenda como verificar multas e outras pendências antes de comprar ou transferir um veículo.' },
  '/consultar-recall': { title: `Consultar recall de veículo | ${BRAND.name}`, description: 'Saiba por que verificar campanhas de recall e como interpretar o retorno disponível na consulta.' },
  '/historico-veicular': { title: `Histórico veicular para compra segura | ${BRAND.name}`, description: 'Organize as principais verificações de um veículo usado antes de tomar uma decisão.' },
  '/planos': { title: `Preços e consultas veiculares | ${BRAND.name}`, description: `Compare as consultas ${BRAND.name}, veja a cobertura disponível e confira o preço antes de pagar.` },
  '/para-lojistas': { title: `Consulta veicular para lojistas | ${BRAND.name}`, description: 'Centralize consultas, histórico e relatórios para apoiar a operação de compra e venda de veículos.' },
  '/para-concessionarias': { title: `Consulta veicular para concessionárias | ${BRAND.name}`, description: 'Apoie a avaliação de usados com consultas, relatórios e controle operacional para equipes.' },
  '/sobre': { title: `Sobre ${BRAND.the} | Consulta veicular`, description: `Conheça ${BRAND.the}: consulta veicular por placa com transparência sobre fonte, data e cobertura de cada informação.` },
  '/instalar': { title: `Instalar o app ${BRAND.name} | Android e iPhone`, description: `Instale o ${BRAND.name} na tela inicial do Android ou do iPhone, sem loja de aplicativos, e abra em tela cheia.` },
  '/contato': { title: `Contato e suporte ao cliente | ${BRAND.name}`, description: `Fale com a equipe ${BRAND.name} sobre suporte, privacidade (LGPD) e parcerias comerciais.` },
  '/perguntas-frequentes': { title: `Perguntas frequentes sobre consulta veicular | ${BRAND.name}`, description: 'Tire dúvidas sobre consulta de placa, pagamento, estorno, privacidade e o que cada relatório mostra.' },
  '/veiculos': { title: `Guia de veículos: ficha técnica, opinião de donos e comparador | ${BRAND.name}`, description: 'Veja ficha técnica, nota e opinião de quem tem o carro, dicas de cuidados e compare veículos lado a lado antes de comprar.' },
  '/veiculos/mais-economicos': { title: `Carros mais econômicos: ranking de consumo por versão | ${BRAND.name}`, description: 'Veja o consumo de cada versão em km/l, na cidade e na estrada, com a fonte à vista (Inmetro e fichas de referência). Compare e escolha o carro que gasta menos.' },
  '/combustivel': { title: `Etanol ou gasolina? Quanto seu carro gasta por mês | ${BRAND.name}`, description: 'Descubra se etanol ou gasolina compensa para o seu carro e quanto você gasta de combustível por mês, usando o consumo oficial da versão e os preços do posto.' },
  '/simulador': { title: `Simulador de financiamento de veículos grátis | ${BRAND.name}`, description: 'Use o simulador de financiamento de veículos grátis. Ajuste entrada, prazo e juros para estimar parcelas, CET e custo total de carros e motos.' },
  '/simulador/carro': { title: `Simulador de financiamento de carro: parcela, CET e custo total | ${BRAND.name}`, description: 'Simule o financiamento do seu carro, novo ou usado, em CDC ou leasing, com IOF, tarifas e CET. Compare as modalidades e baixe o PDF.' },
  '/simulador/moto': { title: `Simulador de financiamento de moto: parcela, CET e custo total | ${BRAND.name}`, description: 'Simule o financiamento da sua moto com taxa média do Banco Central, IOF e tarifas. Veja a parcela e o custo total antes de ir ao banco.' },
  '/simulador/caminhao': { title: `Simulador de financiamento de caminhão: CDC e leasing | ${BRAND.name}`, description: 'Simule o financiamento de caminhão para pessoa física ou empresa, com taxa de mercado, IOF, tarifas e CET. Baixe o PDF da simulação.' },
  '/simulador/utilitario': { title: `Simulador de financiamento de utilitário e van | ${BRAND.name}`, description: 'Simule o financiamento de utilitário, van ou pick-up em CDC ou leasing, com IOF, tarifas e CET, e leve o PDF ao banco.' },
  '/comparar': { title: `Comparar veículos lado a lado | ${BRAND.name}`, description: 'Compare ficha técnica, consumo, espaço e nota dos donos de até 6 veículos.' },
  '/blog': { title: `Blog: guias para comprar e vender veículo com segurança | ${BRAND.name}`, description: 'Guias práticos sobre gravame, débitos, restrições, Tabela FIPE, recall e vistoria para decidir com segurança.' },
  '/entrar': { title: `Entrar | ${BRAND.name}`, description: `Acesse sua conta ${BRAND.name}.` },
  '/criar-conta': { title: `Criar conta | ${BRAND.name}`, description: `Crie sua conta ${BRAND.name} e faça sua primeira consulta veicular.` },
  '/termos': { title: `Termos de Uso | ${BRAND.name}`, description: `Conheça as regras de uso, limites e responsabilidades da plataforma ${BRAND.name}.` },
  '/privacidade': { title: `Política de Privacidade | ${BRAND.name}`, description: `Entenda como ${BRAND.the} trata dados pessoais, segurança, retenção e direitos dos titulares.` }
};

/** Páginas públicas indexáveis (entram no sitemap). Telas de conta e do app ficam de fora. */
export const SITEMAP_PATHS: string[] = Object.keys(pageMeta).filter((p) => !['/entrar', '/criar-conta'].includes(p));
const NOINDEX = /^\/(entrar|criar-conta|recuperar-senha|app|painel|contrato|documento-fiscal|validar|validar-relatorio|r|c|convite|descadastrar|parceiro|consultar|veiculos\/frota|desenvolvedores)(\/|$)/;

/** Imagens de cada consulta (em /brand/produtos): a quadrada (1200×1200) vem primeiro, depois a de capa (1200×630). Sem imagem própria, usa a da marca. */
const PRODUCT_IMAGES: Record<string, string[]> = {
  CADASTRAL: ['consulta-cadastral.jpg', 'consulta-cadastral.webp'],
  COMPLETE: ['consulta-completa.jpg', 'consulta-completa.webp'],
  LIEN: ['consulta-gravame.jpg', 'consulta-gravame.webp'],
  AUCTION: ['leilao-e-dados-do-veiculo.webp'],
  BASIC: ['consulta-avancada.webp'],
  PREMIUM: ['consulta-premium.webp']
};
export function productImageUrls(baseUrl: string, productId: string): string[] {
  const files = PRODUCT_IMAGES[productId];
  return files ? files.map((f) => `${baseUrl}/brand/produtos/${f}`) : [`${baseUrl}/brand/og-image.png`];
}
export const PRODUCT_IMAGE_FILES = [...new Set(Object.values(PRODUCT_IMAGES).flat())];

/** Endereço da imagem de uma página: /seo-img/<nome>.<extensão>?v=<versão>. O nome vem do caminho (início, fipe, simulador-carro...). */
export const seoImageSlug = (path: string): string => (path === '/' ? 'inicio' : path.replace(/^\//, '').replace(/\//g, '-'));
export const pathFromSeoImageSlug = (slug: string): string | null => SITEMAP_PATHS.find((p) => seoImageSlug(p) === slug) ?? null;
const IMAGE_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
export const seoImageUrl = (baseUrl: string, path: string, mime: string, sha: string): string => `${baseUrl.replace(/\/$/, '')}/seo-img/${seoImageSlug(path)}.${IMAGE_EXT[mime] ?? 'jpg'}?v=${sha.slice(0, 10)}`;

export interface GoogleTags { gaId?: string; adsId?: string; adsPurchaseLabel?: string; googleVerification?: string; bingVerification?: string }
let tags: GoogleTags = {};
/** Códigos do Google/Bing (variáveis de ambiente). Viram meta tags no HTML; o app só carrega o gtag depois do aceite de cookies. */
export function setGoogleTags(next: GoogleTags): void { tags = { ...next }; }

export interface SeoOverride { image?: string; imageWidth?: number | null; imageHeight?: number | null; h1?: string; title?: string; description?: string; jsonLd?: unknown[]; notFound?: boolean; bodyHtml?: string; noindex?: boolean; seoData?: { h1: string | null; title: string | null; sections: Array<{ h: string; p: string }>; faq: Array<{ q: string; a: string }> } }

/** Rotas que o app conhece, inclusive as dinâmicas. Qualquer outra recebe 404 e noindex. */
const DYNAMIC = /^\/(blog|veiculos|simulador|validar|validar-relatorio|r|c|convite|descadastrar|parceiro|contrato|documento-fiscal|app|painel|recuperar-senha|consultar|desenvolvedores|loja)(\/|$)/;
export function isKnownPath(pathname: string): boolean {
  const n = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  return n in pageMeta || DYNAMIC.test(n);
}

const HOME_IMAGE = '/brand/landing/consulta-veicular-1200.webp';
const BUYING_GUIDES = [
  ['/consultar-debitos-veiculo', 'Débitos do veículo'],
  ['/consultar-gravame', 'Gravame e financiamento ativo'],
  ['/consultar-leilao-veiculo', 'Passagem por leilão'],
  ['/historico-veicular', 'Guia de histórico veicular']
] as const;

const NAV: Array<[string, string]> = [['/fipe', 'Consulta FIPE grátis'], ['/consulta-placa', 'Consulta de placa'], ['/consulta-veicular', 'Consulta veicular completa'], ['/planos', 'Preços'], ['/simulador', 'Simulador de financiamento'], ['/veiculos', 'Guia de veículos'], ['/comparar', 'Comparar veículos'], ['/blog', 'Blog'], ['/perguntas-frequentes', 'Perguntas frequentes'], ['/sobre', 'Sobre'], ['/contato', 'Contato']];

export function renderRobotsTxt(appUrl: string, adminHost: boolean): string {
  if (adminHost) return 'User-agent: *\nDisallow: /\n';
  const base = appUrl.replace(/\/$/, '');
  return `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /app/\nDisallow: /painel\nDisallow: /entrar\nDisallow: /criar-conta\nDisallow: /recuperar-senha\nDisallow: /validar\nDisallow: /r/\nDisallow: /c/\nDisallow: /convite/\nDisallow: /descadastrar\nDisallow: /contrato/\nDisallow: /parceiro/\nDisallow: /documento-fiscal/\nDisallow: /comparar?\n\nSitemap: ${base}/sitemap.xml\n`;
}

export function renderSitemapXml(appUrl: string, extra: Array<{ path: string; lastmod?: Date }> = [], pages: Map<string, { noindex: boolean; updatedAt: Date; imageUrl?: string | null }> = new Map()): string {
  const base = appUrl.replace(/\/$/, '');
  const articleUrls = extra.map((e) => `  <url><loc>${base}${e.path}</loc>${e.lastmod ? `<lastmod>${e.lastmod.toISOString().slice(0, 10)}</lastmod>` : ''}<changefreq>monthly</changefreq><priority>0.6</priority></url>`);
  const pageUrls = SITEMAP_PATHS.filter((path) => !pages.get(path)?.noindex).map((path) => {
    const page = pages.get(path);
    const lastmod = page ? `<lastmod>${page.updatedAt.toISOString().slice(0, 10)}</lastmod>` : '';
    const images = new Set([page?.imageUrl, path === '/' ? `${base}${HOME_IMAGE}` : undefined].filter((url): url is string => Boolean(url)));
    const imageTags = [...images].map((url) => `<image:image><image:loc>${escapeHtml(url)}</image:loc></image:image>`).join('');
    const frequency = path === '/' || path === '/planos' ? 'weekly' : 'monthly';
    const priority = path === '/' ? '1.0' : path === '/planos' || path === '/fipe' ? '0.9' : '0.7';
    return `  <url><loc>${base}${path}</loc>${lastmod}<changefreq>${frequency}</changefreq><priority>${priority}</priority>${imageTags}</url>`;
  });
  const urls = [...pageUrls, ...articleUrls].join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls}\n</urlset>\n`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

export function renderSeoHtml(template: string, pathname: string, appUrl: string, override: SeoOverride = {}): string {
  const normalized = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  const base0 = pageMeta[normalized] ?? pageMeta['/'];
  const meta = { title: override.title ?? base0.title, description: override.description ?? base0.description };
  const baseUrl = appUrl.replace(/\/$/, '');
  const canonical = `${baseUrl}${normalized === '/' ? '/' : normalized}`;
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const routeSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: meta.title,
    description: meta.description,
    url: canonical,
    ...(override.image ? { image: override.image } : normalized === '/' ? { image: `${baseUrl}${HOME_IMAGE}` } : {}),
    inLanguage: 'pt-BR',
    isPartOf: { '@type': 'WebSite', name: `${BRAND.name}`, url: `${baseUrl}/` },
    publisher: { '@type': 'Organization', name: `${BRAND.name}`, url: `${baseUrl}/` }
  }).replace(/</g, '\\u003c');
  const labelOf = (path: string) => (pageMeta[path]?.title ?? '').split(' | ')[0];
  const crumbs = normalized === '/' ? [] : normalized.split('/').filter(Boolean).map((_, i, arr) => '/' + arr.slice(0, i + 1).join('/')).map((path) => ({ path, name: labelOf(path) })).filter((c) => c.name);
  const breadcrumb = crumbs.length ? [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Início', item: `${baseUrl}/` }, ...crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 2, name: c.name, item: `${baseUrl}${c.path}` }))] }] : [];
  const TOOLS: Record<string, string> = { '/fipe': 'UtilitiesApplication', '/simulador': 'FinanceApplication', '/simulador/carro': 'FinanceApplication', '/simulador/moto': 'FinanceApplication', '/simulador/caminhao': 'FinanceApplication', '/simulador/utilitario': 'FinanceApplication', '/combustivel': 'UtilitiesApplication', '/comparar': 'UtilitiesApplication' };
  const toolLd = TOOLS[normalized] ? [{ '@context': 'https://schema.org', '@type': 'WebApplication', name: meta.title.split(' | ')[0], url: canonical, description: meta.description, applicationCategory: TOOLS[normalized], operatingSystem: 'Web', inLanguage: 'pt-BR', offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL' }, publisher: { '@type': 'Organization', name: `${BRAND.name}`, url: `${baseUrl}/` } }] : [];
  const extraLd = [...(override.jsonLd ?? []), ...breadcrumb, ...toolLd].map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n  ');
  const metaTags = [
    tags.googleVerification ? `<meta name="google-site-verification" content="${escapeHtml(tags.googleVerification)}" />` : '',
    tags.bingVerification ? `<meta name="msvalidate.01" content="${escapeHtml(tags.bingVerification)}" />` : '',
    tags.gaId ? `<meta name="${BRAND.prefix}-ga" content="${escapeHtml(tags.gaId)}" />` : '',
    tags.adsId ? `<meta name="${BRAND.prefix}-ads" content="${escapeHtml(tags.adsId)}" />` : '',
    tags.adsId && tags.adsPurchaseLabel ? `<meta name="${BRAND.prefix}-ads-purchase" content="${escapeHtml(tags.adsPurchaseLabel)}" />` : ''
  ].filter(Boolean).join('\n  ');
  const unknown = override.notFound || !isKnownPath(normalized);
  const noindex = unknown || NOINDEX.test(normalized) || !!override.noindex;
  const h1 = escapeHtml(unknown ? 'Página não encontrada' : (override.h1 || meta.title.split(' | ')[0]));
  const h1Attr = !unknown && override.h1 ? ' data-seo="1"' : '';
  const intro = unknown ? 'O endereço que você abriu não existe ou foi removido.' : meta.description;
  const links = NAV.map(([href, label]) => `<li><a href="${href}">${escapeHtml(label)}</a></li>`).join('');
  const homeGuides = normalized === '/' && !unknown && !noindex
    ? `<section><h2>O que verificar antes de comprar um carro usado?</h2><p>Comece pelo histórico da placa. Confira se o veículo tem débitos, restrição financeira ou passagem por leilão e leve esses pontos para a negociação.</p><ul>${BUYING_GUIDES.map(([href, label]) => `<li><a href="${href}">${escapeHtml(label)}</a></li>`).join('')}</ul></section>`
    : '';
  const body = noindex && !unknown ? '' : `<main><h1${h1Attr}>${h1}</h1><p>${escapeHtml(intro)}</p>${unknown ? '' : (override.bodyHtml ?? '')}${homeGuides}<nav aria-label="Principal"><ul>${links}</ul></nav></main>`;
  return template
    .replace('<div id="root"></div>', () => `<div id="root">${body}</div>`)
    .replace(new RegExp(`${BRAND.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=/brand/)`, 'g'), baseUrl)
    .replace(/<meta name="robots" content="[^"]*"\s*\/>/, noindex ? '<meta name="robots" content="noindex,nofollow" />' : '<meta name="robots" content="index,follow,max-image-preview:large" />')
    .replace(/<title>.*?<\/title>/s, `<title>${unknown ? `Página não encontrada | ${BRAND.name}` : title}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${description}" />`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${escapeHtml(canonical)}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${title}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${description}" />`)
    .replace(/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${escapeHtml(canonical)}" />`)
    .replace(/<meta property="og:image" content="[^"]*"\s*\/>/, () => override.image
      ? `<meta property="og:image" content="${escapeHtml(override.image)}" />${override.imageWidth && override.imageHeight ? `\n    <meta property="og:image:width" content="${override.imageWidth}" />\n    <meta property="og:image:height" content="${override.imageHeight}" />` : ''}`
      : `<meta property="og:image" content="${baseUrl}/brand/og-image.png" />`)
    .replace(/<meta name="twitter:card" content="[^"]*"\s*\/>/, (m) => `${m}\n    <meta name="twitter:image" content="${escapeHtml(override.image ?? `${baseUrl}/brand/og-image.png`)}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${title}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${description}" />`)
    .replace('</head>', `<script id="${BRAND.prefix}-route-schema" type="application/ld+json">${routeSchema}</script>${extraLd ? `\n  ${extraLd}` : ''}${metaTags ? `\n  ${metaTags}` : ''}\n  </head>`)
    // mesmos textos do painel para o app mostrar na primeira pintura, sem pedir de novo (evita o salto de layout); marcado com a rota para não valer em outra página
    .replace('</head>', () => override.seoData && !unknown ? `<script id="seo-data" type="application/json">${JSON.stringify({ path: normalized, ...override.seoData }).replace(/</g, '\\u003c')}</script>\n  </head>` : '</head>');
}
