# Deploy no Coolify

Este produto é **independente**: crie um projeto, um PostgreSQL, segredos e domínios novos. Nada é herdado de outro sistema; copie apenas os *nomes* das variáveis, nunca os valores antigos.

## Aplicação

- Build pack **Dockerfile** em `/Dockerfile`, porta interna `4000`, healthcheck `GET /health` (`{"ok":true,"database":"ok"}`).
- A API serve o front React e a API no mesmo processo. Cadastre **dois domínios** apontando para a mesma aplicação:
  - site: `https://buscarr.com.br`
  - (opcional) `https://bl.buscarr.com.br` também abre o site; o endereço principal continua `https://buscarr.com.br`. Os subdomínios `app` e `api` não são necessários: o app fica em `/app` e a API em `/api`, no mesmo endereço do site.
  - painel: `https://admin.buscarr.com.br` (informe-o em `ADMIN_HOSTS`)
- **É um único recurso no Coolify, com dois domínios** (não crie outra aplicação): em *Configuration → General → Domains*, informe os dois separados por vírgula, por exemplo `https://buscarr.com.br,https://admin.buscarr.com.br`. No DNS, crie um registro **A** `admin` apontando para o mesmo IP do servidor (igual ao do domínio principal). `ADMIN_HOSTS` deve conter o host do painel, sem `https://`.
- Para entrar no painel antes de o DNS propagar, adicione também em *Domains* o endereço temporário do Coolify (`https://<id>.<IP-do-servidor>.sslip.io`) e coloque esse host em `ADMIN_HOSTS`, separado por vírgula (`admin.buscarr.com.br,<id>.<IP>.sslip.io`). Remova-o quando o domínio definitivo estiver funcionando.
- O Dockerfile é multi-stage e roda como usuário não-root; nenhum segredo entra na imagem.

## Banco

PostgreSQL 16+ dedicado ao produto (banco e usuário novos). As migrations rodam no startup com advisory lock; para rollout com várias réplicas rode antes, como job único: `node apps/api/dist/cli.js migrate`.

## Variáveis (runtime — não use `.env` versionado)

Os nomes estão em `.env.example`. Mínimo para produção:

```dotenv
NODE_ENV=production
PORT=4000
APP_NAME=BL Buscar
APP_URL=https://buscarr.com.br
WEB_ORIGIN=https://buscarr.com.br
ADMIN_HOSTS=admin.buscarr.com.br
TRUST_PROXY=2   # 2 quando o site passa pela Cloudflare e pelo proxy do Coolify; 1 sem Cloudflare

DATABASE_URL=postgresql://USUARIO:SENHA@HOST_INTERNO:5432/blbuscar
DATABASE_SSL=false

# Gere valores NOVOS (ex.: openssl rand -hex 48). Devem ser diferentes entre si.
JWT_SECRET=<≥64 caracteres>
ADMIN_JWT_SECRET=<≥64 caracteres, diferente do JWT_SECRET>
DATA_ENCRYPTION_KEY=<≥32 caracteres; guarde em cofre>
TEAM_TOTP_REQUIRED=false   # true torna o 2FA obrigatório para toda a equipe
PII_REVEAL_ENABLED=true

DATA_PROVIDER=real
VEHICLE_API_BASE_URL=<url do provedor contratado>
VEHICLE_API_QUERY_PATH=<caminho da consulta>
VEHICLE_API_AUTH_SCHEME=bearer
VEHICLE_API_TOKEN=<token do provedor>

PAYMENT_PROVIDER=asaas            # ou mercadopago | disabled
PAYMENT_API_BASE_URL=https://api.asaas.com
PAYMENT_API_KEY=<chave>
PAYMENT_WEBHOOK_SECRET=<segredo do webhook>

EMAIL_PROVIDER=smtp
SMTP_HOST=<host>
SMTP_USER=<usuário>
SMTP_PASSWORD=<senha>
EMAIL_FROM=no-reply@buscarr.com.br

SANDBOX_SEED_ENABLED=false
SANDBOX_CREDIT_PURCHASE_ENABLED=false
```

Se algo estiver inseguro, o container **não sobe** e o log informa `PRODUCTION_CONFIGURATION_INVALID:<códigos>`.

## Servidor novo, passo a passo

