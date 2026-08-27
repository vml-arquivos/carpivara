type SeoMeta = { title: string; description: string };

const pageMeta: Record<string, SeoMeta> = {
  '/': { title: 'BUSCARR | Consulta e inteligência veicular', description: 'Comece pela FIPE grátis e avance para consultas veiculares com cobertura clara, histórico e PDF.' },
  '/fipe': { title: 'Consulta FIPE grátis e em tempo real | BUSCARR', description: 'Consulte gratuitamente o valor médio FIPE vigente por tipo, marca, modelo e ano.' },
  '/consulta-placa': { title: 'Consulta de placa veicular online | BUSCARR', description: 'Consulte a placa, compare a cobertura disponível e receba um relatório veicular organizado para apoiar sua decisão.' },
  '/consulta-veicular': { title: 'Consulta veicular completa online | BUSCARR', description: 'Entenda o que uma consulta veicular pode verificar e escolha a cobertura adequada para sua negociação.' },
  '/consultar-gravame': { title: 'Consultar gravame de veículo | BUSCARR', description: 'Saiba o que é gravame, por que verificar financiamento e como consultar a cobertura disponível para o veículo.' },
  '/consultar-sinistro-veiculo': { title: 'Consultar sinistro de veículo | BUSCARR', description: 'Entenda como o histórico de sinistro pode influenciar uma compra e verifique a disponibilidade dessa cobertura.' },
  '/consultar-leilao-veiculo': { title: 'Consultar passagem por leilão | BUSCARR', description: 'Veja por que a passagem por leilão merece atenção e acompanhe a disponibilidade dessa consulta veicular.' },
  '/consultar-debitos-veiculo': { title: 'Consultar débitos de veículo | BUSCARR', description: 'Consulte a cobertura disponível para débitos veiculares e organize a verificação antes da transferência.' },
  '/consultar-multas-veiculo': { title: 'Consultar multas de veículo | BUSCARR', description: 'Entenda como verificar multas e outras pendências antes de comprar ou transferir um veículo.' },
  '/consultar-recall': { title: 'Consultar recall de veículo | BUSCARR', description: 'Saiba por que verificar campanhas de recall e como interpretar o retorno disponível na consulta.' },
  '/historico-veicular': { title: 'Histórico veicular para compra segura | BUSCARR', description: 'Organize as principais verificações de um veículo usado antes de tomar uma decisão.' },
  '/planos': { title: 'Preços e consultas veiculares | BUSCARR', description: 'Compare as consultas BUSCARR, veja a cobertura disponível e confira o preço antes de pagar.' },
  '/para-lojistas': { title: 'Consulta veicular para lojistas | BUSCARR', description: 'Centralize consultas, histórico e relatórios para apoiar a operação de compra e venda de veículos.' },
  '/para-concessionarias': { title: 'Consulta veicular para concessionárias | BUSCARR', description: 'Apoie a avaliação de usados com consultas, relatórios e controle operacional para equipes.' },
  '/termos': { title: 'Termos de Uso | BUSCARR', description: 'Conheça as regras de uso, limites e responsabilidades da plataforma BUSCARR.' },
  '/privacidade': { title: 'Política de Privacidade | BUSCARR', description: 'Entenda como a BUSCARR trata dados pessoais, segurança, retenção e direitos dos titulares.' }
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

export function renderSeoHtml(template: string, pathname: string, appUrl: string): string {
  const normalized = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  const meta = pageMeta[normalized] ?? pageMeta['/'];
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
    inLanguage: 'pt-BR',
    isPartOf: { '@type': 'WebSite', name: 'BUSCARR', url: `${baseUrl}/` },
    publisher: { '@type': 'Organization', name: 'BUSCARR', url: `${baseUrl}/` }
  }).replace(/</g, '\\u003c');
  return template
    .replace(/<title>.*?<\/title>/s, `<title>${title}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${description}" />`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${escapeHtml(canonical)}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${title}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${description}" />`)
    .replace(/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${escapeHtml(canonical)}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${title}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${description}" />`)
    .replace('</head>', `<script id="buscarr-route-schema" type="application/ld+json">${routeSchema}</script>\n  </head>`);
}
