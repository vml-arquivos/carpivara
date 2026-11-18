/**
 * FONTE ÚNICA DA MARCA (API).
 *
 * Nome, domínio, e-mails, textos de marca, nomes técnicos e cores saem daqui. Para trocar a marca, altere este arquivo
 * e o espelho do front (apps/web/src/shared/brand.ts); o teste `marca` confere se os dois estão iguais e se os arquivos
 * estáticos (index.html, admin.html, site.webmanifest, tokens.css) seguem a mesma marca.
 * Não coloque aqui nenhum segredo, chave, senha, preço de custo ou dado de contrato de fornecedor.
 *
 * Marcadores [PREENCHER: ...] = dado que o dono ainda vai informar. Nada aqui é inventado.
 */

/** Gênero do nome em português ('m' = masculino, como em "o BL Buscarr"; 'f' = feminino). Os artigos abaixo seguem esse valor. */
const GENDER: 'm' | 'f' = 'm';
const NAME = 'BL Buscarr';

const art = GENDER === 'm'
  ? { the: 'o', of: 'do', in: 'no', to: 'ao', by: 'pelo' }
  : { the: 'a', of: 'da', in: 'na', to: 'à', by: 'pela' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const BRAND = {
  name: NAME,
  /** Assinatura curta, usada em títulos, manifesto do app e rodapés. */
  tagline: 'Consulta veicular por placa',
  /** Nome em maiúsculas (documentos e contratos). */
  upper: NAME.toUpperCase(),

  // ── Nomes técnicos (têm de ser diferentes dos de outros sistemas: chaves, esquemas, cookies, salts) ──
  /** Identificador técnico: emissor do token, esquemas de relatório, salts, referências externas. */
  slug: 'blbuscar',
  /** Nome de arquivo baixado (PDFs, JSON): bl-buscar-<código>.pdf */
  fileSlug: 'bl-buscar',
  /** Rótulo curto sem espaço (ex.: aplicativo autenticador). */
  compact: 'BLBuscar',
  /** Prefixo de chaves do navegador, eventos e referências de pagamento (blb_token, blb:unauthorized). */
  prefix: 'blb',
  /** Prefixo de códigos legíveis (contratos, convites): BLB-2026-000001. */
  docPrefix: 'BLB',

  // ── Endereços e e-mails ──
  domain: 'buscarr.com.br',
  url: 'https://buscarr.com.br',
  adminHost: 'admin.buscarr.com.br',
  adminUrl: 'https://admin.buscarr.com.br',
  email: {
    from: 'no-reply@buscarr.com.br',
    replyTo: 'contato@buscarr.com.br',
    contact: 'contato@buscarr.com.br',
    support: 'contato@buscarr.com.br'
  },

  // ── Grupo ──
  group: {
    name: 'Sorte Tech',
    partnerName: 'Bolão Livre',
    /** Plataforma irmã do mesmo grupo. */
    partnerUrl: 'https://bolaolivre.com.br',
    /** Texto do rodapé (ajuste se a Sorte Tech definir outro). */
    footerText: 'Uma plataforma Sorte Tech'
  },

  // ── Dados legais e de contato: [PREENCHER] (o dono informa depois; a empresa emissora vem de Admin > Notas fiscais) ──
  legal: {
    companyName: '[PREENCHER: razão social]',
    cnpj: '[PREENCHER: CNPJ]',
    address: '[PREENCHER: endereço]',
    whatsapp: '[PREENCHER: WhatsApp]',
    instagram: '[PREENCHER: Instagram]'
  },

  // ── Cores (o tokens.css do front segue estes valores; o teste `marca` confere) ──
  colors: {
    primary: '#245A4B',
    primaryHover: '#153E34',
    primarySoft: '#E6EFEA',
    primaryInk: '#1C493D',
    accent: '#548674',
    gold: '#A9C4B6',
    night: '#101F1B',
    ink: '#152D26',
    text: '#152D26',
    muted: '#53675F',
    line: '#DBE5DE',
    soft: '#F6F7F4',
    onDark: '#CBDDD4'
  },

  // ── Artigos em português (ex.: "a equipe {of}" → "a equipe do BL Buscarr") ──
  the: `${art.the} ${NAME}`, The: `${cap(art.the)} ${NAME}`,
  of: `${art.of} ${NAME}`, Of: `${cap(art.of)} ${NAME}`,
  in: `${art.in} ${NAME}`, In: `${cap(art.in)} ${NAME}`,
  to: `${art.to} ${NAME}`, To: `${cap(art.to)} ${NAME}`,
  by: `${art.by} ${NAME}`, By: `${cap(art.by)} ${NAME}`
} as const;

/** "#245A4B" → [r,g,b] de 0 a 1 (para o pdf-lib: rgb(...hexToUnit(BRAND.colors.primary))). */
export function hexToUnit(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
