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
    primary: '#2563eb',
    primaryHover: '#1e40af',
    primarySoft: '#EFF6FF',
    primaryInk: '#1e40af',
    accent: '#60a5fa',
    gold: '#93C5FD',
    night: '#111827',
    ink: '#1f2937',
    text: '#1f2937',
    muted: '#4b5563',
    line: '#E5E7EB',
    soft: '#FFFFFF',
    onDark: '#E5E7EB'
  },

  // ── Artigos em português (ex.: "a equipe {of}" → "a equipe do BL Buscarr") ──
  the: `${art.the} ${NAME}`, The: `${cap(art.the)} ${NAME}`,
  of: `${art.of} ${NAME}`, Of: `${cap(art.of)} ${NAME}`,
  in: `${art.in} ${NAME}`, In: `${cap(art.in)} ${NAME}`,
  to: `${art.to} ${NAME}`, To: `${cap(art.to)} ${NAME}`,
  by: `${art.by} ${NAME}`, By: `${cap(art.by)} ${NAME}`
} as const;

/** "#2563eb" → [r,g,b] de 0 a 1 (para o pdf-lib: rgb(...hexToUnit(BRAND.colors.primary))). */
export function hexToUnit(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
