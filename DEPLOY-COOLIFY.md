# Deploy no Coolify — Dockerfile

## Aplicação
- Build Pack: Dockerfile
- Dockerfile Location: `/Dockerfile`
- Base Directory: `/`
- Porta interna: `4000`
- Healthcheck: `/health`
- Domínio: defina o domínio HTTPS na aplicação do Coolify

## Banco PostgreSQL
Crie um PostgreSQL separado no mesmo projeto/servidor do Coolify. Use a connection string interna fornecida pelo Coolify em `DATABASE_URL`.

## Variáveis obrigatórias para o primeiro deploy SANDBOX
```env
NODE_ENV=production
PORT=4000
APP_NAME=Carpivara
APP_URL=https://SEU-DOMINIO.com.br
WEB_ORIGIN=https://SEU-DOMINIO.com.br
TRUST_PROXY=1
DATABASE_URL=postgresql://USUARIO:SENHA@HOST_INTERNO:5432/NOME_BANCO
DATABASE_SSL=false
JWT_SECRET=COLOQUE_UM_SEGREDO_ALEATORIO_COM_64_OU_MAIS_CARACTERES
DATA_PROVIDER=mock
PAYMENT_PROVIDER=sandbox
SANDBOX_SEED_ENABLED=true
SANDBOX_CREDIT_PURCHASE_ENABLED=true
```

## Somente quando a API veicular real for contratada
```env
DATA_PROVIDER=real
VEHICLE_API_BASE_URL=https://...
VEHICLE_API_LOGIN=...
VEHICLE_API_PASSWORD=...
VEHICLE_API_TOKEN=...
VEHICLE_API_TIMEOUT_MS=15000
```
O adaptador real deve ser implementado conforme o contrato/documentação do fornecedor antes de mudar `DATA_PROVIDER` para `real`.

## Quando o gateway de pagamento real entrar
```env
PAYMENT_PROVIDER=asaas
PAYMENT_WEBHOOK_SECRET=...
SANDBOX_CREDIT_PURCHASE_ENABLED=false
```
Não habilite `asaas` até o adaptador/webhook de produção estar implementado e validado.

## Primeiro acesso do sandbox
- Cliente: `cliente@demo.local` / `Demo@123456`
- Admin: `admin@demo.local` / `Admin@123456`

Troque/remova usuários de demonstração antes de abrir o domínio ao público.

## Placas fictícias
- `TST0A00`
- `DEV1B11`
- `MOCK2C22`

## Segurança
Nunca versione `.env`, tokens, senha do PostgreSQL, segredo JWT ou credenciais do provedor. No Coolify, cadastre-os como Environment Variables.
