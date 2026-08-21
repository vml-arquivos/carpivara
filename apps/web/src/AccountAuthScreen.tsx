import { useEffect, useState, type FormEvent } from 'react';
import Brand from './Brand';

const API = '/api';
type AuthMode = 'login' | 'register' | 'forgot' | 'reset';
type OAuthProviderStatus = { id: 'google' | 'microsoft' | 'apple'; label: string; enabled: boolean };
type ApiError = { error?: string; message?: string };

type Props = {
  onAuthenticated: (token: string) => void;
  onBack: () => void;
  externalError?: string;
  initialMode?: 'login' | 'register';
  resetToken?: string;
};


export default function AccountAuthScreen({ onAuthenticated, onBack, externalError = '', initialMode = 'register', resetToken = '' }: Props) {
  const [mode, setMode] = useState<AuthMode>(resetToken ? 'reset' : initialMode);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const [providers, setProviders] = useState<OAuthProviderStatus[]>([]);

  useEffect(() => { setMode(resetToken ? 'reset' : initialMode); setError(''); setNotice(''); }, [initialMode, resetToken]);
  useEffect(() => { void fetch(`${API}/auth/providers`).then((response) => response.ok ? response.json() : { providers: [] }).then((body: { providers?: OAuthProviderStatus[] }) => setProviders(body.providers ?? [])).catch(() => setProviders([])); }, []);

  function selectMode(next: AuthMode) { setMode(next); setError(''); setNotice(''); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(''); setNotice(''); setPending(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    try {
      if (mode === 'forgot') {
        const response = await fetch(`${API}/auth/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
        const body = await response.json() as ApiError & { message?: string };
        if (!response.ok) throw new Error(body.message ?? 'Não foi possível solicitar a recuperação agora.');
        setNotice(body.message ?? 'Se o e-mail estiver cadastrado, enviaremos as instruções para redefinir sua senha.');
        return;
      }
      if (mode === 'reset') {
        const password = String(form.get('password') ?? '');
        const confirmation = String(form.get('passwordConfirmation') ?? '');
        if (password.length < 10) throw new Error('Crie uma senha com pelo menos 10 caracteres.');
        if (password !== confirmation) throw new Error('As senhas precisam ser iguais.');
        const response = await fetch(`${API}/auth/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: resetToken, newPassword: password }) });
        const body = await response.json() as ApiError & { token?: string };
        if (!response.ok || !body.token) throw new Error(body.message ?? 'O link de redefinição expirou ou já foi utilizado.');
        sessionStorage.setItem('carpivara_token', body.token);
        onAuthenticated(body.token);
        return;
      }
      const password = String(form.get('password') ?? '');
      if (mode === 'register' && String(form.get('name') ?? '').trim().length < 2) throw new Error('Informe seu nome completo para criar a conta.');
      if (mode === 'register' && password.length < 10) throw new Error('Crie uma senha com pelo menos 10 caracteres.');
      if (mode === 'register' && password !== String(form.get('passwordConfirmation') ?? '')) throw new Error('As senhas precisam ser iguais.');
      if (mode === 'register' && (form.get('acceptTerms') !== 'on' || form.get('acceptPrivacy') !== 'on')) throw new Error('Para criar sua conta, aceite os Termos de Uso e a Política de Privacidade.');
      const payload = mode === 'login'
        ? { email, password }
        : { name: String(form.get('name') ?? ''), email, password, acceptTerms: form.get('acceptTerms') === 'on', acceptPrivacy: form.get('acceptPrivacy') === 'on', marketingOptIn: form.get('marketingOptIn') === 'on' };
      const response = await fetch(`${API}/auth/${mode === 'login' ? 'login' : 'register'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await response.json() as ApiError & { token?: string };
      if (!response.ok || !body.token) throw new Error(body.message ?? 'Não foi possível acessar sua conta.');
      sessionStorage.setItem('carpivara_token', body.token);
      onAuthenticated(body.token);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível concluir a operação.');
    } finally {
      setPending(false);
    }
  }

  function startSocialLogin(provider: OAuthProviderStatus) { if (provider.enabled) window.location.assign(`${API}/auth/oauth/${provider.id}/start`); }
  const providerLabel: Record<OAuthProviderStatus['id'], string> = { google: 'Continuar com Google', microsoft: 'Continuar com Microsoft', apple: 'Continuar com Apple' };
  const providerIcon: Record<OAuthProviderStatus['id'], string> = { google: 'G', microsoft: '⊞', apple: '●' };
  const enabledProviders = (['google', 'microsoft', 'apple'] as OAuthProviderStatus['id'][]).map((id) => providers.find((provider) => provider.id === id) ?? { id, label: id, enabled: false }).filter((provider) => provider.enabled);
  const isAccountMode = mode === 'login' || mode === 'register';
  const heading = mode === 'login' ? 'Entre no seu dashboard.' : mode === 'register' ? 'Seu dashboard começa aqui.' : mode === 'forgot' ? 'Recupere seu acesso.' : 'Crie uma nova senha.';
  const description = mode === 'login' ? 'Acesse carteira, consultas e relatórios salvos com seu e-mail e senha.' : mode === 'register' ? 'O cadastro não exige pagamento. Crie sua conta e entre na plataforma agora.' : mode === 'forgot' ? 'Informe o e-mail cadastrado e enviaremos um link seguro para você criar uma nova senha.' : 'Escolha uma senha forte com pelo menos 10 caracteres para voltar à sua conta.';

  return <div className="authShell"><div className="authVisual"><button className="backButton" onClick={onBack}>← Voltar ao início</button><Brand /><div className="authPitch"><p className="kicker">Acesso à plataforma</p><h1>Crie sua conta. Acesse seu dashboard.</h1><p>O cadastro é gratuito. Você só escolhe e paga por créditos no momento em que decidir realizar uma consulta.</p></div><div className="authDecor"><span>Dashboard pessoal</span><span>Carteira de créditos</span><span>Histórico protegido</span></div></div><div className="authPanel"><div className="authCard authCardPremium">{isAccountMode && <div className="authTabs"><button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => selectMode('login')}>Já tenho conta</button><button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => selectMode('register')}>Criar conta</button></div>}{!isAccountMode && <button type="button" className="textButton authBackLink" onClick={() => selectMode('login')}>← Voltar para o login</button>}<h2>{heading}</h2><p className="muted">{description}</p>{isAccountMode && enabledProviders.length > 0 && <><div className="socialAuth" aria-label="Acesso social">{enabledProviders.map((provider) => <button className="socialButton" type="button" key={provider.id} onClick={() => startSocialLogin(provider)}><span aria-hidden="true">{providerIcon[provider.id]}</span>{providerLabel[provider.id]}</button>)}</div><div className="authDivider"><span>ou continue com e-mail</span></div></>}<form onSubmit={submit}>{mode === 'register' && <label>Nome completo<input name="name" autoComplete="name" minLength={2} required placeholder="Como podemos chamar você?" /></label>}{mode !== 'reset' && <label>E-mail<input name="email" type="email" autoComplete="email" required placeholder="voce@empresa.com" /></label>}{mode === 'reset' && <input type="hidden" name="email" value="" />}{mode !== 'forgot' && <label>Senha<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' || mode === 'reset' ? 10 : 1} required placeholder={mode === 'register' || mode === 'reset' ? 'Crie uma senha com pelo menos 10 caracteres' : 'Sua senha'} /></label>}{(mode === 'register' || mode === 'reset') && <label>Confirmar senha<input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={10} required placeholder="Repita sua senha" /></label>}{mode === 'register' && <div className="consentFields"><label className="checkField"><input name="acceptTerms" type="checkbox" required /> <span><b>Obrigatório:</b> li e aceito os Termos de Uso.</span></label><label className="checkField"><input name="acceptPrivacy" type="checkbox" required /> <span><b>Obrigatório:</b> li e aceito a Política de Privacidade.</span></label><label className="checkField"><input name="marketingOptIn" type="checkbox" /> <span>Quero receber conteúdos e novidades por e-mail.</span></label></div>}{(error || externalError) && <div className="notice noticeError" role="alert">{error || externalError}</div>}{notice && <div className="notice noticeSuccess" role="status">{notice}</div>}<button className="primaryButton full" disabled={pending}>{pending ? (mode === 'forgot' ? 'Enviando instruções...' : mode === 'reset' ? 'Salvando nova senha...' : 'Processando...') : mode === 'login' ? 'Entrar no dashboard' : mode === 'register' ? 'Criar conta e acessar' : mode === 'forgot' ? 'Enviar link de recuperação' : 'Criar nova senha'} <span>→</span></button></form>{mode === 'login' && <button type="button" className="forgotLink" onClick={() => selectMode('forgot')}>Esqueci minha senha</button>}<p className="authFine">Dados de autenticação são processados de forma segura. Nenhum crédito é cobrado para criar ou acessar a sua conta.</p></div></div></div>;
}
