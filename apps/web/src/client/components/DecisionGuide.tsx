import { useState } from 'react';
import { errorMessage } from '../../shared/api';
import { Alert, Button } from '../../shared/ui';
import { api } from '../api';

interface Guide {
  findings: Array<{ id: string; section: string; key: string; label: string; detail: string; action: string }>;
  notProvided: string[];
  outsideCoverage: string[];
}

export default function DecisionGuide({ queryId }: { queryId: string }) {
  const [guide, setGuide] = useState<Guide | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setBusy(true); setError('');
    try { setGuide(await api.post<Guide>(`/queries/${encodeURIComponent(queryId)}/report/guide`, {})); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <section className="card card-pad stack no-print" aria-labelledby="decision-guide-title" style={{ marginBlock: 18 }}>
      <h2 id="decision-guide-title">Entenda seu relatório</h2>
      <p className="muted">Veja o que confirmar com o vendedor e quais informações ficaram fora da cobertura.</p>
      {!guide && <div><Button variant="primary" icon="file-text" loading={busy} onClick={() => void load()}>Ver orientações</Button></div>}
      {error && <Alert tone="warn">{error}</Alert>}
      {guide && (
        <div className="stack" aria-live="polite">
          {guide.findings.length ? (
            <ol className="stack" style={{ paddingInlineStart: 22 }}>
              {guide.findings.map((finding) => (
                <li key={finding.id}>
                  <h3>{finding.label}</h3>
                  <p>{finding.action}</p>
                  <p className="muted">No relatório: {finding.section} → {finding.label}{finding.detail ? ` · ${finding.detail}` : ''}</p>
                </li>
              ))}
            </ol>
          ) : <p>Nenhum dos alertas específicos deste guia apareceu nos campos analisados. Confira o veredito e os detalhes do relatório.</p>}
          {guide.notProvided.length > 0 && <p><b>Seções com campos sem retorno:</b> {guide.notProvided.join(', ')}.</p>}
          {guide.outsideCoverage.length > 0 && <p><b>Fora da cobertura:</b> {guide.outsideCoverage.join(', ')}.</p>}
        </div>
      )}
    </section>
  );
}
