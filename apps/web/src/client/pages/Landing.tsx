import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../../shared/icons';
import { LinkButton, usePageTitle } from '../../shared/ui';
import { PublicHeader } from '../layouts';
import { useSession } from '../session';
import { trackFunnel } from '../funnel';
import PlateSearch from '../components/PlateSearch';
import { PackageCards, ProductCards, SmartPicker } from '../components/Catalog';
import Faq from '../components/Faq';
import Testimonials from '../components/Testimonials';
import { LatestPosts } from './Content';
import { HomeGuide, HomeSimulator } from '../components/HomeTools';
import { DetailsButton } from '../components/ConsultaDetails';
import { SeoContentAfterFaqs, useSeoH1 } from '../components/SeoContent';

import './landing.css';
const STEPS = [
  { t: 'Digite a placa', s: 'Aceita placa antiga e Mercosul. Sem cadastro de documentos.' },
  { t: 'Escolha a consulta', s: 'Do essencial à checagem completa. O preço aparece antes de pagar.' },
  { t: 'Receba o relatório', s: 'Resumo claro no topo, detalhes por seção e PDF com código de validação.' }
];
function HeroTitle() {
  const h1 = useSeoH1('/', '');
  return <h1 id="hero-title">{h1 || 'Consulta de placa e histórico veicular'}</h1>;
}

const FREE_TOOLS: Array<{ to: string; icon: IconName; title: string; text: string }> = [
  { to: '/fipe', icon: 'trending-up', title: 'Tabela FIPE grátis', text: 'Veja o preço médio por marca, modelo e ano.' },
  { to: '/simulador', icon: 'calculator', title: 'Simular financiamento', text: 'Estime as parcelas e o custo total.' },
  { to: '/validar', icon: 'shield-check', title: 'Validar relatório', text: 'Confira o código de um relatório emitido.' },
];

