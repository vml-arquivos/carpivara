import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API = '/api';
type Theme = 'light' | 'dark' | 'system';
type View = 'consult' | 'history' | 'wallet' | 'settings' | 'admin';
type Product = { id: string; name: string; description: string; creditCost: number; slug?: string; features?: string[]; isFree?: boolean; featured?: boolean };
type FipeItem = { code: string; name: string };
type FipeOffer = { id: string; name: string; description: string; creditCost: number; features?: string[]; commercialStatus?: string; featured?: boolean };
type FipeVehicleDetails = { plate: string; brand?: string; model?: string; fullModel?: string; manufactureYear?: string; modelYear?: string; color?: string; fuel?: string; power?: string; displacement?: string; type?: string; species?: string; category?: string; body?: string; passengers?: string; loadCapacity?: string; origin?: string; city?: string; state?: string; licensingYear?: string; status?: string };
type FipeQuote = { documentCode: string; reportHash: string; consultedAt: string; referenceMonth: string; vehicleType: 'cars' | 'motorcycles' | 'trucks'; brand: FipeItem; model: FipeItem; year: FipeItem; fuel?: string; fipeCode: string; valueCents: number; valueLabel: string; estimatedNegotiation?: { minCents: number; maxCents: number; disclaimer: string }; blocks: Array<{ key: string; label: string; state: string; message: string }>; plate?: string; vehicleDetails?: FipeVehicleDetails };
const fipeTypeLabels: Record<FipeQuote['vehicleType'], string> = { cars: 'Carros', motorcycles: 'Motos', trucks: 'Caminhões' };
type User = { id: string; email: string; name: string; role: string };
type Debt = { key: string; label: string; amountCents: number; hasDebt: boolean };
type Restriction = { key: string; label: string; status: string; alert: boolean };
type Report = {
  identification: { plate: string; renavam?: string; chassis?: string; engine?: string; gearbox?: string; brand?: string; model?: string; fullModel?: string };
  characteristics: { manufactureYear?: string; modelYear?: string; color?: string; fuel?: string; power?: string; displacement?: string; type?: string; species?: string; category?: string; body?: string; axles?: string; passengers?: string; loadCapacity?: string; origin?: string };
  registration: { city?: string; state?: string; licensingDate?: string; licensingYear?: string; status?: string };
  owner: { name?: string; document?: string; documentType?: string };
  debts: Debt[];
  restrictions: Restriction[];
  recall?: string;
  diagnostic: { level: 'CLEAR' | 'ATTENTION' | 'HIGH_RISK'; title: string; reason: string };
};
type Query = { id: string; plate: string; productId: string; productName: string; status: string; creditsCost: number; provider: string; createdAt: string; completedAt?: string; result: Report | null };
type Transaction = { id: string; kind: string; amount: number; balanceBefore: number; balanceAfter: number; description: string; createdAt: string };
type Me = { user: User; balance: number; permissions: string[]; identities?: string[] };
type OAuthProviderStatus = { id: 'google' | 'microsoft' | 'apple'; label: string; enabled: boolean };
type AdminSummary = { active_users: string; new_users_30d: string; queries_today: string; successful_queries: string; failed_queries: string; refunds: string; credits_sold: string; credits_consumed: string; confirmed_revenue_cents: string; confirmed_sales: string; average_ticket_cents: string; open_checkout_cents: string; refunded_revenue_cents: string; credits_in_wallets: string; fipe_started?: string; fipe_completed?: string; fipe_saved?: string; fipe_pdf_downloads?: string; fipe_provider_failures_24h?: string; fipe_provider_last_success?: string; fipe_save_rate_pct?: string };
type AdminUser = { id: string; name: string; email: string; role: string; active: boolean; createdAt: string; lastLoginAt?: string; balance: number; queriesCount: number };
type AdminPayment = { id: string; status: string; amountCents: number; credits: number; provider: string; externalId?: string; createdAt: string; paidAt?: string; customer: { name: string; email: string } };
type AdminQuery = { id: string; plate: string; status: string; creditsCost: number; provider: string; productName: string; createdAt: string; completedAt?: string; errorCode?: string; customer: { name: string; email: string } };
type CreditPackage = { slug: string; name: string; description: string; credits: number; priceCents: number };
type ApiError = { error?: string; message?: string };

