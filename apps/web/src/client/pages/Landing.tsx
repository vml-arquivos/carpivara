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
import { DetailsButton, PdfModelLink } from '../components/ConsultaDetails';
import { SeoContentAfterFaqs, useSeoH1 } from '../components/SeoContent';

import './landing.css';
const STEPS = [
  { t: 'Digite a placa', s: 'Aceita placa antiga e Mercosul. Sem cadastro de documentos.' },
  { t: 'Escolha a consulta', s: 'Do essencial à checagem completa. O preço aparece antes de pagar.' },
  { t: 'Receba o relatório', s: 'Resumo claro no topo, detalhes por seção e PDF com código de validação.' }
];
function HeroTitle() {
  const h1 = useSeoH1('/', '');
  return <h1 id="hero-title">{h1 || 'Histórico do veículo pela placa'}</h1>;
}

const FREE_TOOLS: Array<{ to: string; icon: IconName; title: string; text: string }> = [
  { to: '/fipe', icon: 'trending-up', title: 'Tabela FIPE grátis', text: 'Veja o preço médio por marca, modelo e ano.' },
  { to: '/simulador', icon: 'calculator', title: 'Simulador de financiamento', text: 'Calcule as parcelas e o custo total antes de pedir uma proposta.' },
];

export default function Landing() {
  usePageTitle('');
  const { status } = useSession();
  useEffect(() => { trackFunnel('HOME_PAGE_VIEW', { landing: '/' }); }, []);
  return (
    <div className="buscar-home">
      <PublicHeader />
      <section className="buscar-entry" aria-labelledby="hero-title">
        <div className="container buscar-entry-grid">
          <div className="buscar-entry-main">
            <HeroTitle />
            <p className="buscar-intro">Vai comprar um usado? Pesquise débitos, restrições e histórico antes de fazer a proposta.</p>
            <div className="buscar-search-panel">
              <strong>Qual é a placa do veículo?</strong>
              <PlateSearch authed={status === 'authed'} placement="hero" />
              <a className="linkbtn" href="#consultas">Comparar opções de consulta <Icon name="arrow-right" size={16} /></a>
            </div>
          </div>
          <aside className="buscar-tools" id="ferramentas-gratis" aria-labelledby="tools-title">
            <h2 id="tools-title">Ferramentas gratuitas</h2>
            {FREE_TOOLS.map((tool) => (
              <Link key={tool.to} to={tool.to} className="buscar-tool" onClick={() => trackFunnel('CTA_CLICKED', { placement: 'home_tools', target: tool.to, landing: '/' })}>
                <Icon name={tool.icon} size={23} />
                <span><strong>{tool.title}</strong><small>{tool.text}</small></span>
                <Icon name="arrow-right" size={18} />
              </Link>
            ))}
            <Link to="/validar" className="buscar-validate"><Icon name="shield-check" size={19} /> Validar um relatório</Link>
          </aside>
        </div>
      </section>

      <section className="section alt" id="consultas">
        <div className="container stack-lg">
          <div className="section-head" style={{ marginBottom: 0 }}><h2>O que você precisa verificar?</h2><p>Compare o conteúdo e o preço de cada relatório antes de escolher.</p></div>
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
            <PdfModelLink id="COMPLETE" className="btn btn-outline-light">Abrir exemplo de relatório</PdfModelLink>
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

    </div>
  );
}