1. **Coolify:** crie um projeto novo e, dentro dele, um PostgreSQL 16 (banco `blbuscar`, usuário e senha novos). Copie a URL interna do banco para `DATABASE_URL`.
2. **Aplicação:** *New Resource → Public/Private Repository*, branch `main`, build pack **Dockerfile**, porta `4000`. Em *Domains*: `https://buscarr.com.br,https://admin.buscarr.com.br`.
3. **DNS (Cloudflare):** registros `A` para `@` e `admin` apontando para o IP do servidor, com proxy ligado. SSL/TLS em **Full (strict)**. Os subdomínios `app` e `api` não são usados.
4. **Segredos:** gere no terminal (cada comando gera um valor diferente, use um para cada variável):
   - `JWT_SECRET`: `openssl rand -hex 48`
   - `ADMIN_JWT_SECRET`: `openssl rand -hex 48`
   - `DATA_ENCRYPTION_KEY`: `openssl rand -hex 32`
   - `EMAIL_WEBHOOK_SECRET` (só quando o e-mail for ligado): `openssl rand -hex 32`
   - senha do administrador: `openssl rand -base64 18`
5. **Variáveis:** cole o bloco no Coolify (todas em tempo de execução, `buildtime=false`) e preencha os valores que ficaram vazios.
6. **Deploy** e confira os logs: `admin_bootstrap_created` indica que o administrador foi criado. Teste `https://buscarr.com.br/health`.
7. Depois de entrar no painel, **retire** `ADMIN_BOOTSTRAP_EMAIL` e `ADMIN_BOOTSTRAP_PASSWORD` das variáveis.

## Subir sem provedor nem gateway (ativação em duas etapas)

Para colocar o sistema no ar antes de contratar as APIs, use `DATA_PROVIDER=disabled` e `PAYMENT_PROVIDER=disabled`: o site, o app e o painel funcionam, consultas pagas aparecem como "em breve", não há cobrança nem compra de saldo. Depois, troque para `DATA_PROVIDER=real` (+ `VEHICLE_API_*`) e `PAYMENT_PROVIDER=asaas|mercadopago` e faça redeploy.

## Primeiro acesso

**Opção A — por variáveis (sem terminal):** defina `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD` (12+ caracteres) e `ADMIN_BOOTSTRAP_NAME`, faça o redeploy e entre no painel. O administrador só é criado se ainda não existir nenhum SUPER_ADMIN ativo (nunca sobrescreve). Depois do primeiro acesso, **remova `ADMIN_BOOTSTRAP_PASSWORD`** do ambiente.

**Não consegue entrar ("e-mail ou senha inválidos")?** Veja nos logs da aplicação, logo após a subida, uma destas linhas: `admin_bootstrap_created` (administrador criado; confira `passwordLength` com o tamanho da sua senha — se for menor, o Coolify cortou algum caractere como `$`), `admin_bootstrap_skipped` (já existia outro SUPER_ADMIN, por isso a senha das variáveis **não** foi aplicada) ou nenhuma das duas (as variáveis não chegaram ao container em tempo de execução, ou o deploy falhou e o container antigo continua no ar). Para recuperar o acesso sem terminal, defina também `ADMIN_BOOTSTRAP_FORCE_RESET=true`, faça redeploy, entre e cadastre o 2FA de novo; depois **remova `ADMIN_BOOTSTRAP_FORCE_RESET` e `ADMIN_BOOTSTRAP_PASSWORD`**. Cinco tentativas erradas bloqueiam a conta por 15 minutos (o reset também desbloqueia). Prefira senhas sem `$`, aspas e espaços nas extremidades.

**Opção B — pelo terminal:**

1. Abra o terminal da aplicação no Coolify e rode `node apps/api/dist/cli.js admin:create voce@empresa.com.br "Seu Nome"`. A senha provisória aparece **uma única vez**.
2. Acesse `https://admin.buscarr.com.br`, entre com a senha. Se quiser, ative o 2FA em "Minha conta" (guarde os códigos de recuperação).
3. Em **Preços**, informe o custo do provedor e os preços de referência de mercado; confira os preços de venda provisórios.
4. Em **Pagamentos**, confirme Pix e crédito à vista e preencha as alíquotas **validadas pelo seu contador** (o painel exibe aviso fiscal).
5. Cadastre os webhooks no gateway: `${APP_URL}/api/payments/asaas/webhook` (ou `/mercadopago/webhook`).
6. Valide com uma consulta real de baixo valor antes de divulgar.

## Mudando de domínio

Altere `APP_URL`, `WEB_ORIGIN`, `ADMIN_HOSTS`/`ADMIN_URL`, `EMAIL_FROM` e as URIs de retorno de OAuth. O SEO (canonical, sitemap, Open Graph) segue `APP_URL`.
