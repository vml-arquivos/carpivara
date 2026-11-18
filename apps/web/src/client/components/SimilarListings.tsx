import { useState } from 'react';
import { errorMessage } from '../../shared/api';
import { money } from '../../shared/format';
import { Alert, Button, LinkButton } from '../../shared/ui';
import { api } from '../api';

interface Listing {
  id: string; brand: string; model: string; version: string | null; yearModel: number | null;
  priceCents: number; storeName: string; storeSlug: string; city: string | null; state: string | null;
}

export default function SimilarListings({ queryId }: { queryId: string }) {
  const [items, setItems] = useState<Listing[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function search() {
    setBusy(true);
    setError('');
    try { setItems((await api.get<{ items: Listing[] }>(`/queries/${queryId}/similar-listings`)).items); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <section className="card card-pad stack no-print" style={{ marginTop: 22 }}>
      <div className="row-between">
        <div>
          <h2>Veículos semelhantes à venda</h2>
          <p className="muted">Veja ofertas da mesma marca e modelo, priorizando anos próximos. Sua consulta fica privada.</p>
        </div>
        {items === null && <Button icon="search" loading={busy} onClick={() => void search()}>Buscar ofertas</Button>}
      </div>
      {error && <Alert tone="warn">{error}</Alert>}
      {items?.length === 0 && <p className="muted" role="status">Nenhuma oferta compatível encontrada no estoque publicado.</p>}
      {!!items?.length && (
        <div className="vitrine-grid">
          {items.map((item) => (
            <article key={item.id} className="card card-pad stack-sm">
              <h3>{[item.brand, item.model, item.version].filter(Boolean).join(' ')}</h3>
              <p className="muted">{[item.storeName, item.city, item.state, item.yearModel].filter(Boolean).join(' · ')}</p>
              <strong>{money(item.priceCents)}</strong>
              <div><LinkButton to={`/loja/${item.storeSlug}/veiculo/${item.id}`} size="sm">Ver oferta</LinkButton></div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
