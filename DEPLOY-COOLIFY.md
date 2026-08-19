# Deploy no Coolify

## Configuração da aplicação

Crie a aplicação usando **Dockerfile**, com base `/`, localização `/Dockerfile`, porta interna `4000` e healthcheck em `/health`. A API serve o build React e as rotas de API no mesmo processo; configure um único domínio, por exemplo `https://carpivara.casadf.com.br`.

O Dockerfile é multi-stage, executa o build dos dois workspaces e roda como usuário não-root. Nenhum segredo é copiado para a imagem durante o build.

## Banco PostgreSQL

Crie um PostgreSQL separado no mesmo projeto/servidor e informe a connection string interna em `DATABASE_URL`. O startup executa o bootstrap compatível e migrations versionadas antes de abrir a aplicação.

## Variáveis para a primeira demonstração sandbox

Cadastre as variáveis no painel do Coolify. Não use arquivo `.env` versionado e não reutilize nenhum segredo local.

```dotenv
NODE_ENV=production
PORT=4000
APP_NAME=Carpivara
APP_URL=https://carpivara.casadf.com.br
WEB_ORIGIN=https://carpivara.casadf.com.br
TRUST_PROXY=1

# Recuperação de senha por e-mail — configure somente no runtime do Coolify.
EMAIL_PROVIDER=smtp
SMTP_HOST=SEU_HOST_SMTP
SMTP_PORT=587
SMTP_USER=SEU_USUARIO_SMTP
SMTP_PASSWORD=SEU_SEGREDO_SMTP
SMTP_SECURE=false
EMAIL_FROM=no-reply@carpivara.casadf.com.br
PASSWORD_RESET_TTL_MINUTES=30
DATABASE_URL=postgresql://USUARIO:SENHA@HOST_INTERNO:5432/NOME_BANCO
DATABASE_SSL=false
JWT_SECRET=GERAR_UM_SEGREDO_ALEATORIO_COM_64_OU_MAIS_CARACTERES
JWT_EXPIRES_IN=2h

DATA_PROVIDER=mock
QUERY_REQUEST_TIMEOUT_MS=20000
PAYMENT_PROVIDER=sandbox
SANDBOX_SEED_ENABLED=true
SANDBOX_CREDIT_PURCHASE_ENABLED=true

RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=120
LOGIN_RATE_LIMIT_MAX=10
LOG_LEVEL=info
LOG_SENSITIVE_DATA=false
AUDIT_LOG_ENABLED=true
STORE_RAW_PROVIDER_RESPONSE=true
```

Depois do primeiro deploy, confirme `GET /health`, login sandbox, consulta `TST0A00`, abertura do histórico e cenário de estorno `TIM0E00`.

## Antes de expor ao público

Desative `SANDBOX_SEED_ENABLED` e `SANDBOX_CREDIT_PURCHASE_ENABLED`, remova contas fictícias criadas na demonstração e defina uma política de acesso, retenção e suporte. O provider mock pode permanecer apenas quando isso estiver claramente identificado como sandbox.

## Provider e pagamentos reais

Não use `DATA_PROVIDER=real` até a implementação do adapter ser baseada na documentação oficial. Da mesma forma, não ative gateway de pagamento real até haver webhook autenticado e idempotente; crédito nunca deve ser liberado somente por retorno de navegador.

## Diagnóstico de deploy

| Sintoma | Verificação |
| --- | --- |
| Healthcheck falha | Confirme `DATABASE_URL`, acesso de rede ao PostgreSQL e logs de migration. |
| Login falha | Confirme segredo JWT, usuários provisionados e limite de login. |
| Recuperação não envia e-mail | Confirme `EMAIL_PROVIDER=smtp`, host, porta, usuário, senha, remetente autorizado e os logs de entrega do provedor. |
| Frontend abre sem API | Confirme o domínio único e proxy para a porta `4000`. |
| Consulta falha em sandbox | Confirme `DATA_PROVIDER=mock` e `SANDBOX_SEED_ENABLED=true` somente em ambiente de demonstração. |

> Credenciais de banco, JWT, provider e pagamentos devem existir somente como variáveis de runtime do Coolify. Nunca as coloque no Git, Dockerfile, logs ou argumentos de build.
