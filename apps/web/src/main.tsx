import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API = '/api';
type Theme = 'light' | 'dark' | 'system';
type View = 'consult' | 'history' | 'wallet' | 'settings' | 'admin';
type Product = { id: string; name: string; description: string; creditCost: number; slug?: string; features?: string[] };
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
type Me = { user: User; balance: number; permissions: string[]; sandbox: boolean; identities?: string[] };
type OAuthProviderStatus = { id: 'google' | 'microsoft' | 'apple'; label: string; enabled: boolean };
type AdminSummary = { active_users: string; queries_today: string; successful_queries: string; refunds: string; credits_sold: string; credits_consumed: string };
type AdminUser = { id: string; name: string; email: string; role: string; active: boolean; createdAt: string; lastLoginAt?: string; balance: number; queriesCount: number };
type AdminPayment = { id: string; status: string; amountCents: number; credits: number; provider: string; externalId?: string; createdAt: string; paidAt?: string; customer: { name: string; email: string } };
type CreditPackage = { slug: string; name: string; description: string; credits: number; priceCents: number };
type ApiError = { error?: string; message?: string };

const formatCredits = (value: number) => new Intl.NumberFormat('pt-BR').format(value);
const formatMoney = (value: number) => (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
const mask = (value?: string) => !value ? '—' : value.length <= 5 ? value : `${value.slice(0, 3)}••••${value.slice(-3)}`;

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? 'brandCompact' : ''}`} aria-label="CARPIVARA, consulta veicular inteligente">
    <span className="brandMark brandMarkOfficial" aria-hidden="true"><img src="/brand/carpivara-official.png" alt="" /></span>
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

function Landing({ theme, setTheme, onAccess }: { theme: Theme; setTheme: (value: Theme) => void; onAccess: () => void }) {
  return <div className="landing">
    <header className="publicHeader"><Brand compact /><nav aria-label="Navegação principal"><a href="#como-funciona">Como funciona</a><a href="#planos">Planos</a><a href="#conteudos">Conteúdos</a><a href="#faq">Dúvidas</a><button className="textButton" onClick={onAccess}>Entrar</button></nav><ThemeControl theme={theme} setTheme={setTheme} /></header>
    <main>
      <section className="hero">
        <div className="heroContent">
          <p className="kicker">Consulta veicular inteligente</p>
          <h1>Puxe os fatos.<br /><em>Descubra a verdade.</em></h1>
          <p className="heroLead">A CARPIVARA transforma informações veiculares em uma leitura clara para você comprar, vender e negociar com mais segurança.</p>
          <div className="heroActions"><button className="primaryButton" onClick={onAccess}>Consultar um veículo <span>→</span></button><a className="secondaryButton" href="#planos">Ver planos e créditos</a></div>
          <div className="heroTrust"><span><b>Relatórios organizados</b> para decisões objetivas</span><span><b>Histórico protegido</b> na sua conta</span><span><b>Pagamento seguro</b> por checkout parceiro</span></div>
        </div>
        <div className="vehicleCard" aria-label="Prévia de relatório da CARPIVARA">
          <div className="vehicleTop"><span className="miniBrand">CARPIVARA · RELATÓRIO</span><span className="secureTag">Proteção e transparência</span></div>
          <div className="vehicleVisual"><div className="roadLine"></div><div className="carShape"><i></i><b></b><em></em></div><span className="plateVisual">ABC1D23</span></div>
          <div className="reportPreview"><div><small>Identificação</small><strong>Dados por categoria</strong></div><div><small>Ocorrências</small><strong>Leitura de atenção</strong></div><div><small>Histórico</small><strong>Disponível na conta</strong></div></div>
        </div>
      </section>
      <section className="featureStrip" id="beneficios"><div><span>01</span><strong>Informação para decidir</strong><p>Entenda os dados retornados sem navegar por telas confusas.</p></div><div><span>02</span><strong>Créditos sob controle</strong><p>Veja o custo antes de cada consulta e acompanhe a carteira.</p></div><div><span>03</span><strong>Conta e histórico</strong><p>Retome relatórios salvos sempre que precisar.</p></div></section>
      <section className="howItWorks" id="como-funciona"><div><p className="kicker">Como funciona</p><h2>Três etapas, uma decisão mais segura.</h2><p className="sectionLead">Crie sua conta, escolha o pacote adequado e receba o relatório da fonte configurada para a sua operação.</p></div><ol><li><b>01</b><div><strong>Crie a sua conta</strong><p>Cadastre-se com e-mail ou, quando ativado, use Google, Microsoft ou Apple.</p></div></li><li><b>02</b><div><strong>Escolha seus créditos</strong><p>Compre créditos pelo checkout seguro e acompanhe cada movimento da carteira.</p></div></li><li><b>03</b><div><strong>Consulte e compare</strong><p>Informe a placa e veja o relatório organizado em blocos de informação.</p></div></li></ol></section>
      <section className="plansSection" id="planos"><div className="sectionHeading"><p className="kicker">Planos de consulta</p><h2>Créditos para o seu ritmo de decisão.</h2><p>Escolha o pacote que combina com a sua necessidade. Os valores e conteúdos finais são confirmados na sua área de cliente antes do pagamento.</p></div><div className="publicPlans"><article><span>Essencial</span><h3>Para começar</h3><p>Identificação e leitura inicial do veículo.</p><strong>Uso pontual</strong><button className="secondaryButton" onClick={onAccess}>Criar conta</button></article><article className="featuredPlan"><span>Mais escolhido</span><h3>Completo</h3><p>Uma visão ampla, organizada para apoiar sua decisão.</p><strong>Compra de veículo</strong><button className="primaryButton" onClick={onAccess}>Consultar agora <span>→</span></button></article><article><span>Profissional</span><h3>Para operações</h3><p>Créditos e controles pensados para uso recorrente.</p><strong>Volume e equipe</strong><button className="secondaryButton" onClick={onAccess}>Falar com a plataforma</button></article></div></section>
      <section className="contentSection" id="conteudos"><div className="sectionHeading"><p className="kicker">Conteúdo para decidir melhor</p><h2>O que observar antes de fechar negócio.</h2></div><div className="articleGrid"><article><span>GUIA</span><h3>Como consultar a placa de um veículo antes de comprar</h3><p>Entenda quais dados ajudam a reduzir incertezas em uma negociação.</p><a href="#faq">Ler orientação →</a></article><article><span>SEGURANÇA</span><h3>Por que histórico e documentação merecem atenção</h3><p>Uma decisão responsável considera dados técnicos, contexto e fontes oficiais.</p><a href="#faq">Ler orientação →</a></article><article><span>CARTEIRA</span><h3>Como funcionam os créditos de consulta</h3><p>Veja como a carteira registra compras, consultas e eventuais estornos.</p><a href="#faq">Ler orientação →</a></article></div></section>
      <section className="faqSection" id="faq"><div className="sectionHeading"><p className="kicker">Dúvidas frequentes</p><h2>Transparência antes de cada consulta.</h2></div><div className="faqGrid"><article><h3>O que eu recebo ao consultar?</h3><p>Você recebe um relatório com os dados disponibilizados pela fonte de dados contratada e pelo produto escolhido.</p></article><article><h3>Quando meus créditos são consumidos?</h3><p>O consumo ocorre ao iniciar a consulta. Se houver falha técnica na integração, a carteira registra o estorno de acordo com a regra operacional.</p></article><article><h3>Meus relatórios ficam salvos?</h3><p>Sim. Os relatórios concluídos ficam vinculados à sua conta para consulta posterior, respeitando as regras de acesso e privacidade.</p></article></div></section>
      <section className="publicCta"><Brand /><div><p className="kicker">A sua próxima decisão começa aqui</p><h2>Consulte com clareza. Negocie com mais segurança.</h2></div><button className="primaryButton" onClick={onAccess}>Entrar na plataforma <span>→</span></button></section>
    </main>
    <footer><Brand compact /><span>CARPIVARA · Consulta veicular inteligente, com transparência desde o primeiro passo.</span><a href="mailto:contato@carpivara.casadf.com.br">contato@carpivara.casadf.com.br</a></footer>
  </div>;
}

function AuthScreen({ onAuthenticated, onBack, externalError = '' }: { onAuthenticated: (token: string) => void; onBack: () => void; externalError?: string }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [providers, setProviders] = useState<OAuthProviderStatus[]>([]);

  useEffect(() => { void fetch(`${API}/auth/providers`).then((response) => response.ok ? response.json() : { providers: [] }).then((body: { providers?: OAuthProviderStatus[] }) => setProviders(body.providers ?? [])).catch(() => setProviders([])); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(''); setPending(true);
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    if (mode === 'register' && password !== String(form.get('passwordConfirmation') ?? '')) { setError('As senhas precisam ser iguais.'); setPending(false); return; }
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

  return <div className="authShell"><div className="authVisual"><button className="backButton" onClick={onBack}>← Voltar ao início</button><Brand /><div className="authPitch"><p className="kicker">Sua decisão começa aqui</p><h1>Informação clara para cada próxima escolha.</h1><p>Entre para consultar veículos, acompanhar o uso de créditos e manter seus relatórios organizados.</p></div><div className="authDecor"><span>Dados organizados</span><span>Proteção de acesso</span><span>Histórico disponível</span></div></div><div className="authPanel"><div className="authCard authCardPremium"><div className="authTabs"><button className={mode === 'login' ? 'active' : ''} onClick={() => selectMode('login')}>Entrar</button><button className={mode === 'register' ? 'active' : ''} onClick={() => selectMode('register')}>Criar conta</button></div><h2>{mode === 'login' ? 'Que bom ter você de volta.' : 'Crie sua central de decisões.'}</h2><p className="muted">{mode === 'login' ? 'Acesse sua carteira, consultas e relatórios salvos.' : 'Comece com uma conta protegida e tenha tudo organizado em um único lugar.'}</p><div className="socialAuth" aria-label="Acesso sem senha">{configuredProviders.map((provider) => <button className="socialButton" type="button" key={provider.id} onClick={() => startSocialLogin(provider)} disabled={!provider.enabled} title={provider.enabled ? providerLabel[provider.id] : 'A ativação deste provedor depende da configuração segura no ambiente de produção.'}><span aria-hidden="true">{providerIcon[provider.id]}</span>{providerLabel[provider.id]}</button>)}</div><div className="authDivider"><span>ou use seu e-mail</span></div><form onSubmit={submit}>{mode === 'register' && <label>Nome completo<input name="name" autoComplete="name" minLength={2} required placeholder="Como podemos chamar você?" /></label>}<label>E-mail<input name="email" type="email" autoComplete="email" required placeholder="voce@empresa.com" /></label><label>Senha<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 10 : 1} required placeholder={mode === 'register' ? 'Mínimo de 10 caracteres' : 'Sua senha'} /></label>{mode === 'register' && <><label>Confirmar senha<input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={10} required placeholder="Repita sua senha" /></label><div className="consentFields"><label className="checkField"><input name="acceptTerms" type="checkbox" required /> <span>Li e aceito os <a href="#termos">Termos de Uso</a>.</span></label><label className="checkField"><input name="acceptPrivacy" type="checkbox" required /> <span>Li a <a href="#privacidade">Política de Privacidade</a>.</span></label><label className="checkField"><input name="marketingOptIn" type="checkbox" /> <span>Quero receber conteúdos e novidades por e-mail.</span></label></div></>}{(error || externalError) && <div className="notice noticeError" role="alert">{error || externalError}</div>}<button className="primaryButton full" disabled={pending}>{pending ? 'Aguarde...' : mode === 'login' ? 'Entrar na plataforma' : 'Criar minha conta'} <span>→</span></button></form><p className="authFine">Dados de autenticação são processados de forma segura. Você pode usar e-mail e senha ou, quando configurado, acesso direto por um provedor confiável.</p></div></div></div>;
}

function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('carpivara_token') ?? '');
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('carpivara_theme') as Theme) || 'system');
  const [publicPage, setPublicPage] = useState<'landing' | 'auth'>('landing');
  const [view, setView] = useState<View>('consult');
  const [me, setMe] = useState<Me | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [creditPackages, setCreditPackages] = useState<CreditPackage[]>([]);
  const [history, setHistory] = useState<Query[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [admin, setAdmin] = useState<AdminSummary | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminPayments, setAdminPayments] = useState<AdminPayment[]>([]);
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
        const [summary, users, payments] = await Promise.all([api<AdminSummary>('/admin/overview'), api<AdminUser[]>('/admin/users'), api<AdminPayment[]>('/admin/payments')]);
        setAdmin(summary); setAdminUsers(users); setAdminPayments(payments);
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

  if (!token) return publicPage === 'landing' ? <Landing theme={theme} setTheme={setTheme} onAccess={() => setPublicPage('auth')} /> : <AuthScreen onAuthenticated={setToken} onBack={() => setPublicPage('landing')} externalError={error} />;

  return <div className="appShell"><aside className="sidebar"><Brand /><div className="workspaceLabel"><span>Área do cliente</span><b>Conta protegida</b></div><nav className="sideNav" aria-label="Navegação da plataforma"><button className={view === 'consult' ? 'active' : ''} onClick={() => navigate('consult')}><i>⌁</i> Nova consulta</button><button className={view === 'history' ? 'active' : ''} onClick={() => navigate('history')}><i>◫</i> Histórico</button><button className={view === 'wallet' ? 'active' : ''} onClick={() => navigate('wallet')}><i>◇</i> Carteira</button><button className={view === 'settings' ? 'active' : ''} onClick={() => navigate('settings')}><i>◌</i> Preferências</button>{canAdmin && <button className={view === 'admin' ? 'active' : ''} onClick={() => navigate('admin')}><i>◈</i> Administração</button>}</nav><div className="sideBottom"><div className="sideCredit"><span>Saldo disponível</span><strong>{formatCredits(me?.balance ?? 0)} <small>créditos</small></strong></div><button className="logoutButton" onClick={logout}>Sair da conta</button></div></aside><main className="workspace"><header className="appHeader"><div><p className="kicker">{view === 'consult' ? 'Consulta veicular' : view === 'history' ? 'Histórico de consultas' : view === 'wallet' ? 'Carteira de créditos' : view === 'admin' ? 'Controle operacional' : 'Preferências'}</p><h1>{view === 'consult' ? 'Bom ter você por aqui, ' : ''}{view === 'consult' ? (me?.user.name?.split(' ')[0] ?? 'cliente') : view === 'history' ? 'Suas consultas, organizadas.' : view === 'wallet' ? 'Clareza em cada crédito.' : view === 'admin' ? 'Visão administrativa.' : 'Do seu jeito.'}</h1></div><div className="headerActions"><ThemeControl theme={theme} setTheme={setTheme} /><div className="profileBadge"><span>{me?.user.name?.slice(0, 1).toUpperCase()}</span><div><strong>{me?.user.name}</strong><small>{me?.user.role.replace('_', ' ')}</small></div></div></div></header>{toast && <div className="toast" role="status">{toast}<button onClick={() => setToast('')} aria-label="Fechar aviso">×</button></div>}{error && <div className="notice noticeError" role="alert">{error}<button onClick={() => setError('')} aria-label="Fechar erro">×</button></div>}{view === 'consult' && <ConsultView plate={plate} setPlate={setPlate} products={products} productId={productId} setProductId={setProductId} selectedProduct={selectedProduct} balance={me?.balance ?? 0} loading={loading} queryStage={queryStage} runQuery={runQuery} report={report} exportReport={exportReport} />}{view === 'history' && <HistoryView history={filteredHistory} filter={historyFilter} setFilter={setHistoryFilter} loading={loading} openSavedQuery={openSavedQuery} onRepeat={(item) => { setPlate(item.plate); setProductId(item.productId); setReport(null); navigate('consult'); setToast('Placa e produto preenchidos. Uma nova consulta consumirá créditos.'); }} />}{view === 'wallet' && <WalletView balance={me?.balance ?? 0} transactions={transactions} packages={creditPackages} loading={loading} startCheckout={startCheckout} />}{view === 'settings' && <SettingsView theme={theme} setTheme={setTheme} user={me?.user} />}{view === 'admin' && canAdmin && <AdminView summary={admin} products={products} users={adminUsers} payments={adminPayments} />}</main><nav className="mobileNav" aria-label="Navegação móvel"><button className={view === 'consult' ? 'active' : ''} onClick={() => navigate('consult')}>Consultar</button><button className={view === 'history' ? 'active' : ''} onClick={() => navigate('history')}>Histórico</button><button className={view === 'wallet' ? 'active' : ''} onClick={() => navigate('wallet')}>Carteira</button><button onClick={logout}>Sair</button></nav></div>;
}

function ConsultView({ plate, setPlate, products, productId, setProductId, selectedProduct, balance, loading, queryStage, runQuery, report, exportReport }: { plate: string; setPlate: (value: string) => void; products: Product[]; productId: string; setProductId: (value: string) => void; selectedProduct?: Product; balance: number; loading: boolean; queryStage: number; runQuery: () => void; report: Query | null; exportReport: () => void }) {
  return <><section className="consultCard"><div className="consultIntro"><p className="kicker">Nova consulta</p><h2>O que você quer descobrir?</h2><p>Digite a placa, escolha o tipo de consulta e veja o custo antes de confirmar.</p></div><div className="consultForm"><label>Placa do veículo<input value={plate} onChange={(event) => setPlate(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7))} placeholder="ABC1D23" maxLength={7} aria-describedby="plate-help" /></label><label>Produto<select value={productId} onChange={(event) => setProductId(event.target.value)}>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><div className="costBox"><span>Custo da consulta</span><strong>{selectedProduct ? `${formatCredits(selectedProduct.creditCost)} créditos` : '—'}</strong><small>Saldo: {formatCredits(balance)} créditos</small></div><button className="primaryButton consultButton" onClick={runQuery} disabled={loading || !selectedProduct || balance < (selectedProduct?.creditCost ?? 0)}>{loading ? 'Consultando...' : 'Consultar agora'} <span>→</span></button></div>{selectedProduct && <div className="productDetail"><span>{selectedProduct.description}</span>{selectedProduct.features?.map((feature) => <small key={feature}>{feature}</small>)}</div>}</section>{loading && <section className="progressCard" aria-live="polite"><div className="progressHeader"><div className="spinner"></div><div><strong>{['Preparando sua consulta', 'Validando placa', 'Consultando informações', 'Organizando dados', 'Relatório pronto'][queryStage] ?? 'Consultando'}</strong><p>Você será informado se houver qualquer problema. Nenhum crédito é perdido em falha técnica.</p></div></div><div className="steps">{['Validar', 'Consultar', 'Organizar', 'Concluir'].map((step, index) => <span className={index < queryStage ? 'done' : index === queryStage ? 'current' : ''} key={step}>{step}</span>)}</div></section>}{report ? <ReportView query={report} exportReport={exportReport} /> : !loading && <section className="reportEmpty"><span className="emptyMark">C</span><div><p className="kicker">Relatório inteligente</p><h2>Seu próximo relatório aparece aqui.</h2><p>Identificação, características, débitos e ocorrências serão organizados em uma leitura objetiva, sem despejar dados técnicos.</p></div></section>}</>;
}

function ReportView({ query, exportReport }: { query: Query; exportReport: () => void }) {
  const result = query.result; if (!result) return null;
  const total = result.debts.reduce((sum, item) => sum + item.amountCents, 0);
  const alertCount = result.restrictions.filter((item) => item.alert).length;
  const diagnosisClass = result.diagnostic.level.toLowerCase().replace('_', '-');
  return <section className="reportShell"><div className="reportHeader"><div><div className="reportMeta"><span>Relatório #{query.id.slice(0, 8).toUpperCase()}</span><StatusBadge status={query.status} /><span>{formatDate(query.completedAt ?? query.createdAt)}</span></div><h2>{result.identification.fullModel ?? result.identification.model ?? 'Veículo consultado'}</h2><p>{result.characteristics.manufactureYear ?? '—'}/{result.characteristics.modelYear ?? '—'} · {result.characteristics.color ?? 'Cor não informada'} · {result.characteristics.fuel ?? 'Combustível não informado'}</p></div><div className="reportActions"><span className="plateBadge">{result.identification.plate}</span><button className="secondaryButton compact" onClick={exportReport}>Exportar dados</button></div></div><div className={`diagnostic ${diagnosisClass}`}><span className="diagnosticIcon">{result.diagnostic.level === 'CLEAR' ? '✓' : '!'}</span><div><small>Diagnóstico geral</small><strong>{result.diagnostic.title}</strong><p>{result.diagnostic.reason}</p></div></div><div className="reportMetrics"><Metric label="Situação" value={result.registration.status ?? 'Não informado'} /><Metric label="Débitos mapeados" value={formatMoney(total)} attention={total > 0} /><Metric label="Ocorrências" value={alertCount ? `${alertCount} atenção` : 'Nada consta'} attention={alertCount > 0} /><Metric label="Localidade" value={`${result.registration.city ?? '—'}/${result.registration.state ?? '—'}`} /></div><div className="reportGrid"><DataBlock title="Identificação" rows={[["Placa", result.identification.plate], ["Marca", result.identification.brand], ["Modelo", result.identification.model], ["Renavam", mask(result.identification.renavam)], ["Chassi", mask(result.identification.chassis)], ["Motor", mask(result.identification.engine)], ["Câmbio", result.identification.gearbox]]} /><DataBlock title="Características" rows={[["Cor", result.characteristics.color], ["Combustível", result.characteristics.fuel], ["Categoria", result.characteristics.category], ["Tipo", result.characteristics.type], ["Espécie", result.characteristics.species], ["Potência", result.characteristics.power ? `${result.characteristics.power} cv` : undefined], ["Cilindrada", result.characteristics.displacement ? `${result.characteristics.displacement} cc` : undefined]]} /><DataBlock title="Registro" rows={[["Município", result.registration.city], ["UF", result.registration.state], ["Licenciamento", result.registration.licensingDate], ["Exercício", result.registration.licensingYear], ["Situação", result.registration.status], ["Recall", result.recall]]} /><div className="dataBlock"><h3>Débitos <span>{total > 0 ? 'Atenção' : 'Em dia'}</span></h3><div className="dataRows">{result.debts.map((item) => <div className="dataRow" key={item.key}><span>{item.label}</span><strong className={item.hasDebt ? 'attentionText' : ''}>{formatMoney(item.amountCents)}</strong></div>)}</div></div><div className="dataBlock dataBlockWide"><h3>Restrições <span>{alertCount ? `${alertCount} ocorrência(s)` : 'Nada consta'}</span></h3><div className="restrictionGrid">{result.restrictions.map((item) => <div className={`restriction ${item.alert ? 'alert' : 'clear'}`} key={item.key}><span className="restrictionSymbol">{item.alert ? '!' : '✓'}</span><div><strong>{item.label}</strong><p>{item.status}</p></div></div>)}</div></div></div><p className="reportDisclaimer">As informações refletem exclusivamente os dados retornados pelo provedor no momento da consulta. Este relatório não substitui verificações oficiais quando necessárias.</p></section>;
}
function Metric({ label, value, attention = false }: { label: string; value: string; attention?: boolean }) { return <div className={attention ? 'metric attentionMetric' : 'metric'}><span>{label}</span><strong>{value}</strong></div>; }
function DataBlock({ title, rows }: { title: string; rows: [string, string | undefined][] }) { return <div className="dataBlock"><h3>{title}</h3><div className="dataRows">{rows.map(([label, value]) => <div className="dataRow" key={label}><span>{label}</span><strong>{value || '—'}</strong></div>)}</div></div>; }

function HistoryView({ history, filter, setFilter, loading, openSavedQuery, onRepeat }: { history: Query[]; filter: string; setFilter: (value: string) => void; loading: boolean; openSavedQuery: (id: string) => void; onRepeat: (query: Query) => void }) {
  return <section className="contentCard"><div className="listHeader"><div><h2>Consultas salvas</h2><p>Abra um relatório anterior sem novo consumo de créditos.</p></div><label className="searchField"><span>Buscar placa</span><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="ABC1D23" /></label></div><div className="historyTable"><div className="tableHead"><span>Placa</span><span>Produto</span><span>Data</span><span>Status</span><span>Ações</span></div>{history.length === 0 ? <div className="emptyList"><strong>Nenhuma consulta encontrada.</strong><p>Quando você consultar um veículo, o relatório ficará disponível aqui.</p></div> : history.map((item) => <div className="tableRow" key={item.id}><strong>{item.plate}</strong><span>{item.productName}</span><span>{formatDate(item.createdAt)}</span><StatusBadge status={item.status} /><div className="rowActions"><button className="tableButton" onClick={() => openSavedQuery(item.id)} disabled={loading || item.status !== 'SUCCESS'}>Abrir</button><button className="tableButton ghost" onClick={() => onRepeat(item)}>Consultar de novo</button></div></div>)}</div></section>;
}

function WalletView({ balance, transactions, packages, loading, startCheckout }: { balance: number; transactions: Transaction[]; packages: CreditPackage[]; loading: boolean; startCheckout: (slug: string) => void }) { return <><section className="walletHero"><div><p className="kicker">Carteira CARPIVARA</p><h2>{formatCredits(balance)} <small>créditos disponíveis</small></h2><p>Todo movimento fica registrado. Você escolhe um pacote, conclui o pagamento em checkout seguro e os créditos são liberados somente após a confirmação financeira.</p></div></section><section className="contentCard creditStore"><div className="listHeader"><div><p className="kicker">Comprar créditos</p><h2>Escolha o pacote ideal</h2><p>Pix e cartão são processados no checkout seguro do parceiro de pagamentos.</p></div></div><div className="creditPackageGrid">{packages.map((pack) => <article key={pack.slug}><span>{formatCredits(pack.credits)} créditos</span><h3>{pack.name}</h3><p>{pack.description}</p><strong>{formatMoney(pack.priceCents)}</strong><button className="primaryButton" disabled={loading} onClick={() => startCheckout(pack.slug)}>Escolher pacote <span>→</span></button></article>)}</div></section><section className="contentCard"><div className="listHeader"><div><h2>Movimentações</h2><p>Compras, consultas e estornos registrados em ordem cronológica.</p></div></div><div className="historyTable transactions"><div className="tableHead"><span>Movimento</span><span>Descrição</span><span>Data</span><span>Saldo após</span></div>{transactions.length === 0 ? <div className="emptyList"><strong>Sua carteira ainda não teve movimentações.</strong><p>Quando um pagamento for confirmado ou uma consulta for realizada, o histórico aparecerá aqui.</p></div> : transactions.map((item) => <div className="tableRow" key={item.id}><strong className={item.amount > 0 ? 'creditAmount' : 'debitAmount'}>{item.amount > 0 ? '+' : ''}{formatCredits(item.amount)} cr.</strong><span>{item.description}</span><span>{formatDate(item.createdAt)}</span><span>{formatCredits(item.balanceAfter)} cr.</span></div>)}</div></section></>; }

function SettingsView({ theme, setTheme, user }: { theme: Theme; setTheme: (value: Theme) => void; user?: User }) { return <section className="settingsGrid"><article className="contentCard"><p className="kicker">Aparência</p><h2>Escolha sua experiência</h2><p className="muted">A preferência é salva neste dispositivo.</p><ThemeControl theme={theme} setTheme={setTheme} /></article><article className="contentCard"><p className="kicker">Conta</p><h2>Dados de acesso</h2><dl className="accountData"><div><dt>Nome</dt><dd>{user?.name}</dd></div><div><dt>E-mail</dt><dd>{user?.email}</dd></div><div><dt>Perfil</dt><dd>{user?.role.replace('_', ' ')}</dd></div></dl><p className="muted">A alteração de senha está protegida pela sua senha atual e pode ser realizada pela API segura da plataforma.</p></article></section>; }
function AdminView({ summary, products, users, payments }: { summary: AdminSummary | null; products: Product[]; users: AdminUser[]; payments: AdminPayment[] }) { const cards = [{ label: 'Usuários ativos', value: summary?.active_users ?? '—' }, { label: 'Consultas hoje', value: summary?.queries_today ?? '—' }, { label: 'Consultas concluídas', value: summary?.successful_queries ?? '—' }, { label: 'Estornos', value: summary?.refunds ?? '—' }, { label: 'Créditos vendidos', value: summary?.credits_sold ?? '—' }, { label: 'Créditos consumidos', value: summary?.credits_consumed ?? '—' }]; return <><section className="adminMetrics">{cards.map((card) => <div className="metric" key={card.label}><span>{card.label}</span><strong>{card.value}</strong></div>)}</section><section className="adminSection contentCard"><div className="listHeader"><div><p className="kicker">Gestão de clientes</p><h2>Usuários e carteiras</h2><p>Visão operacional protegida por permissões de servidor.</p></div></div><div className="adminDataTable"><div className="adminDataHead"><span>Cliente</span><span>Perfil</span><span>Carteira</span><span>Consultas</span><span>Status</span></div>{users.length ? users.map((user) => <div className="adminDataRow" key={user.id}><div><strong>{user.name}</strong><small>{user.email}</small></div><span>{user.role.replace('_', ' ')}</span><strong>{formatCredits(user.balance)} cr.</strong><span>{formatCredits(user.queriesCount)}</span><span className={user.active ? 'status status-success' : 'status status-failed'}>{user.active ? 'Ativo' : 'Inativo'}</span></div>) : <div className="emptyList"><strong>Nenhum usuário para exibir.</strong></div>}</div></section><section className="adminSection contentCard"><div className="listHeader"><div><p className="kicker">Conciliação financeira</p><h2>Pagamentos recentes</h2><p>Créditos só são liberados após a confirmação do provedor de pagamento.</p></div></div><div className="adminDataTable"><div className="adminDataHead payments"><span>Cliente</span><span>Valor</span><span>Créditos</span><span>Provedor</span><span>Status</span></div>{payments.length ? payments.map((payment) => <div className="adminDataRow payments" key={payment.id}><div><strong>{payment.customer.name}</strong><small>{payment.customer.email}</small></div><strong>{formatMoney(payment.amountCents)}</strong><span>{formatCredits(payment.credits)} cr.</span><span>{payment.provider}</span><StatusBadge status={payment.status === 'PAID' ? 'SUCCESS' : payment.status === 'FAILED' ? 'FAILED' : 'PROCESSING'} /></div>) : <div className="emptyList"><strong>Nenhum pagamento conciliado ainda.</strong></div>}</div></section><section className="contentCard"><div className="listHeader"><div><p className="kicker">Catálogo operacional</p><h2>Produtos configurados</h2><p>Os custos de créditos vêm do banco e podem ser administrados com permissões adequadas.</p></div></div><div className="productGrid">{products.map((product) => <article key={product.id}><span>{product.id}</span><h3>{product.name}</h3><p>{product.description}</p><strong>{formatCredits(product.creditCost)} créditos</strong></article>)}</div></section></>; }

createRoot(document.getElementById('root')!).render(<App />);