const formatCredits = (value: number) => new Intl.NumberFormat('pt-BR').format(value);
const formatMoney = (value: number) => (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
const mask = (value?: string) => !value ? '—' : value.length <= 5 ? value : `${value.slice(0, 3)}••••${value.slice(-3)}`;

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? 'brandCompact' : ''}`} aria-label="CARPIVARA, consulta veicular inteligente">
    <span className="brandMark brandMarkOfficial" aria-hidden="true"><img src="/brand/carpivara-crest-final.png" alt="" /></span>
    <span className="brandWord"><strong><span>CAR</span>PIVARA</strong><small>consulta veicular inteligente</small></span>
  </div>;
}

function ThemeControl({ theme, setTheme }: { theme: Theme; setTheme: (theme: Theme) => void }) {
  return <div className="themeControl" role="group" aria-label="Tema de aparência">
    {([['light', 'Claro'], ['dark', 'Escuro'], ['system', 'Sistema']] as [Theme, string][]).map(([value, label]) => (
      <button key={value} className={theme === value ? 'selected' : ''} onClick={() => setTheme(value)} aria-pressed={theme === value}>{label}</button>
    ))}
  </div>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = { SUCCESS: 'Concluída', REFUNDED: 'Estornada', PROCESSING: 'Em processamento', FAILED: 'Falhou' };
  return <span className={`status status-${status.toLowerCase()}`}>{map[status] ?? status}</span>;
}

function Landing({ theme, setTheme, onAccess }: { theme: Theme; setTheme: (value: Theme) => void; onAccess: (mode: 'login' | 'register') => void }) {
  return <div className="landing">
    <header className="publicHeader"><Brand compact /><nav aria-label="Navegação principal"><a href="#como-funciona">Como funciona</a><a href="#planos">Planos</a><a href="#conteudos">Conteúdos</a><a href="#faq">Dúvidas</a><button className="textButton" onClick={() => onAccess('login')}>Entrar</button></nav><ThemeControl theme={theme} setTheme={setTheme} /></header>
    <main>
      <section className="hero">
        <div className="heroContent">
          <p className="kicker">Consulta veicular inteligente</p>
          <h1>Puxe os fatos.<br /><em>Descubra a verdade.</em></h1>
          <p className="heroLead">A CARPIVARA é sua central de consulta veicular: crie uma conta gratuita, acesse o dashboard, compre créditos somente quando precisar e mantenha cada relatório organizado em um único lugar.</p>
          <div className="heroActions"><button className="primaryButton" onClick={() => onAccess('register')}>Criar conta gratuita <span>→</span></button><a className="secondaryButton" href="/fipe">Consultar FIPE grátis</a><a className="secondaryButton" href="#como-funciona">Entender como funciona</a></div>
          <div className="heroTrust"><span><b>Dashboard pessoal</b> desde o primeiro acesso</span><span><b>Pagamento somente</b> ao comprar créditos</span><span><b>Relatórios protegidos</b> na sua conta</span></div>
        </div>
        <div className="vehicleCard" aria-label="Experiência CARPIVARA com imagem de veículo premium">
          <img className="vehiclePhoto" src="/images/hero-luxury-night.jpeg" alt="Automóvel premium em movimento durante a noite" />
          <div className="vehicleOverlay"></div>
          <div className="vehicleTop"><span className="miniBrand">CARPIVARA · INTELIGÊNCIA VEICULAR</span><span className="secureTag">Dados para decidir</span></div>
          <div className="vehicleContent"><p>Decisão respaldada</p><h2>Leitura objetiva para cada negociação.</h2><span className="plateVisual">CONSULTA PROTEGIDA</span></div>
          <div className="reportPreview"><div><small>Identificação</small><strong>Origem e dados-chave</strong></div><div><small>Ocorrências</small><strong>Sinais de atenção</strong></div><div><small>Histórico</small><strong>Na sua conta</strong></div></div>
        </div>
      </section>
      <section className="featureStrip" id="beneficios"><div><span>01</span><strong>Crie sua conta</strong><p>Cadastre-se sem cobrança e acesse seu dashboard pessoal.</p></div><div><span>02</span><strong>Compre créditos quando precisar</strong><p>O pagamento acontece apenas ao escolher um pacote de consultas.</p></div><div><span>03</span><strong>Consulte e acompanhe</strong><p>Veja relatórios, carteira e histórico organizados na sua conta.</p></div></section>
      <section className="howItWorks" id="como-funciona"><div><p className="kicker">Como funciona</p><h2>Uma conta. Uma carteira. Decisões mais seguras.</h2><p className="sectionLead">O acesso ao dashboard é gratuito. Você só realiza pagamento se decidir comprar créditos para uma consulta; depois, cada relatório fica salvo em seu histórico.</p></div><ol><li><b>01</b><div><strong>Crie e acesse sua conta</strong><p>Cadastre-se com e-mail e senha para entrar no seu dashboard pessoal, sem pagamento inicial.</p></div></li><li><b>02</b><div><strong>Escolha créditos quando for consultar</strong><p>Na carteira, selecione um pacote e conclua a compra pelo checkout seguro somente quando precisar.</p></div></li><li><b>03</b><div><strong>Consulte e acompanhe</strong><p>Informe a placa, receba o retorno da consulta e mantenha o relatório no seu histórico.</p></div></li></ol></section>
      <section className="plansSection" id="planos"><div className="sectionHeading"><p className="kicker">Créditos de consulta</p><h2>Comece com sua conta. Escolha créditos quando precisar.</h2><p>Criar e acessar o dashboard é gratuito. Na sua carteira, você verá os pacotes e só seguirá para pagamento se decidir comprar créditos para consultar.</p></div><div className="publicPlans"><article><span>Essencial</span><h3>Para começar</h3><p>Identificação e leitura inicial do veículo.</p><strong>Uso pontual</strong><button className="secondaryButton" onClick={() => onAccess('register')}>Criar conta</button></article><article className="featuredPlan"><span>Mais escolhido</span><h3>Completo</h3><p>Uma visão ampla, organizada para apoiar sua decisão.</p><strong>Compra de veículo</strong><button className="primaryButton" onClick={() => onAccess('register')}>Criar conta e acessar <span>→</span></button></article><article><span>Profissional</span><h3>Para operações</h3><p>Créditos e controles pensados para uso recorrente.</p><strong>Volume e equipe</strong><button className="secondaryButton" onClick={() => onAccess('register')}>Criar conta</button></article></div></section>
      <section className="contentSection" id="conteudos"><div className="sectionHeading"><p className="kicker">Conteúdo para decidir melhor</p><h2>O que observar antes de fechar negócio.</h2></div><div className="articleGrid"><article><span>GUIA</span><h3>Como consultar a placa de um veículo antes de comprar</h3><p>Entenda quais dados ajudam a reduzir incertezas em uma negociação.</p><a href="#faq">Ler orientação →</a></article><article><span>SEGURANÇA</span><h3>Por que histórico e documentação merecem atenção</h3><p>Uma decisão responsável considera dados técnicos, contexto e verificações oficiais.</p><a href="#faq">Ler orientação →</a></article><article><span>CARTEIRA</span><h3>Como funcionam os créditos de consulta</h3><p>Veja como a carteira registra compras, consultas e eventuais estornos.</p><a href="#faq">Ler orientação →</a></article></div></section>
      <section className="faqSection" id="faq"><div className="sectionHeading"><p className="kicker">Dúvidas frequentes</p><h2>Transparência antes de cada consulta.</h2></div><div className="faqGrid"><article><h3>O que eu recebo ao consultar?</h3><p>Você recebe um relatório com os dados disponibilizados pela consulta e pelo produto escolhido.</p></article><article><h3>Quando meus créditos são consumidos?</h3><p>O consumo ocorre ao iniciar a consulta. Se houver falha técnica na integração, a carteira registra o estorno de acordo com a regra operacional.</p></article><article><h3>Meus relatórios ficam salvos?</h3><p>Sim. Os relatórios concluídos ficam vinculados à sua conta para consulta posterior, respeitando as regras de acesso e privacidade.</p></article></div></section>
      <section className="publicCta"><div><p className="kicker">A sua próxima decisão começa aqui</p><h2>Crie sua conta e tenha sua central de consulta veicular.</h2><p>Sem cobrança para acessar o dashboard. Você compra créditos apenas quando quiser consultar.</p></div><button className="primaryButton" onClick={() => onAccess('register')}>Criar minha conta <span>→</span></button></section>
    </main>
    <footer><strong>CARPIVARA</strong><span>Consulta veicular inteligente, com transparência desde o primeiro passo.</span><a href="mailto:contato@carpivara.casadf.com.br">contato@carpivara.casadf.com.br</a></footer>
  </div>;
}

function FipeView({ token = '', onAccess, onBack }: { token?: string; onAccess: () => void; onBack: () => void }) {
  const [mode, setMode] = useState<'plate' | 'manual'>('plate');
  const [vehicleType, setVehicleType] = useState<FipeQuote['vehicleType']>('cars');
  const [brands, setBrands] = useState<FipeItem[]>([]);
  const [models, setModels] = useState<FipeItem[]>([]);
  const [years, setYears] = useState<FipeItem[]>([]);
  const [brand, setBrand] = useState<FipeItem | null>(null);
  const [model, setModel] = useState<FipeItem | null>(null);
  const [year, setYear] = useState<FipeItem | null>(null);
  const [quote, setQuote] = useState<FipeQuote | null>(null);
  const [offers, setOffers] = useState<FipeOffer[]>([]);
  const [plate, setPlate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  async function loadOptions(path: string): Promise<FipeItem[]> {
    const response = await fetch(`${API}${path}`, { headers });
    const body = await response.json() as { brands?: FipeItem[]; models?: FipeItem[]; years?: FipeItem[]; message?: string };
    if (!response.ok) throw new Error(body.message ?? 'Não foi possível carregar a consulta.');
    return body.brands ?? body.models ?? body.years ?? [];
  }

  useEffect(() => {
    if (mode !== 'manual') return;
    setBrand(null); setModel(null); setYear(null); setModels([]); setYears([]); setError('');
    void loadOptions(`/fipe/brands?vehicleType=${vehicleType}`).then(setBrands).catch((reason) => setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as marcas.'));
  }, [mode, vehicleType]);
  useEffect(() => { void fetch(`${API}/fipe/offers`, { headers }).then((response) => response.json() as Promise<{ offers?: FipeOffer[] }>).then((body) => setOffers(body.offers ?? [])).catch(() => setOffers([])); }, [token]);
  useEffect(() => { if (!brand || mode !== 'manual') return; setModel(null); setYear(null); setYears([]); void loadOptions(`/fipe/models?vehicleType=${vehicleType}&brandCode=${encodeURIComponent(brand.code)}`).then(setModels).catch((reason) => setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os modelos.')); }, [brand, mode, vehicleType]);
  useEffect(() => { if (!brand || !model || mode !== 'manual') return; setYear(null); void loadOptions(`/fipe/years?vehicleType=${vehicleType}&brandCode=${encodeURIComponent(brand.code)}&modelCode=${encodeURIComponent(model.code)}`).then(setYears).catch((reason) => setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os anos.')); }, [brand, model, mode, vehicleType]);

  async function consultFipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanPlate = plate.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (mode === 'plate' && cleanPlate.length !== 7) { setError('Informe uma placa válida com 7 caracteres.'); return; }
    if (mode === 'manual' && (!brand || !model || !year)) { setError('Escolha veículo, marca, modelo e ano para consultar.'); return; }
    setLoading(true); setError(''); setQuote(null); setSaved(false);
    try {
      const bodyInput = mode === 'plate' ? { plate: cleanPlate } : { vehicleType, brand, model, year, plate: cleanPlate || undefined };
      const response = await fetch(`${API}/fipe/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(bodyInput) });
      const body = await response.json() as FipeQuote & { message?: string };
      if (!response.ok) throw new Error(body.message ?? 'Não foi possível concluir a consulta para esta placa.');
      if (!body.brand?.name || !body.model?.name || !body.year?.name || !body.valueLabel || !body.fipeCode) throw new Error('Não foi possível confirmar todos os dados do veículo e da FIPE. Tente novamente.');
      setQuote(body);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível concluir a consulta.'); }
    finally { setLoading(false); }
  }

  function requireAccount(action: 'print' | 'pdf' | 'save') {
    if (!token) { sessionStorage.setItem('carpivara_fipe_return', '1'); onAccess(); return; }
    if (!quote) return;
    const url = `${API}/fipe/reports/${quote.documentCode}/${action === 'print' ? 'print' : 'pdf'}`;
    if (action === 'save') { void saveReport(); return; }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function saveReport() {
    if (!quote || !token) return;
    setLoading(true); setError('');
    try {
      const response = await fetch(`${API}/fipe/quotes/${quote.documentCode}/save`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers } });
      const body = await response.json() as { message?: string };
      if (!response.ok) throw new Error(body.message ?? 'Não foi possível salvar o relatório.');
      setSaved(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o relatório.'); }
    finally { setLoading(false); }
  }

  const details = quote?.vehicleDetails;
  const detailFields: Array<[string, string | undefined]> = quote ? ([
    ['Placa', details?.plate || quote.plate],
    ['Marca', details?.brand || quote.brand.name],
    ['Modelo identificado', details?.fullModel || details?.model || `${quote.brand.name} ${quote.model.name}`],
    ['Ano de fabricação', details?.manufactureYear],
    ['Ano do modelo', details?.modelYear || quote.year.name],
    ['Cor', details?.color],
    ['Combustível', details?.fuel || quote.fuel],
    ['Potência', details?.power],
    ['Cilindrada', details?.displacement],
    ['Tipo', details?.type],
    ['Espécie', details?.species],
    ['Categoria', details?.category],
    ['Carroceria', details?.body],
    ['Passageiros', details?.passengers],
    ['Capacidade de carga', details?.loadCapacity],
    ['Procedência', details?.origin],
    ['Município', details?.city],
    ['UF', details?.state],
    ['Ano do licenciamento', details?.licensingYear],
    ['Situação informada', details?.status]
  ] as Array<[string, string | undefined]>).filter((entry): entry is [string, string] => Boolean(entry[1])) : [];
  const notQueried = quote?.blocks.filter((block) => block.key !== 'FIPE' && block.state !== 'FOUND') ?? [];

  return <div className="fipePage"><header className="publicHeader"><Brand compact /><div className="fipeHeaderActions"><button className="textButton" onClick={onBack}>Voltar</button>{!token && <button className="primaryButton compact" onClick={onAccess}>Criar conta</button>}</div></header><main className="fipeMain">
    <section className="fipeHero"><div><p className="kicker">Consulta zero</p><h1>Descubra o valor médio antes de negociar.</h1><p>Informe a placa e confirme automaticamente a identificação do veículo. Só exibimos o resultado quando a identificação e os dados FIPE estão completos.</p></div><div className="fipePromise"><strong>R$ 0</strong><span>sem cobrança</span><small>A Consulta zero informa o valor médio FIPE. Ela não verifica gravame, sinistro, débitos, roubo/furto, leilão ou outras ocorrências documentais.</small></div></section>
    <section className="fipeFormCard"><div className="sectionHeading"><p className="kicker">Passo 1 de 2</p><h2>Comece pela placa</h2><p>Identificamos marca, modelo, anos e características disponíveis para então localizar a cotação FIPE correspondente.</p></div><div className="fipeModeTabs" role="tablist" aria-label="Modo de consulta"><button type="button" className={mode === 'plate' ? 'active' : ''} onClick={() => { setMode('plate'); setError(''); }} role="tab" aria-selected={mode === 'plate'}>Consultar por placa</button><button type="button" className={mode === 'manual' ? 'active' : ''} onClick={() => { setMode('manual'); setError(''); }} role="tab" aria-selected={mode === 'manual'}>Escolher veículo manualmente</button></div><form onSubmit={consultFipe}>{mode === 'plate' ? <div className="fipePlatePanel"><label>Placa do veículo<input value={plate} onChange={(event) => setPlate(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7))} placeholder="ABC1D23" maxLength={7} autoComplete="off" autoFocus /><small>Digite a placa sem espaços ou caracteres especiais.</small></label><div className="plateBenefit"><strong>Identificação + FIPE</strong><span>A placa é consultada primeiro; a cotação só aparece após a confirmação do veículo correspondente.</span></div></div> : <div className="fipeFields"><label>Tipo<select value={vehicleType} onChange={(event) => setVehicleType(event.target.value as FipeQuote['vehicleType'])}><option value="cars">Carros</option><option value="motorcycles">Motos</option><option value="trucks">Caminhões</option></select></label><label>Marca<select value={brand?.code ?? ''} onChange={(event) => setBrand(brands.find((item) => item.code === event.target.value) ?? null)}><option value="">Selecione</option>{brands.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label><label>Modelo<select value={model?.code ?? ''} disabled={!brand} onChange={(event) => setModel(models.find((item) => item.code === event.target.value) ?? null)}><option value="">Selecione</option>{models.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label><label>Ano<select value={year?.code ?? ''} disabled={!model} onChange={(event) => setYear(years.find((item) => item.code === event.target.value) ?? null)}><option value="">Selecione</option>{years.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label></div>}{error && <div className="notice noticeError" role="alert">{error}</div>}<div className="fipeFormFooter"><span><strong>Consulta zero</strong> · valor médio FIPE sem consulta documental</span><button className="primaryButton" disabled={loading || (mode === 'plate' ? plate.length !== 7 : !brand || !model || !year)}>{loading ? 'Confirmando veículo...' : 'Consultar FIPE agora'} <span>→</span></button></div></form></section>
    {quote && <section className="fipeResultCard"><div className="fipeResultHeader"><div><p className="kicker">Consulta zero concluída</p><h2>{details?.fullModel || `${quote.brand.name} ${quote.model.name}`}</h2><p>{fipeTypeLabels[quote.vehicleType]} · ano FIPE {quote.year.name} · {quote.fuel || details?.fuel || 'combustível não informado'}</p>{quote.plate && <p>Placa consultada: <strong>{quote.plate}</strong></p>}</div><div className="fipeValue"><small>Valor médio FIPE</small><strong>{quote.valueLabel}</strong><span>Referência {quote.referenceMonth}</span></div></div><div className="fipeResultIntro"><strong>Dados confirmados para esta consulta</strong><span>O resultado abaixo combina a identificação do veículo e a cotação FIPE encontrada para a referência indicada.</span></div>{detailFields.length > 0 && <><h3 className="fipeSubheading">Dados do veículo</h3><dl className="fipeDetailGrid">{detailFields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></>}<h3 className="fipeSubheading">Dados da FIPE</h3><div className="fipeDataGrid"><div><span>Marca</span><strong>{quote.brand.name}</strong></div><div><span>Modelo FIPE</span><strong>{quote.model.name}</strong></div><div><span>Ano FIPE</span><strong>{quote.year.name}</strong></div><div><span>Código FIPE</span><strong>{quote.fipeCode}</strong></div><div><span>Referência</span><strong>{quote.referenceMonth}</strong></div><div><span>Valor médio</span><strong>{quote.valueLabel}</strong></div></div>{quote.estimatedNegotiation && <div className="fipeEstimate"><strong>Faixa apenas informativa: {formatMoney(quote.estimatedNegotiation.minCents)} a {formatMoney(quote.estimatedNegotiation.maxCents)}</strong><p>{quote.estimatedNegotiation.disclaimer}</p></div>}<div className="fipeLimitCard"><div><p className="kicker">Limite da Consulta zero</p><h3>A FIPE orienta. A consulta completa investiga.</h3><p>Este resultado não traz gravame, sinistro, débitos, restrições, roubo/furto, leilão ou outras informações documentais.</p></div><div className="fipeLimitList">{notQueried.slice(0, 6).map((block) => <span key={block.key}>— {block.label}</span>)}</div></div><div className="fipeSalesCta"><div><p className="kicker">Próximo passo</p><h3>Tenha acesso à consulta completa</h3><p>Quer saber se há impedimentos ou ocorrências antes de negociar? Avance para a análise adequada ao seu objetivo.</p></div><div className="fipeCtaButtons"><button className="primaryButton" onClick={onAccess}>Tenha acesso à consulta completa <span>→</span></button><button className="secondaryButton" onClick={() => document.getElementById('fipe-offers')?.scrollIntoView({ behavior: 'smooth' })}>Continuar só com a FIPE</button></div></div><div className="fipeActions"><button className="secondaryButton" onClick={() => requireAccount('print')}>Imprimir dados</button><button className="secondaryButton" onClick={() => requireAccount('pdf')}>Gerar PDF</button><button className="primaryButton" onClick={() => requireAccount('save')} disabled={loading || saved}>{saved ? 'Salvo no histórico' : token ? 'Salvar no histórico' : 'Criar conta gratuita'} <span>→</span></button></div>{!token && <p className="fipeGateNotice">O valor FIPE é gratuito. Para imprimir, gerar PDF ou salvar o relatório, crie sua conta gratuita.</p>}<div className="fipeReportMeta"><span>Documento <b>{quote.documentCode}</b></span><span>Validação pública disponível após gerar o relatório</span></div></section>}
    {offers.filter((offer) => offer.id !== 'FIPE_FREE').length > 0 && <section className="fipeOffers" id="fipe-offers"><div className="sectionHeading"><p className="kicker">Próximos níveis de segurança</p><h2>Continue só com a FIPE ou aprofunde a consulta.</h2><p>A Consulta zero é gratuita e suficiente para orientar o valor médio. Quando precisar de segurança documental, escolha a próxima análise.</p></div><div className="fipeOfferGrid">{offers.filter((offer) => offer.id !== 'FIPE_FREE').map((offer) => { const soon = offer.commercialStatus !== 'ACTIVE'; return <article key={offer.id} className={offer.featured ? 'featuredOffer' : ''}><span className="offerStatus">{soon ? 'Disponibilidade em breve' : `${formatCredits(offer.creditCost)} créditos`}</span><h3>{offer.name}</h3><p>{offer.description}</p><button className={soon ? 'secondaryButton' : 'primaryButton'} disabled={soon} onClick={onAccess}>{soon ? 'Em breve' : 'Tenha acesso'}{!soon && <span>→</span>}</button></article>; })}</div></section>}
  </main><footer><strong>CARPIVARA</strong><span>Consulta zero para orientar o valor. Consulta completa para aprofundar a decisão.</span></footer></div>;
}
function ValidationPage({ code }: { code: string }) { const [result, setResult] = useState<{ authentic: boolean; status?: string; reportKind?: string; documentCode?: string; createdAt?: string; hash?: string; fipeReferenceMonth?: string } | null>(null); useEffect(() => { void fetch(`${API}/validar-relatorio/${encodeURIComponent(code)}`).then((response) => response.json()).then(setResult).catch(() => setResult({ authentic: false, status: 'ERROR' })); }, [code]); return <div className="validationPage"><Brand /><section className="validationCard"><p className="kicker">Validação pública</p>{!result ? <h1>Verificando documento…</h1> : result.authentic ? <><div className="validationIcon">✓</div><h1>Relatório autêntico</h1><p>O documento <strong>{result.documentCode}</strong> foi encontrado na base de validação da CARPIVARA.</p><div className="validationRows"><span>Status<strong>{result.status}</strong></span><span>Referência FIPE<strong>{result.fipeReferenceMonth ?? '—'}</strong></span><span>Hash<strong>{result.hash?.slice(0, 24)}…</strong></span></div><a className="primaryButton" href="/fipe">Consultar FIPE grátis <span>→</span></a></> : <><div className="validationIcon invalid">!</div><h1>Documento não encontrado</h1><p>O código informado não corresponde a um relatório público válido.</p><a className="secondaryButton" href="/fipe">Voltar à consulta FIPE</a></>}</section></div>; }

function AuthScreen({ onAuthenticated, onBack, externalError = '', initialMode = 'register' }: { onAuthenticated: (token: string) => void; onBack: () => void; externalError?: string; initialMode?: 'login' | 'register' }) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [providers, setProviders] = useState<OAuthProviderStatus[]>([]);

  useEffect(() => { setMode(initialMode); setError(''); }, [initialMode]);
  useEffect(() => { void fetch(`${API}/auth/providers`).then((response) => response.ok ? response.json() : { providers: [] }).then((body: { providers?: OAuthProviderStatus[] }) => setProviders(body.providers ?? [])).catch(() => setProviders([])); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(''); setPending(true);
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    if (mode === 'register' && String(form.get('name') ?? '').trim().length < 2) { setError('Informe seu nome completo para criar a conta.'); setPending(false); return; }
    if (mode === 'register' && password.length < 10) { setError('Crie uma senha com pelo menos 10 caracteres.'); setPending(false); return; }
    if (mode === 'register' && password !== String(form.get('passwordConfirmation') ?? '')) { setError('As senhas precisam ser iguais.'); setPending(false); return; }
    if (mode === 'register' && (form.get('acceptTerms') !== 'on' || form.get('acceptPrivacy') !== 'on')) { setError('Para criar sua conta, aceite os Termos de Uso e a Política de Privacidade.'); setPending(false); return; }
    const payload = mode === 'login'
      ? { email: String(form.get('email') ?? ''), password }
      : { name: String(form.get('name') ?? ''), email: String(form.get('email') ?? ''), password, acceptTerms: form.get('acceptTerms') === 'on', acceptPrivacy: form.get('acceptPrivacy') === 'on', marketingOptIn: form.get('marketingOptIn') === 'on' };
    try {
      const response = await fetch(`${API}/auth/${mode === 'login' ? 'login' : 'register'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await response.json() as ApiError & { token?: string };
      if (!response.ok || !body.token) throw new Error(body.message ?? 'Não foi possível acessar sua conta.');
      sessionStorage.setItem('carpivara_token', body.token);
      onAuthenticated(body.token);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível acessar sua conta.'); }
    finally { setPending(false); }
  }

  function selectMode(next: 'login' | 'register') { setMode(next); setError(''); }
  function startSocialLogin(provider: OAuthProviderStatus) { if (provider.enabled) window.location.assign(`${API}/auth/oauth/${provider.id}/start`); }
  const providerLabel: Record<OAuthProviderStatus['id'], string> = { google: 'Continuar com Google', microsoft: 'Continuar com Microsoft', apple: 'Continuar com Apple' };
  const providerIcon: Record<OAuthProviderStatus['id'], string> = { google: 'G', microsoft: '⊞', apple: '●' };
  const configuredProviders = (['google', 'microsoft', 'apple'] as OAuthProviderStatus['id'][]).map((id) => providers.find((provider) => provider.id === id) ?? { id, label: id, enabled: false });
  const enabledProviders = configuredProviders.filter((provider) => provider.enabled);

  return <div className="authShell"><div className="authVisual"><button className="backButton" onClick={onBack}>← Voltar ao início</button><Brand /><div className="authPitch"><p className="kicker">Acesso à plataforma</p><h1>Crie sua conta. Acesse seu dashboard.</h1><p>O cadastro é gratuito. Você só escolhe e paga por créditos no momento em que decidir realizar uma consulta.</p></div><div className="authDecor"><span>Dashboard pessoal</span><span>Carteira de créditos</span><span>Histórico protegido</span></div></div><div className="authPanel"><div className="authCard authCardPremium"><div className="authTabs"><button className={mode === 'login' ? 'active' : ''} onClick={() => selectMode('login')}>Já tenho conta</button><button className={mode === 'register' ? 'active' : ''} onClick={() => selectMode('register')}>Criar conta</button></div><h2>{mode === 'login' ? 'Entre no seu dashboard.' : 'Seu dashboard começa aqui.'}</h2><p className="muted">{mode === 'login' ? 'Acesse carteira, consultas e relatórios salvos com seu e-mail e senha.' : 'O cadastro não exige pagamento. Crie sua conta e entre na plataforma agora.'}</p>{enabledProviders.length > 0 && <><div className="socialAuth" aria-label="Acesso social">{enabledProviders.map((provider) => <button className="socialButton" type="button" key={provider.id} onClick={() => startSocialLogin(provider)}><span aria-hidden="true">{providerIcon[provider.id]}</span>{providerLabel[provider.id]}</button>)}</div><div className="authDivider"><span>ou continue com e-mail</span></div></>}<form onSubmit={submit}>{mode === 'register' && <label>Nome completo<input name="name" autoComplete="name" minLength={2} required placeholder="Como podemos chamar você?" /></label>}<label>E-mail<input name="email" type="email" autoComplete="email" required placeholder="voce@empresa.com" /></label><label>Senha<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 10 : 1} required placeholder={mode === 'register' ? 'Crie uma senha com pelo menos 10 caracteres' : 'Sua senha'} /></label>{mode === 'register' && <><label>Confirmar senha<input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={10} required placeholder="Repita sua senha" /></label><div className="consentFields"><label className="checkField"><input name="acceptTerms" type="checkbox" required /> <span><b>Obrigatório:</b> li e aceito os Termos de Uso.</span></label><label className="checkField"><input name="acceptPrivacy" type="checkbox" required /> <span><b>Obrigatório:</b> li e aceito a Política de Privacidade.</span></label><label className="checkField"><input name="marketingOptIn" type="checkbox" /> <span>Quero receber conteúdos e novidades por e-mail.</span></label></div></>}{(error || externalError) && <div className="notice noticeError" role="alert">{error || externalError}</div>}<button className="primaryButton full" disabled={pending}>{pending ? 'Criando acesso...' : mode === 'login' ? 'Entrar no dashboard' : 'Criar conta e acessar'} <span>→</span></button></form><p className="authFine">Dados de autenticação são processados de forma segura. Nenhum crédito é cobrado para criar ou acessar a sua conta.</p></div></div></div>;
}

function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('carpivara_token') ?? '');
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('carpivara_theme') as Theme) || 'system');
  const [publicPage, setPublicPage] = useState<'landing' | 'auth' | 'fipe' | 'validation'>(() => window.location.pathname === '/fipe' ? 'fipe' : window.location.pathname.startsWith('/validar-relatorio/') ? 'validation' : 'landing');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [view, setView] = useState<View>('consult');
  const [me, setMe] = useState<Me | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [creditPackages, setCreditPackages] = useState<CreditPackage[]>([]);
  const [history, setHistory] = useState<Query[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [admin, setAdmin] = useState<AdminSummary | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminPayments, setAdminPayments] = useState<AdminPayment[]>([]);
  const [adminQueries, setAdminQueries] = useState<AdminQuery[]>([]);
  const [report, setReport] = useState<Query | null>(null);
  const [plate, setPlate] = useState('');
  const [productId, setProductId] = useState('COMPLETE');
  const [historyFilter, setHistoryFilter] = useState('');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [queryStage, setQueryStage] = useState(0);

  useEffect(() => {
    const url = new URL(window.location.href);
    const ticket = url.searchParams.get('oauth_ticket');
    const oauthError = url.searchParams.get('oauth_error');
    if (!ticket && !oauthError) return;
    url.searchParams.delete('oauth_ticket');
    url.searchParams.delete('oauth_error');
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
    if (oauthError) { setError('Não foi possível concluir o acesso pelo provedor escolhido. Tente novamente ou use seu e-mail.'); setPublicPage('auth'); return; }
    void fetch(`${API}/auth/oauth/consume`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket }) })
      .then(async (response) => {
        const body = await response.json() as ApiError & { token?: string };
        if (!response.ok || !body.token) throw new Error(body.message ?? 'Não foi possível concluir o acesso social.');
        sessionStorage.setItem('carpivara_token', body.token);
        setToken(body.token);
      })
      .catch((reason) => { setError(reason instanceof Error ? reason.message : 'Não foi possível concluir o acesso social.'); setPublicPage('auth'); });
  }, []);

  const appliedTheme = theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
  useEffect(() => { document.documentElement.dataset.theme = appliedTheme; localStorage.setItem('carpivara_theme', theme); }, [appliedTheme, theme]);
  useEffect(() => { if (toast) { const timer = window.setTimeout(() => setToast(''), 4000); return () => window.clearTimeout(timer); } }, [toast]);

  async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers ?? {}) } });
    if (response.status === 204) return undefined as T;
    const body = await response.json() as T & ApiError;
    if (!response.ok) throw new Error(body.message ?? body.error ?? 'Não foi possível concluir a operação.');
    return body;
  }

  async function refresh(loadAdmin = false) {
    if (!token) return;
    try {
      const [profile, productList, queries, wallet, packages] = await Promise.all([api<Me>('/me'), api<Product[]>('/query-products'), api<Query[]>('/queries'), api<Transaction[]>('/wallet/transactions'), api<CreditPackage[]>('/credit-packages')]);
      setMe(profile); setProducts(productList); setHistory(queries); setTransactions(wallet); setCreditPackages(packages);
      if (!productList.some((item) => item.id === productId) && productList[0]) setProductId(productList[0].id);
      if (loadAdmin && profile.permissions.includes('VIEW_AUDIT')) {
        const [summary, users, payments, queries] = await Promise.all([api<AdminSummary>('/admin/overview'), api<AdminUser[]>('/admin/users'), api<AdminPayment[]>('/admin/payments'), api<AdminQuery[]>('/admin/queries')]);
        setAdmin(summary); setAdminUsers(users); setAdminPayments(payments); setAdminQueries(queries);
      }
    } catch (reason) {
      sessionStorage.removeItem('carpivara_token'); setToken(''); setMe(null); setError(reason instanceof Error ? reason.message : 'Sua sessão não pôde ser restaurada.'); setPublicPage('auth');
    }
  }
  useEffect(() => { void refresh(); }, [token]);

  const selectedProduct = useMemo(() => products.find((product) => product.id === productId), [products, productId]);
  const filteredHistory = useMemo(() => history.filter((item) => item.plate.includes(historyFilter.toUpperCase().replace(/[^A-Z0-9]/g, ''))), [history, historyFilter]);
  const canAdmin = Boolean(me?.permissions.includes('VIEW_AUDIT'));

  async function runQuery() {
    if (!plate.trim()) { setError('Informe uma placa para iniciar a consulta.'); return; }
    setLoading(true); setError(''); setReport(null); setQueryStage(1);
    const stages = window.setInterval(() => setQueryStage((current) => Math.min(current + 1, 3)), 620);
    try {
      const result = await api<Query>('/queries', { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ plate, productId }) });
      setQueryStage(4); setReport(result); setPlate(result.plate); await refresh(); setToast('Consulta concluída e salva no seu histórico.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível concluir a consulta.'); await refresh(); }
    finally { window.clearInterval(stages); setLoading(false); }
  }

  async function openSavedQuery(id: string) {
    setLoading(true); setError('');
    try { const saved = await api<Query>(`/queries/${id}`); setReport(saved); setView('consult'); setToast('Relatório salvo aberto sem consumir créditos.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível abrir esta consulta.'); }
    finally { setLoading(false); }
  }

  async function startCheckout(packageSlug: string) {
    setLoading(true); setError('');
    try {
      const order = await api<{ checkoutUrl: string }>('/payments/checkout', { method: 'POST', body: JSON.stringify({ packageSlug }) });
      window.location.assign(order.checkoutUrl);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível abrir o checkout agora.'); setLoading(false); }
  }

  async function exportReport() {
    if (!report) return;
    try {
      const response = await fetch(`${API}/queries/${report.id}/export`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('Não foi possível exportar este relatório.');
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `carpivara-${report.plate}.json`; anchor.click(); URL.revokeObjectURL(url); setToast('Exportação preparada com sucesso.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível exportar este relatório.'); }
  }

  function logout() { void api('/auth/logout', { method: 'POST' }).catch(() => undefined); sessionStorage.removeItem('carpivara_token'); setToken(''); setMe(null); setReport(null); setPublicPage('landing'); }
  function navigate(next: View) { setView(next); setError(''); if (next === 'admin') void refresh(true); }

  if (publicPage === 'validation') return <ValidationPage code={window.location.pathname.split('/').filter(Boolean).pop() ?? ''} />;
  if (!token) {
    if (publicPage === 'fipe') return <FipeView onAccess={() => { setAuthMode('register'); setPublicPage('auth'); }} onBack={() => setPublicPage('landing')} />;
    return publicPage === 'landing' ? <Landing theme={theme} setTheme={setTheme} onAccess={(mode) => { setAuthMode(mode); setError(''); setPublicPage('auth'); }} /> : <AuthScreen onAuthenticated={(nextToken) => { setToken(nextToken); if (sessionStorage.getItem('carpivara_fipe_return') === '1') { sessionStorage.removeItem('carpivara_fipe_return'); setPublicPage('fipe'); } }} onBack={() => setPublicPage('landing')} externalError={error} initialMode={authMode} />;
  }
  if (publicPage === 'fipe') return <FipeView token={token} onAccess={() => { setAuthMode('register'); setPublicPage('auth'); }} onBack={() => setPublicPage('landing')} />;

  return <div className="appShell"><aside className="sidebar"><Brand /><div className="workspaceLabel"><span>Área do cliente</span><b>Conta protegida</b></div><nav className="sideNav" aria-label="Navegação da plataforma"><button className={view === 'consult' ? 'active' : ''} onClick={() => navigate('consult')}><i>⌁</i> Nova consulta</button><button className={view === 'history' ? 'active' : ''} onClick={() => navigate('history')}><i>◫</i> Histórico</button><button className={view === 'wallet' ? 'active' : ''} onClick={() => navigate('wallet')}><i>◇</i> Carteira</button><button className={view === 'settings' ? 'active' : ''} onClick={() => navigate('settings')}><i>◌</i> Preferências</button>{canAdmin && <button className={view === 'admin' ? 'active' : ''} onClick={() => navigate('admin')}><i>◈</i> Administração</button>}</nav><div className="sideBottom"><div className="sideCredit"><span>Saldo disponível</span><strong>{formatCredits(me?.balance ?? 0)} <small>créditos</small></strong></div><button className="logoutButton" onClick={logout}>Sair da conta</button></div></aside><main className="workspace"><header className="appHeader"><div><p className="kicker">{view === 'consult' ? 'Consulta veicular' : view === 'history' ? 'Histórico de consultas' : view === 'wallet' ? 'Carteira de créditos' : view === 'admin' ? 'Controle operacional' : 'Preferências'}</p><h1>{view === 'consult' ? 'Bom ter você por aqui, ' : ''}{view === 'consult' ? (me?.user.name?.split(' ')[0] ?? 'cliente') : view === 'history' ? 'Suas consultas, organizadas.' : view === 'wallet' ? 'Clareza em cada crédito.' : view === 'admin' ? 'Visão administrativa.' : 'Do seu jeito.'}</h1></div><div className="headerActions"><ThemeControl theme={theme} setTheme={setTheme} /><div className="profileBadge"><span>{me?.user.name?.slice(0, 1).toUpperCase()}</span><div><strong>{me?.user.name}</strong><small>{me?.user.role.replace('_', ' ')}</small></div></div></div></header>{toast && <div className="toast" role="status">{toast}<button onClick={() => setToast('')} aria-label="Fechar aviso">×</button></div>}{error && <div className="notice noticeError" role="alert">{error}<button onClick={() => setError('')} aria-label="Fechar erro">×</button></div>}{view === 'consult' && <ConsultView plate={plate} setPlate={setPlate} products={products} productId={productId} setProductId={setProductId} selectedProduct={selectedProduct} balance={me?.balance ?? 0} loading={loading} queryStage={queryStage} runQuery={runQuery} report={report} exportReport={exportReport} />}{view === 'history' && <HistoryView history={filteredHistory} filter={historyFilter} setFilter={setHistoryFilter} loading={loading} openSavedQuery={openSavedQuery} onRepeat={(item) => { setPlate(item.plate); setProductId(item.productId); setReport(null); navigate('consult'); setToast('Placa e produto preenchidos. Uma nova consulta consumirá créditos.'); }} />}{view === 'wallet' && <WalletView balance={me?.balance ?? 0} transactions={transactions} packages={creditPackages} loading={loading} startCheckout={startCheckout} />}{view === 'settings' && <SettingsView theme={theme} setTheme={setTheme} user={me?.user} />}{view === 'admin' && canAdmin && <AdminView summary={admin} products={products} users={adminUsers} payments={adminPayments} queries={adminQueries} />}</main><nav className="mobileNav" aria-label="Navegação móvel"><button className={view === 'consult' ? 'active' : ''} onClick={() => navigate('consult')}>Consultar</button><button className={view === 'history' ? 'active' : ''} onClick={() => navigate('history')}>Histórico</button><button className={view === 'wallet' ? 'active' : ''} onClick={() => navigate('wallet')}>Carteira</button><button onClick={logout}>Sair</button></nav></div>;
}

function ConsultView({ plate, setPlate, products, productId, setProductId, selectedProduct, balance, loading, queryStage, runQuery, report, exportReport }: { plate: string; setPlate: (value: string) => void; products: Product[]; productId: string; setProductId: (value: string) => void; selectedProduct?: Product; balance: number; loading: boolean; queryStage: number; runQuery: () => void; report: Query | null; exportReport: () => void }) {
  return <><section className="consultCard"><div className="consultIntro"><p className="kicker">Nova consulta</p><h2>O que você quer descobrir?</h2><p>Digite a placa, escolha o tipo de consulta e veja o custo antes de confirmar.</p></div><div className="consultForm"><label>Placa do veículo<input value={plate} onChange={(event) => setPlate(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7))} placeholder="ABC1D23" maxLength={7} aria-describedby="plate-help" /></label><label>Produto<select value={productId} onChange={(event) => setProductId(event.target.value)}>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><div className="costBox"><span>Custo da consulta</span><strong>{selectedProduct ? `${formatCredits(selectedProduct.creditCost)} créditos` : '—'}</strong><small>Saldo: {formatCredits(balance)} créditos</small></div><button className="primaryButton consultButton" onClick={runQuery} disabled={loading || !selectedProduct || balance < (selectedProduct?.creditCost ?? 0)}>{loading ? 'Consultando...' : 'Consultar agora'} <span>→</span></button></div>{selectedProduct && <div className="productDetail"><span>{selectedProduct.description}</span>{selectedProduct.features?.map((feature) => <small key={feature}>{feature}</small>)}</div>}</section>{loading && <section className="progressCard" aria-live="polite"><div className="progressHeader"><div className="spinner"></div><div><strong>{['Preparando sua consulta', 'Validando placa', 'Consultando informações', 'Organizando dados', 'Relatório pronto'][queryStage] ?? 'Consultando'}</strong><p>Você será informado se houver qualquer problema. Nenhum crédito é perdido em falha técnica.</p></div></div><div className="steps">{['Validar', 'Consultar', 'Organizar', 'Concluir'].map((step, index) => <span className={index < queryStage ? 'done' : index === queryStage ? 'current' : ''} key={step}>{step}</span>)}</div></section>}{report ? <ReportView query={report} exportReport={exportReport} /> : !loading && <section className="reportEmpty"><span className="emptyMark">C</span><div><p className="kicker">Relatório inteligente</p><h2>Seu próximo relatório aparece aqui.</h2><p>Identificação, características, débitos e ocorrências serão organizados em uma leitura objetiva, sem despejar dados técnicos.</p></div></section>}</>;
}

function ReportView({ query, exportReport }: { query: Query; exportReport: () => void }) {
  const result = query.result; if (!result) return null;
  const total = result.debts.reduce((sum, item) => sum + item.amountCents, 0);
  const alertCount = result.restrictions.filter((item) => item.alert).length;
  const diagnosisClass = result.diagnostic.level.toLowerCase().replace('_', '-');
  return <section className="reportShell"><div className="reportHeader"><div><div className="reportMeta"><span>Relatório #{query.id.slice(0, 8).toUpperCase()}</span><StatusBadge status={query.status} /><span>{formatDate(query.completedAt ?? query.createdAt)}</span></div><h2>{result.identification.fullModel ?? result.identification.model ?? 'Veículo consultado'}</h2><p>{result.characteristics.manufactureYear ?? '—'}/{result.characteristics.modelYear ?? '—'} · {result.characteristics.color ?? 'Cor não informada'} · {result.characteristics.fuel ?? 'Combustível não informado'}</p></div><div className="reportActions"><span className="plateBadge">{result.identification.plate}</span><button className="secondaryButton compact" onClick={exportReport}>Exportar dados</button></div></div><div className={`diagnostic ${diagnosisClass}`}><span className="diagnosticIcon">{result.diagnostic.level === 'CLEAR' ? '✓' : '!'}</span><div><small>Diagnóstico geral</small><strong>{result.diagnostic.title}</strong><p>{result.diagnostic.reason}</p></div></div><div className="reportMetrics"><Metric label="Situação" value={result.registration.status ?? 'Não informado'} /><Metric label="Débitos mapeados" value={formatMoney(total)} attention={total > 0} /><Metric label="Ocorrências" value={alertCount ? `${alertCount} atenção` : 'Nada consta'} attention={alertCount > 0} /><Metric label="Localidade" value={`${result.registration.city ?? '—'}/${result.registration.state ?? '—'}`} /></div><div className="reportGrid"><DataBlock title="Identificação" rows={[["Placa", result.identification.plate], ["Marca", result.identification.brand], ["Modelo", result.identification.model], ["Renavam", mask(result.identification.renavam)], ["Chassi", mask(result.identification.chassis)], ["Motor", mask(result.identification.engine)], ["Câmbio", result.identification.gearbox]]} /><DataBlock title="Características" rows={[["Cor", result.characteristics.color], ["Combustível", result.characteristics.fuel], ["Categoria", result.characteristics.category], ["Tipo", result.characteristics.type], ["Espécie", result.characteristics.species], ["Potência", result.characteristics.power ? `${result.characteristics.power} cv` : undefined], ["Cilindrada", result.characteristics.displacement ? `${result.characteristics.displacement} cc` : undefined]]} /><DataBlock title="Registro" rows={[["Município", result.registration.city], ["UF", result.registration.state], ["Licenciamento", result.registration.licensingDate], ["Exercício", result.registration.licensingYear], ["Situação", result.registration.status], ["Recall", result.recall]]} /><div className="dataBlock"><h3>Débitos <span>{total > 0 ? 'Atenção' : 'Em dia'}</span></h3><div className="dataRows">{result.debts.map((item) => <div className="dataRow" key={item.key}><span>{item.label}</span><strong className={item.hasDebt ? 'attentionText' : ''}>{formatMoney(item.amountCents)}</strong></div>)}</div></div><div className="dataBlock dataBlockWide"><h3>Restrições <span>{alertCount ? `${alertCount} ocorrência(s)` : 'Nada consta'}</span></h3><div className="restrictionGrid">{result.restrictions.map((item) => <div className={`restriction ${item.alert ? 'alert' : 'clear'}`} key={item.key}><span className="restrictionSymbol">{item.alert ? '!' : '✓'}</span><div><strong>{item.label}</strong><p>{item.status}</p></div></div>)}</div></div></div><p className="reportDisclaimer">As informações refletem os dados disponíveis no momento da consulta. Este relatório não substitui verificações oficiais quando necessárias.</p></section>;
}
function Metric({ label, value, attention = false }: { label: string; value: string; attention?: boolean }) { return <div className={attention ? 'metric attentionMetric' : 'metric'}><span>{label}</span><strong>{value}</strong></div>; }
function DataBlock({ title, rows }: { title: string; rows: [string, string | undefined][] }) { return <div className="dataBlock"><h3>{title}</h3><div className="dataRows">{rows.map(([label, value]) => <div className="dataRow" key={label}><span>{label}</span><strong>{value || '—'}</strong></div>)}</div></div>; }

function HistoryView({ history, filter, setFilter, loading, openSavedQuery, onRepeat }: { history: Query[]; filter: string; setFilter: (value: string) => void; loading: boolean; openSavedQuery: (id: string) => void; onRepeat: (query: Query) => void }) {
  return <section className="contentCard"><div className="listHeader"><div><h2>Consultas salvas</h2><p>Abra um relatório anterior sem novo consumo de créditos.</p></div><label className="searchField"><span>Buscar placa</span><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="ABC1D23" /></label></div><div className="historyTable"><div className="tableHead"><span>Placa</span><span>Produto</span><span>Data</span><span>Status</span><span>Ações</span></div>{history.length === 0 ? <div className="emptyList"><strong>Nenhuma consulta encontrada.</strong><p>Quando você consultar um veículo, o relatório ficará disponível aqui.</p></div> : history.map((item) => <div className="tableRow" key={item.id}><strong>{item.plate}</strong><span>{item.productName}</span><span>{formatDate(item.createdAt)}</span><StatusBadge status={item.status} /><div className="rowActions"><button className="tableButton" onClick={() => openSavedQuery(item.id)} disabled={loading || item.status !== 'SUCCESS'}>Abrir</button><button className="tableButton ghost" onClick={() => onRepeat(item)}>Consultar de novo</button></div></div>)}</div></section>;
}

function WalletView({ balance, transactions, packages, loading, startCheckout }: { balance: number; transactions: Transaction[]; packages: CreditPackage[]; loading: boolean; startCheckout: (slug: string) => void }) { return <><section className="walletHero"><div><p className="kicker">Carteira CARPIVARA</p><h2>{formatCredits(balance)} <small>créditos disponíveis</small></h2><p>Todo movimento fica registrado. Você escolhe um pacote, conclui o pagamento em checkout seguro e os créditos são liberados somente após a confirmação financeira.</p></div></section><section className="contentCard creditStore"><div className="listHeader"><div><p className="kicker">Comprar créditos</p><h2>Escolha o pacote ideal</h2><p>Pix e cartão são processados no checkout seguro do parceiro de pagamentos.</p></div></div><div className="creditPackageGrid">{packages.map((pack) => <article key={pack.slug}><span>{formatCredits(pack.credits)} créditos</span><h3>{pack.name}</h3><p>{pack.description}</p><strong>{formatMoney(pack.priceCents)}</strong><button className="primaryButton" disabled={loading} onClick={() => startCheckout(pack.slug)}>Escolher pacote <span>→</span></button></article>)}</div></section><section className="contentCard"><div className="listHeader"><div><h2>Movimentações</h2><p>Compras, consultas e estornos registrados em ordem cronológica.</p></div></div><div className="historyTable transactions"><div className="tableHead"><span>Movimento</span><span>Descrição</span><span>Data</span><span>Saldo após</span></div>{transactions.length === 0 ? <div className="emptyList"><strong>Sua carteira ainda não teve movimentações.</strong><p>Quando um pagamento for confirmado ou uma consulta for realizada, o histórico aparecerá aqui.</p></div> : transactions.map((item) => <div className="tableRow" key={item.id}><strong className={item.amount > 0 ? 'creditAmount' : 'debitAmount'}>{item.amount > 0 ? '+' : ''}{formatCredits(item.amount)} cr.</strong><span>{item.description}</span><span>{formatDate(item.createdAt)}</span><span>{formatCredits(item.balanceAfter)} cr.</span></div>)}</div></section></>; }

function SettingsView({ theme, setTheme, user }: { theme: Theme; setTheme: (value: Theme) => void; user?: User }) { return <section className="settingsGrid"><article className="contentCard"><p className="kicker">Aparência</p><h2>Escolha sua experiência</h2><p className="muted">A preferência é salva neste dispositivo.</p><ThemeControl theme={theme} setTheme={setTheme} /></article><article className="contentCard"><p className="kicker">Conta</p><h2>Dados de acesso</h2><dl className="accountData"><div><dt>Nome</dt><dd>{user?.name}</dd></div><div><dt>E-mail</dt><dd>{user?.email}</dd></div><div><dt>Perfil</dt><dd>{user?.role.replace('_', ' ')}</dd></div></dl><p className="muted">A alteração de senha está protegida pela sua senha atual e pode ser realizada pela API segura da plataforma.</p></article></section>; }
function AdminView({ summary, products, users, payments, queries }: { summary: AdminSummary | null; products: Product[]; users: AdminUser[]; payments: AdminPayment[]; queries: AdminQuery[] }) {
  const amount = (value?: string) => Number(value ?? 0);
  const cards = [
    { label: 'Usuários ativos', value: summary?.active_users ?? '—', note: `${summary?.new_users_30d ?? '—'} novos em 30 dias` },
    { label: 'Consultas hoje', value: summary?.queries_today ?? '—', note: `${summary?.successful_queries ?? '—'} concluídas no histórico` },
    { label: 'Falhas técnicas', value: summary?.failed_queries ?? '—', note: `${summary?.refunds ?? '—'} estornos registrados` },
    { label: 'Créditos em carteiras', value: `${formatCredits(amount(summary?.credits_in_wallets))} cr.`, note: `${formatCredits(amount(summary?.credits_consumed))} cr. consumidos` },
    { label: 'Créditos vendidos', value: `${formatCredits(amount(summary?.credits_sold))} cr.`, note: 'Somente pagamentos confirmados' },
    { label: 'Checkouts em aberto', value: formatMoney(amount(summary?.open_checkout_cents)), note: 'Ainda não reconhecidos como receita' }
  ];
  return <>
    <section className="adminExecutive contentCard"><div><p className="kicker">Retaguarda CARPIVARA</p><h2>Visão de operação, caixa e receita.</h2><p>Todos os indicadores são calculados a partir de eventos persistidos no banco. Nenhum valor é estimado ou preenchido como demonstração.</p></div><div className="adminRevenue"><span>Receita confirmada</span><strong>{formatMoney(amount(summary?.confirmed_revenue_cents))}</strong><small>{summary?.confirmed_sales ?? '—'} venda(s) conciliada(s) · ticket médio {formatMoney(amount(summary?.average_ticket_cents))}</small></div></section>
    <section className="adminMetrics">{cards.map((card) => <div className="metric" key={card.label}><span>{card.label}</span><strong>{card.value}</strong><small>{card.note}</small></div>)}</section>
    <section className="adminInsightGrid"><article><span>Consultas FIPE iniciadas</span><strong>{summary?.fipe_started ?? '—'}</strong><p>Eventos de entrada no funil gratuito, sem consumir créditos.</p></article><article><span>Conversão para histórico</span><strong>{summary?.fipe_save_rate_pct ?? '0'}%</strong><p>{summary?.fipe_saved ?? '—'} relatório(s) salvo(s) por usuários autenticados.</p></article><article><span>PDFs gerados</span><strong>{summary?.fipe_pdf_downloads ?? '—'}</strong><p>Downloads registrados para medir intenção de continuidade.</p></article></section>
    <section className="adminInsightGrid"><article><span>Lucro operacional</span><strong>Em configuração</strong><p>Será calculado quando o custo contratado do provedor veicular e os custos operacionais forem cadastrados. A plataforma não exibe uma margem fictícia.</p></article><article><span>Receita estornada</span><strong>{formatMoney(amount(summary?.refunded_revenue_cents))}</strong><p>Valor devolvido ou estornado segundo os eventos financeiros persistidos.</p></article><article><span>Fonte operacional</span><strong>Dados reais</strong><p>Consultas e pagamentos abaixo refletem somente registros produzidos pela operação.</p></article><article><span>Saúde FIPE</span><strong>{summary?.fipe_provider_failures_24h ?? '0'} falhas</strong><p>Última resposta válida: {summary?.fipe_provider_last_success ? formatDate(summary.fipe_provider_last_success) : 'ainda sem eventos'}.</p></article></section>
    <section className="adminSection contentCard"><div className="listHeader"><div><p className="kicker">Monitoramento de consultas</p><h2>Fila e histórico operacional</h2><p>Acompanhe produto, cliente, provedor, consumo de créditos e retorno técnico de cada consulta persistida.</p></div></div><div className="adminDataTable"><div className="adminDataHead adminQueries"><span>Consulta</span><span>Cliente</span><span>Produto</span><span>Créditos</span><span>Provedor</span><span>Status</span></div>{queries.length ? queries.map((query) => <div className="adminDataRow adminQueries" key={query.id}><div><strong>{query.plate}</strong><small>{formatDate(query.createdAt)}</small></div><div><strong>{query.customer.name}</strong><small>{query.customer.email}</small></div><span>{query.productName}</span><strong>{formatCredits(query.creditsCost)} cr.</strong><span>{query.provider}</span><div><StatusBadge status={query.status} />{query.errorCode && <small className="tableAlert">{query.errorCode}</small>}</div></div>) : <div className="emptyList"><strong>Ainda não existem consultas reais registradas.</strong><p>Quando a fonte veicular contratada estiver configurada e uma consulta for concluída, ela aparecerá aqui.</p></div>}</div></section>
    <section className="adminSection contentCard"><div className="listHeader"><div><p className="kicker">Gestão de clientes</p><h2>Usuários e carteiras</h2><p>Visão operacional protegida por permissões de servidor.</p></div></div><div className="adminDataTable"><div className="adminDataHead"><span>Cliente</span><span>Perfil</span><span>Carteira</span><span>Consultas</span><span>Status</span></div>{users.length ? users.map((user) => <div className="adminDataRow" key={user.id}><div><strong>{user.name}</strong><small>{user.email}</small></div><span>{user.role.replace('_', ' ')}</span><strong>{formatCredits(user.balance)} cr.</strong><span>{formatCredits(user.queriesCount)}</span><span className={user.active ? 'status status-success' : 'status status-failed'}>{user.active ? 'Ativo' : 'Inativo'}</span></div>) : <div className="emptyList"><strong>Nenhum usuário para exibir.</strong></div>}</div></section>
    <section className="adminSection contentCard"><div className="listHeader"><div><p className="kicker">Conciliação financeira</p><h2>Pagamentos recentes</h2><p>Créditos só são liberados após a confirmação do provedor de pagamento.</p></div></div><div className="adminDataTable"><div className="adminDataHead payments"><span>Cliente</span><span>Valor</span><span>Créditos</span><span>Provedor</span><span>Status</span></div>{payments.length ? payments.map((payment) => <div className="adminDataRow payments" key={payment.id}><div><strong>{payment.customer.name}</strong><small>{payment.customer.email}</small></div><strong>{formatMoney(payment.amountCents)}</strong><span>{formatCredits(payment.credits)} cr.</span><span>{payment.provider}</span><StatusBadge status={payment.status === 'PAID' ? 'SUCCESS' : payment.status === 'FAILED' ? 'FAILED' : 'PROCESSING'} /></div>) : <div className="emptyList"><strong>Nenhum pagamento conciliado ainda.</strong><p>Quando o Asaas estiver configurado e confirmar uma cobrança, ela aparecerá nesta conciliação.</p></div>}</div></section>
    <section className="contentCard"><div className="listHeader"><div><p className="kicker">Catálogo operacional</p><h2>Produtos configurados</h2><p>Os custos de créditos vêm do banco e são protegidos por permissões administrativas.</p></div></div><div className="productGrid">{products.map((product) => <article key={product.id}><span>{product.id}</span><h3>{product.name}</h3><p>{product.description}</p><strong>{formatCredits(product.creditCost)} créditos</strong></article>)}</div></section>
  </>;
}

createRoot(document.getElementById('root')!).render(<App />);
