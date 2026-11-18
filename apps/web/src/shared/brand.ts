/**
 * FONTE ÚNICA DA MARCA (front). Espelho de apps/api/src/lib/brand.ts: o teste `marca` confere se os dois são iguais.
 * Para trocar a marca, altere os dois arquivos. Nada de segredo aqui.
 * Marcadores [PREENCHER: ...] = dado que o dono ainda vai informar.
 */
const GENDER: 'm' | 'f' = 'm';
const NAME = 'BL Buscarr';

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

  the: `${art.the} ${NAME}`, The: `${cap(art.the)} ${NAME}`,
  of: `${art.of} ${NAME}`, Of: `${cap(art.of)} ${NAME}`,
  in: `${art.in} ${NAME}`, In: `${cap(art.in)} ${NAME}`,
  to: `${art.to} ${NAME}`, To: `${cap(art.to)} ${NAME}`,
  by: `${art.by} ${NAME}`, By: `${cap(art.by)} ${NAME}`
} as const;
