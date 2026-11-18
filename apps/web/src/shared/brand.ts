/**
 * FONTE ÚNICA DA MARCA (front). Espelho de apps/api/src/lib/brand.ts: o teste `marca` confere se os dois são iguais.
 * Para trocar a marca, altere os dois arquivos. Nada de segredo aqui.
 * Marcadores [PREENCHER: ...] = dado que o dono ainda vai informar.
 */
const GENDER: 'm' | 'f' = 'm';
const NAME = 'BL Buscar';

const art = GENDER === 'm'
  ? { the: 'o', of: 'do', in: 'no', to: 'ao', by: 'pelo' }
  : { the: 'a', of: 'da', in: 'na', to: 'à', by: 'pela' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const BRAND = {
  name: NAME,
  tagline: 'Consulta veicular por placa',
  upper: NAME.toUpperCase(),

  slug: 'blbuscar',
  fileSlug: 'bl-buscar',
  compact: 'BLBuscar',
  prefix: 'blb',
  docPrefix: 'BLB',

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

  group: {
    name: 'Sorte Tech',
    partnerName: 'Bolão Livre',
    /** Plataforma irmã do mesmo grupo. */
    partnerUrl: 'https://bolaolivre.com.br',
    /** Texto do rodapé (ajuste se a Sorte Tech definir outro). */
    footerText: 'Uma plataforma Sorte Tech'
  },

  legal: {
    companyName: '[PREENCHER: razão social]',
    cnpj: '[PREENCHER: CNPJ]',
    address: '[PREENCHER: endereço]',
    whatsapp: '[PREENCHER: WhatsApp]',
    instagram: '[PREENCHER: Instagram]'
  },

  colors: {
    primary: '#0B7A43',
    primaryHover: '#086236',
    primarySoft: '#E3F5EA',
    primaryInk: '#065A33',
    accent: '#22A862',
    gold: '#F2B705',
    night: '#04140D',
    ink: '#0A2418',
    text: '#0F2A1D',
    muted: '#566B5F',
    line: '#DCE9E1',
    soft: '#F3F8F5',
    onDark: '#BFE3CE'
  },

  the: `${art.the} ${NAME}`, The: `${cap(art.the)} ${NAME}`,
  of: `${art.of} ${NAME}`, Of: `${cap(art.of)} ${NAME}`,
  in: `${art.in} ${NAME}`, In: `${cap(art.in)} ${NAME}`,
  to: `${art.to} ${NAME}`, To: `${cap(art.to)} ${NAME}`,
  by: `${art.by} ${NAME}`, By: `${cap(art.by)} ${NAME}`
} as const;
