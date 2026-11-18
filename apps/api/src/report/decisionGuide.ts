import type { ReportV2 } from './normalizeV2.js';

const topics = [
  { id: 'judicial', keys: ['RESJUDICIAL', 'RESRENAJUD'], action: 'Peça ao vendedor comprovante oficial da baixa e confirme se a transferência está liberada.' },
  { id: 'theft', keys: ['VT_ROUBOFURTO', 'RESFURTO'], action: 'Confirme se o registro é histórico ou se existe restrição ativa antes de seguir com a negociação.' },
  { id: 'finance', keys: ['GR_SITUACAO', 'RESTRICAOFINAN', 'INTENCAORESTRICAOFINAN'], action: 'Peça a comprovação de quitação e confirme a baixa do gravame antes da transferência.' },
  { id: 'auction', keys: ['VT_LEILAO'], action: 'Peça o edital ou comprovante do leilão e confirme a aceitação do veículo com a seguradora.' },
  { id: 'damage', keys: ['VT_SINISTRO'], action: 'Solicite registros do reparo e considere uma vistoria independente para avaliar a estrutura.' },
  { id: 'recall', keys: ['VT_RECALL'], action: 'Confirme a campanha no fabricante e peça comprovante do atendimento.' },
  { id: 'debt', keys: ['EXISTEDEBITODEIPVA', 'EXISTEDEBITOMULTA', 'EXISTEDEBITODELICENCIAMENTO'], action: 'Confira a pendência no órgão responsável e combine por escrito quem fará a quitação.' }
] as const;

export function buildDecisionGuide(report: ReportV2) {
  const findings = topics.flatMap(({ id, keys, action }) => {
    for (const section of report.sections) {
      const item = section.items.find((entry) => keys.some((key) => key === entry.key) && entry.state === 'ALERT' && entry.sensitivity === 'PUBLIC' && !entry.masked);
      if (item) return [{ id, section: section.label, key: item.key, label: item.label, detail: item.display ?? item.value ?? '', action, high: item.high === true }];
    }
    return [];
  }).sort((a, b) => Number(b.high) - Number(a.high));
  const notProvided = report.sections.filter((section) => section.items.some((item) => item.sensitivity === 'PUBLIC' && item.state === 'NOT_PROVIDED')).map(({ label }) => label);
  return { findings, notProvided, outsideCoverage: report.scope?.notIncluded.map(({ label }) => label) ?? [] };
}

/** O modelo só ordena códigos permitidos. Resposta inválida preserva a ordem por regras. */
export function orderGuide<T extends { id: string }>(findings: T[], answer: string | null): T[] {
  if (!answer) return findings;
  const ids = answer.split(',').map((id) => id.trim());
  if (ids.length !== findings.length || new Set(ids).size !== findings.length) return findings;
  const byId = new Map(findings.map((finding) => [finding.id, finding]));
  if (ids.some((id) => !byId.has(id))) return findings;
  return ids.map((id) => byId.get(id)!);
}
