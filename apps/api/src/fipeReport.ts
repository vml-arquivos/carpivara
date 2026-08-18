import crypto from 'node:crypto';
import type { FipeProviderResult, FipeQuote } from './types.js';

const stripAccents = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '');
const escapeHtml = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

export function makeFipeQuote(result: FipeProviderResult, plate?: string): FipeQuote {
  const now = new Date().toISOString();
  const base = {
    provider: result.provider,
    source: result.source,
    consultedAt: now,
    referenceMonth: result.referenceMonth,
    referenceCode: result.referenceCode,
    vehicleType: result.vehicleType,
    brand: result.brand,
    model: result.model,
    year: result.year,
    fuel: result.fuel,
    modelYear: result.modelYear,
    fipeCode: result.fipeCode,
    valueCents: result.valueCents,
    valueLabel: result.valueLabel,
    plate: plate || undefined
  };
  const reportHash = crypto.createHash('sha256').update(JSON.stringify(base)).digest('hex');
  const documentCode = `CPF-${crypto.randomBytes(9).toString('base64url').toUpperCase()}`;
  return {
    ...base,
    documentCode,
    reportHash,
    estimatedNegotiation: {
      minCents: Math.round(result.valueCents * 0.9),
      maxCents: Math.round(result.valueCents * 1.1),
      disclaimer: 'Estimativa informativa calculada a partir do valor FIPE. O preço real varia conforme conservação, região, quilometragem, acessórios e histórico.'
    },
    blocks: [
      { key: 'FIPE', label: 'Valor FIPE', state: 'FOUND', message: 'Tabela FIPE vigente consultada.' },
      { key: 'IDENTITY', label: 'Dados cadastrais', state: 'NOT_QUERIED', message: 'Não consultado nesta modalidade.' },
      { key: 'RESTRICTIONS', label: 'Restrições e gravame', state: 'NOT_QUERIED', message: 'Não consultado nesta modalidade.' },
      { key: 'DEBTS', label: 'Débitos', state: 'NOT_QUERIED', message: 'Não consultado nesta modalidade.' },
      { key: 'RECALL', label: 'Recall', state: 'NOT_QUERIED', message: 'Não consultado nesta modalidade.' },
      { key: 'HISTORY', label: 'Leilão e sinistro', state: 'NOT_AVAILABLE', message: 'Disponibilidade conforme consulta e fonte contratada.' }
    ]
  };
}

export function reportSnapshot(quote: FipeQuote): Record<string, unknown> {
  return { schema: 'carpivara.fipe.report.v1', version: 1, report: quote };
}

function pdfObject(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

export function fipePdf(quote: FipeQuote): Buffer {
  const lines = [
    'CARPIVARA — RELATORIO FIPE GRATUITO',
    `Documento: ${quote.documentCode}`,
    `Validacao: ${quote.reportHash.slice(0, 24)}`,
    `Veiculo: ${quote.brand.name} / ${quote.model.name}`,
    `Ano: ${quote.year.name}${quote.fuel ? ` — ${quote.fuel}` : ''}`,
    `Codigo FIPE: ${quote.fipeCode}`,
    `Valor FIPE vigente: ${quote.valueLabel}`,
    `Referencia: ${quote.referenceMonth}`,
    `Fonte: ${quote.source}`,
    `Consultado em: ${new Date(quote.consultedAt).toLocaleString('pt-BR')}`,
    '',
    'ESTIMATIVA INFORMATIVA',
    `${formatCents(quote.estimatedNegotiation?.minCents ?? 0)} a ${formatCents(quote.estimatedNegotiation?.maxCents ?? 0)}`,
    'O preco real varia conforme conservacao, regiao, quilometragem,',
    'acessorios e historico. Esta faixa nao e um preco oficial.',
    '',
    'O QUE A FIPE NAO VERIFICA',
    'Gravame, restricoes, debitos, roubo/furto, leilao ou sinistro.',
    'Consulte a situacao documental antes de concluir uma negociacao.',
    '',
    'BLOCOS NAO CONSULTADOS',
    'Dados cadastrais | Restricoes e gravame | Debitos | Recall',
    '',
    'Validacao publica: /validar-relatorio/' + quote.documentCode
  ];
  const content = ['BT', '/F1 10 Tf', '50 780 Td', ...lines.map((line) => `(${pdfObject(stripAccents(line).slice(0, 110))}) Tj 0 -18 Td`), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

export function fipePrintHtml(quote: FipeQuote): string {
  const blocks = quote.blocks.map((block) => `<li><strong>${escapeHtml(block.label)}</strong>: ${escapeHtml(block.state)} — ${escapeHtml(block.message)}</li>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório FIPE ${escapeHtml(quote.documentCode)}</title><style>
  @page{size:A4;margin:18mm}body{font-family:Arial,sans-serif;color:#1f2937;line-height:1.45;max-width:760px;margin:0 auto}header{border-bottom:3px solid #0f766e;padding-bottom:12px;margin-bottom:22px}h1{font-size:22px;margin:0;color:#0f766e}h2{font-size:15px;margin-top:24px;color:#0f766e}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.card{border:1px solid #d1d5db;border-radius:8px;padding:12px}.muted{color:#6b7280;font-size:12px}ul{padding-left:18px}.notice{background:#f0fdfa;border-left:4px solid #0f766e;padding:12px}.print{margin:20px 0;padding:10px 16px;border:0;background:#0f766e;color:white;border-radius:6px}@media print{.print{display:none}.card{break-inside:avoid}}
  </style></head><body><header><h1>Carpivara — Relatório FIPE gratuito</h1><div class="muted">Documento ${escapeHtml(quote.documentCode)} · Hash ${escapeHtml(quote.reportHash)}</div></header><div class="grid"><div class="card"><strong>Veículo</strong><br>${escapeHtml(quote.brand.name)} / ${escapeHtml(quote.model.name)}<br>Ano: ${escapeHtml(quote.year.name)}<br>Combustível: ${escapeHtml(quote.fuel || 'Não informado')}</div><div class="card"><strong>Valor FIPE vigente</strong><br><span style="font-size:24px">${escapeHtml(quote.valueLabel)}</span><br>Referência: ${escapeHtml(quote.referenceMonth)}<br>Código: ${escapeHtml(quote.fipeCode)}</div></div><p class="muted">Fonte: ${escapeHtml(quote.source)} · Consulta realizada em ${escapeHtml(new Date(quote.consultedAt).toLocaleString('pt-BR'))}</p><h2>Estimativa informativa</h2><p>${escapeHtml(formatCents(quote.estimatedNegotiation?.minCents ?? 0))} a ${escapeHtml(formatCents(quote.estimatedNegotiation?.maxCents ?? 0))}. ${escapeHtml(quote.estimatedNegotiation?.disclaimer)}</p><h2>O que a FIPE não verifica</h2><div class="notice">A Tabela FIPE informa o valor médio, mas não verifica gravame, restrições, débitos, roubo/furto, leilão ou sinistro. Consulte a situação documental antes de concluir uma negociação.</div><h2>Estados do relatório</h2><ul>${blocks}</ul><p class="muted">Validação pública: /validar-relatorio/${escapeHtml(quote.documentCode)}</p><button class="print" onclick="window.print()">Imprimir</button></body></html>`;
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
