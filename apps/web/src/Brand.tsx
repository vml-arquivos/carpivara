type BrandProps = { compact?: boolean; inverse?: boolean };

export const BRAND = {
  name: 'BUSCARR',
  descriptor: 'consulta e inteligência veicular',
  slogan: 'Busque os fatos. Decida com segurança.',
  // O fallback preserva o canal já operacional até DNS/e-mail BUSCARR serem homologados.
  supportEmail: String(import.meta.env.VITE_SUPPORT_EMAIL || 'contato@carpivara.casadf.com.br').trim()
} as const;

function BrandMark({ compact = false }: { compact?: boolean }) {
  return <span className={`brandMark ${compact ? 'brandMarkCompact' : ''}`} aria-hidden="true">
    <svg viewBox="0 0 44 44" focusable="false">
      <path className="brandShield" d="M22 3.8 37 9.2v9.7c0 9.9-5.5 17.4-15 21.3-9.5-3.9-15-11.4-15-21.3V9.2L22 3.8Z" />
      <path className="brandArc" d="M11.5 17.8c4.7-6.7 16.3-8.2 21.2-.2" />
      <path className="brandRoad" d="M14.2 27.8c2.6 3.1 6.7 5.6 11.8 7.1" />
      <path className="brandCheck" d="m13.5 23.8 6.3 6.1 11.3-13" />
      <circle className="brandNode" cx="33.3" cy="13.2" r="2" />
    </svg>
  </span>;
}

export default function Brand({ compact = false, inverse = false }: BrandProps) {
  return <div className={`brand ${compact ? 'brandCompact' : ''} ${inverse ? 'brandInverse' : ''}`} aria-label={`${BRAND.name}, ${BRAND.descriptor}`}>
    <BrandMark compact={compact} />
    <span className="brandWord">
      <strong><span className="brandBase">BUSCA</span><span className="brandRGold">R</span><span className="brandRTeal">R</span></strong>
      <small>{BRAND.descriptor}</small>
    </span>
  </div>;
}
