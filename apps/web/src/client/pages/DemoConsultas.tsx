import { useSearchParams } from 'react-router-dom';
import ReportView from '../../shared/ReportView';
import type { ReportEnvelope } from '../../shared/reportTypes';
import { Alert, ErrorState, LinkButton, PageLoading, useAsync, usePageTitle } from '../../shared/ui';
import { api } from '../api';

interface Example { id: string; name: string; summary: string; plate: string }
type DemoResult = Pick<ReportEnvelope, 'productName' | 'consultedAt' | 'report'>;

function DemoReport({ id }: { id: string }) {
  const { data, error, reload } = useAsync(() => api.get<DemoResult>(`/demo-consultas/${encodeURIComponent(id)}`), [id]);
  if (error != null) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <PageLoading />;
  return <ReportView report={data.report} productName={data.productName} actions={
    <a className="btn btn-primary" href={`/api/demo-consultas/${encodeURIComponent(id)}/relatorio.pdf`}>Baixar PDF de exemplo</a>
  } />;
}

export default function DemoConsultas() {
  usePageTitle('Demonstração de consulta');
  const [params, setParams] = useSearchParams();
  const { data, error, reload } = useAsync(() => api.get<{ examples: Example[] }>('/demo-consultas'));
  const selection = data?.examples.find((example) => example.id === params.get('exemplo')) ?? data?.examples[0];

  return (
    <section className="section">
      <div className="container stack-lg">
        <div className="page-head"><div><h1>Demonstração de consulta</h1><p>Escolha um produto e veja como o relatório do BL Buscarr aparece para o cliente.</p></div></div>
        <Alert tone="warn" title="Demonstração · dados fictícios">As placas e os resultados abaixo são exemplos. O PDF é ilustrativo e não tem validade como consulta veicular.</Alert>
        {error != null && <ErrorState error={error} onRetry={reload} />}
        {error == null && !data && <PageLoading />}
        {data && selection && (
          <>
            <div className="card card-pad stack">
              <label className="field"><span className="lbl">Consulta de exemplo</span>
                <select className="input" value={selection.id} onChange={(event) => setParams({ exemplo: event.target.value })}>
                  {data.examples.map((example) => <option key={example.id} value={example.id}>{example.name} · {example.plate}</option>)}
                </select>
              </label>
              <p className="muted">{selection.summary}</p>
            </div>
            <DemoReport key={selection.id} id={selection.id} />
          </>
        )}
        <div><LinkButton to="/consultar">Ir para consulta por placa</LinkButton></div>
      </div>
    </section>
  );
}