export default function Landing() {
  usePageTitle('');
  const { status } = useSession();
  useEffect(() => { trackFunnel('HOME_PAGE_VIEW', { landing: '/' }); }, []);
  return (
    <div className="buscar-home">
      <PublicHeader />
      <main id="conteudo">
        <section className="buscar-entry" aria-labelledby="hero-title">
          <div className="container buscar-entry-grid">
            <div className="buscar-entry-main">
              <HeroTitle />
              <p className="buscar-intro">Vai comprar um usado? Confira débitos, restrições financeiras e registros de leilão antes de negociar. Veja a cobertura de cada relatório.</p>
              <div className="buscar-search-panel">
                <strong>Qual é a placa do veículo?</strong>
                <PlateSearch authed={status === 'authed'} placement="hero" />
              </div>
              <div className="buscar-entry-actions">
                <Link className="linkbtn" to="/demonstracao">Ver consulta de exemplo <Icon name="arrow-right" size={17} /></Link>
                <a className="linkbtn" href="#consultas">Comparar consultas</a>
              </div>
            </div>
            <img className="buscar-hero-photo"
              src="/brand/landing/consulta-veicular-1200.webp"
              srcSet="/brand/landing/consulta-veicular-640.webp 640w, /brand/landing/consulta-veicular-1200.webp 1200w"
              sizes="(max-width: 760px) 92vw, (max-width: 1200px) 48vw, 600px"
              width={1200} height={800} fetchPriority="high" decoding="async"
              alt="Carro seminovo estacionado em frente a uma concessionária" />
          </div>
        </section>

        <section className="buscar-tools-section" aria-labelledby="tools-title">
          <div className="container buscar-tools" id="ferramentas-gratis">
            <h2 id="tools-title">Ferramentas para sua negociação</h2>
            {FREE_TOOLS.map((tool) => (
              <Link key={tool.to} to={tool.to} className="buscar-tool" onClick={() => trackFunnel('CTA_CLICKED', { placement: 'home_tools', target: tool.to, landing: '/' })}>
                <Icon name={tool.icon} size={23} />
                <span><strong>{tool.title}</strong><small>{tool.text}</small></span>
                <Icon name="arrow-right" size={18} />
              </Link>
            ))}
          </div>
        </section>

        <section className="section alt" id="consultas">
          <div className="container stack-lg">
            <div className="section-head" style={{ marginBottom: 0 }}><h2>Compare as consultas veiculares</h2><p>Compare o conteúdo e o preço de cada relatório antes de escolher.</p></div>
            <ProductCards homeOnly />
            <SmartPicker />
            <div className="row"><DetailsButton className="btn btn-primary">Detalhar e comparar consultas</DetailsButton><LinkButton to="/planos" iconRight="arrow-right">Ver preços e pacotes</LinkButton></div>
          </div>
        </section>

        <section className="section buscar-reading" id="como-funciona">
          <div className="container buscar-reading-grid">
            <div className="buscar-reading-intro">
              <Icon name="file-text" size={34} />
              <h2>Da placa ao relatório</h2>
              <p>Veja como escolher uma consulta e guardar o resultado para conferir depois.</p>
              <LinkButton to="/demonstracao" variant="outline-light">Abrir demonstração</LinkButton>
            </div>
            <ol className="buscar-timeline">
              {STEPS.map((step) => <li key={step.t}><h3>{step.t}</h3><p>{step.s}</p></li>)}
            </ol>
          </div>
        </section>

        <HomeSimulator />
        <HomeGuide />

        <section className="section" id="pacotes">
          <div className="container stack-lg">
            <div className="section-head" style={{ marginBottom: 0 }}><h2>Créditos para consultar com frequência</h2><p>Escolha um pacote e use o saldo conforme precisar.</p></div>
            <PackageCards />
          </div>
        </section>

        <section className="section custom-pack" aria-labelledby="custom-title">
          <div className="container">
            <div className="custom-card">
              <div>
                <span className="eyebrow">Para lojistas e empresas</span>
                <h2 id="custom-title">Consultas para equipes e lojistas</h2>
                <p>Consultas em volume com preço por consulta menor, acesso da equipe, histórico centralizado e a sua loja com vitrine, estoque e clientes. Montamos o pacote de acordo com o seu movimento.</p>
              </div>
              <div className="custom-cta">
                <LinkButton to="/para-lojistas" variant="primary" size="lg" iconRight="arrow-right">Ver pacotes para lojistas</LinkButton>
                <Link to="/contato" className="linkbtn">Falar com a equipe</Link>
              </div>
            </div>
          </div>
        </section>

        <section className="section buscar-editorial" aria-labelledby="buying-title">
          <div className="container buscar-editorial-grid">
            <img src="/brand/landing/avaliacao-carro-usado.webp" width={960} height={540}
              alt="Comprador inspeciona a carroceria de um veículo usado" loading="lazy" decoding="async" />
            <div className="buscar-editorial-copy">
              <h2 id="buying-title">O que verificar antes de comprar um carro usado?</h2>
              <p>Comece pelo histórico da placa. Confira se o veículo tem débitos, restrição financeira ou passagem por leilão e leve esses pontos para a negociação.</p>
              <ul>
                <li><Link to="/consultar-debitos-veiculo">Débitos do veículo</Link></li>
                <li><Link to="/consultar-gravame">Gravame e financiamento ativo</Link></li>
                <li><Link to="/consultar-leilao-veiculo">Passagem por leilão</Link></li>
                <li><Link to="/historico-veicular">Guia de histórico veicular</Link></li>
              </ul>
            </div>
          </div>
        </section>

        <section className="section alt" id="blog">
          <div className="container stack-lg">
            <div className="row-between"><div className="section-head" style={{ marginBottom: 0 }}><span className="eyebrow">Blog</span><h2>O que conferir antes de negociar</h2></div><LinkButton to="/blog" iconRight="arrow-right">Ver todos</LinkButton></div>
            <LatestPosts n={3} />
          </div>
        </section>

        <Testimonials />

        <section className="section" id="duvidas">
          <div className="container">
            <div className="section-head center"><h2>Perguntas sobre a consulta</h2></div>
            <Faq limit={6} />
            <div className="row" style={{ justifyContent: 'center', marginTop: 22 }}><Link to="/perguntas-frequentes" className="btn">Ver todas as perguntas</Link></div>
          </div>
        </section>

        <SeoContentAfterFaqs path="/" limit={6} faqTitle="Mais perguntas sobre consulta de placa" />
      </main>

    </div>
  );
}
