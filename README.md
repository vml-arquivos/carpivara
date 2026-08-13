# Carpivara Platform v0.3.0

Plataforma de consulta veicular preparada para operar primeiro em SANDBOX com dados fictícios e, posteriormente, trocar somente o adaptador do provedor pela API veicular contratada.

## Incluído nesta versão
- Login e autenticação JWT.
- Carteira de créditos com ledger de movimentações.
- Reserva de créditos antes da consulta e estorno automático em falha.
- Produtos de consulta configuráveis no banco.
- Consulta por placa e normalização do formato BDRP informado.
- Persistência do resultado normalizado e do payload original.
- Histórico de consultas.
- PostgreSQL com criação de schema e seed sandbox controlado por variável.
- Interface responsiva mais clean em navy + dourado.
- Dockerfile multi-stage para produção.
- Frontend e API no mesmo container, evitando URLs `localhost` em produção.
- `/health` validando também a conexão com PostgreSQL.
- Documentação específica para deploy no Coolify.

## Desenvolvimento local
1. Copie `.env.example` para `.env`.
2. Suba PostgreSQL com `docker compose up -d`.
3. Instale dependências com `npm install`.
4. Execute `npm run dev`.

Frontend local: `http://localhost:5173`  
API local: `http://localhost:4000`

## Produção
Consulte `DEPLOY-COOLIFY.md`.

## Sandbox
Usuários fictícios e placas de teste só devem permanecer habilitados enquanto `SANDBOX_SEED_ENABLED=true`.

Placas: `TST0A00`, `DEV1B11`, `MOCK2C22`.
