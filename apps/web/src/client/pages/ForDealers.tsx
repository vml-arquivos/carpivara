import { LinkButton } from '../../shared/ui';

const dealerPath = encodeURIComponent('/app/loja');

export default function ForDealers({ authenticated }: { authenticated: boolean }) {
  return (
    <section className="section">
      <div className="container stack-lg">
        <header className="stack">
          <h2>Uma vitrine pública para o estoque da sua loja</h2>
          <p className="muted">Publique seus veículos com fotos e preços e acompanhe os contatos e as propostas no painel do BL Buscarr.</p>
          <div className="row">
            {!authenticated && <LinkButton to={`/criar-conta?next=${dealerPath}`} variant="primary">Criar minha conta</LinkButton>}
            <LinkButton to="/app/loja">Acessar área do lojista</LinkButton>
          </div>
        </header>
        <div className="grid-2">
          <section className="card card-pad stack">
            <h3>Como ativar a sua loja</h3>
            <ol className="stack">
              <li>Crie sua conta e solicite a contratação na área do lojista.</li>
              <li>Combine as condições com a equipe e assine o contrato pelo link que receber.</li>
              <li>Após a liberação pela equipe, configure sua vitrine e publique os veículos que deseja anunciar.</li>
            </ol>
          </section>
          <section className="card card-pad stack">
            <h3>Como os compradores encontram seus veículos</h3>
            <p>Quem consultar um veículo pode buscar ofertas da mesma marca e modelo. Os anúncios disponíveis na sua vitrine podem aparecer nessa busca.</p>
            <p>A loja recebe o contato quando o comprador decide enviar uma mensagem pela vitrine.</p>
          </section>
        </div>
      </div>
    </section>
  );
}
