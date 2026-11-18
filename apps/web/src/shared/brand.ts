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

  the: `${art.the} ${NAME}`, The: `${cap(art.the)} ${NAME}`,
  of: `${art.of} ${NAME}`, Of: `${cap(art.of)} ${NAME}`,
  in: `${art.in} ${NAME}`, In: `${cap(art.in)} ${NAME}`,
  to: `${art.to} ${NAME}`, To: `${cap(art.to)} ${NAME}`,
  by: `${art.by} ${NAME}`, By: `${cap(art.by)} ${NAME}`
} as const;
