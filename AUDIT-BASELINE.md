# Auditoria e baseline — evolução FIPE/funil

## Estado inicial

A branch de trabalho foi criada como `feat/funil-consultas-fipe` a partir do commit `dc656959f58f2fd8bf5fb44d800fb03e1940bf25`. A versão do monorepo é `0.3.0`. O repositório estava limpo antes do build; os artefatos compilados alterados pelo compilador foram restaurados ao commit-base antes da implementação.

A aplicação existente é um monorepo Node.js/TypeScript com API Express, frontend React/Vite, PostgreSQL, migrations aditivas, autenticação JWT com sessões revogáveis, RBAC, carteira/ledger, Asaas, webhook idempotente, provider mock, adapter veicular oficial configurável, normalizador BDRP, histórico, auditoria e painel administrativo. A estratégia desta branch é aditiva: preservar os quatro produtos legados (`BASIC`, `DEBTS`, `COMPLETE`, `PREMIUM`), as rotas atuais e os contratos existentes.

## Baseline executado

| Verificação | Resultado inicial | Evidência |
| --- | --- | --- |
| Instalação limpa | Passou | `npm ci`, 320 pacotes adicionados, 0 vulnerabilidades |
| Build | Passou | `npm run build` compilou API e frontend |
| Testes | Passou | 3 testes unitários existentes, todos verdes |
| Branch | Passou | `feat/funil-consultas-fipe` |
| Commit-base | Registrado | `dc656959f58f2fd8bf5fb44d800fb03e1940bf25` |
| Versão | Registrada | `0.3.0` |
| Docker build | Bloqueado no sandbox | daemon Docker indisponível; deve ser executado no CI/Coolify |
| Backup/migrations/health/smoke integrado | Não executado no sandbox | não havia conexão PostgreSQL/ambiente de execução configurado nesta sessão; o roteiro permanece obrigatório no ambiente com banco |

## Matriz de implementação

| Requisito | Já existe | Parcial | Precisa adicionar | Arquivos envolvidos |
| --- | --- | --- | --- | --- |
| Login/cadastro | Sim | — | — | `apps/api/src/server.ts`, `apps/web/src/main.tsx` |
| Créditos/carteira | Sim | — | consulta FIPE com custo zero sem débito | `server.ts`, `schema.ts`, `migrations.ts` |
| Asaas | Sim | — | — | `server.ts`, `payments/asaas.ts` |
| Consulta veicular legada | Sim | adapter único | seletor por produto/provider sem alterar BDRP | `types.ts`, `providers/*`, `normalizer.ts`, `server.ts` |
| FIPE | Não | — | provider primário/secundário, cache, rate limit, normalização e rota pública | `config.ts`, `providers/fipe*`, `normalizer.ts`, `migrations.ts`, `server.ts` |
| Histórico | Sim | — | snapshots FIPE e atualização versionada | `server.ts`, `schema.ts`, `migrations.ts` |
| PDF | Não | exportação JSON | PDF server-side, HTML de impressão e código de validação | `server.ts`, `query_exports`, frontend |
| Produtos | Sim | preço/custo/feature já existem | metadados de fonte, cobertura, status e produtos progressivos sem apagar legados | `migrations.ts`, `server.ts`, frontend |
| Funil | Não | telas existentes reutilizáveis | seleção hierárquica, upsell educativo, eventos e CTA progressivo | `main.tsx`, `server.ts`, `migrations.ts`, `styles.css` |
| Painel administrativo | Sim | overview sem funil/provider health | métricas de FIPE, PDF, conversão e disponibilidade | `server.ts`, `main.tsx`, `migrations.ts` |

## Decisões de compatibilidade

A consulta gratuita FIPE será uma rota própria e não passará pelo débito de créditos nem pela rota legada de placa. A FIPE não identifica oficialmente um veículo apenas pela placa; por isso o fluxo utiliza tipo, marca, modelo, ano e combustível, aceitando placa apenas como anotação opcional quando o relatório for salvo por usuário autenticado.

O provider primário usa a API pública documentada `fipe.parallelum.com.br/api/v2`, com token exclusivamente no backend. O fallback usa a BrasilAPI documentada. A feature permanece desligada por padrão, e sem endpoint/credencial ativa o sistema não oferece um resultado fictício. O código também registra a referência mensal devolvida pela fonte, o horário, o provider e um hash de validação.

Relatórios legados continuam sendo lidos pelo normalizador BDRP e exportados em JSON pela rota atual. Os documentos FIPE terão rotas novas e estados próprios; nenhuma consulta histórica será reprocessada.

## Rollback

O rollback de aplicação consiste em reverter os commits desta branch. As migrations são somente `CREATE`, `ALTER ... ADD COLUMN IF NOT EXISTS`, índices, inserts/upserts de catálogo e não possuem `DROP`, truncamento ou alteração destrutiva. Se uma migration já tiver sido aplicada, o código antigo continua compatível com as novas colunas/tabelas; a desativação operacional é feita pelas flags.

## Implementação final e comparação pós-mudança

A branch agora contém um adapter FIPE independente com Parallelum/FIPE API v2 como provider primário e BrasilAPI como fallback documentado, incluindo timeout, cache até a virada mensal, quota diária, normalização de moeda brasileira e rejeição de respostas sem valor, código ou referência. A consulta pública usa seleção hierárquica de tipo, marca, modelo e ano; placa permanece opcional e não é usada para presumir identificação cadastral.

O resultado FIPE possui snapshot imutável, código de documento, hash, referência mensal, fonte, impressão HTML, PDF server-side e validação pública. O salvamento no histórico requer autenticação e cria um documento próprio, sem converter nem alterar históricos BDRP existentes. Falhas de telemetria são fail-open para não invalidar uma resposta válida.

O catálogo progressivo preserva `BASIC`, `DEBTS`, `COMPLETE` e `PREMIUM`, mantém o produto `FIPE_FREE` em custo zero e adiciona, de forma aditiva, `CADASTRAL` e `RESTRICTIONS` como produtos em breve. A rota pública `/fipe/offers` expõe nome, descrição, créditos, cobertura, fonte e status; produtos pagos só aparecem como continuáveis quando há regra de fonte ativa. A interface exibe as próximas etapas de forma educativa, sem urgência artificial, e desabilita itens sem cobertura contratada.

| Verificação final | Resultado | Observação |
| --- | --- | --- |
| Build da API e frontend | Passou | `npm run build` verde após a última alteração |
| Suíte unitária | Passou | 5 testes verdes, incluindo normalização FIPE e rejeição de resposta inválida |
| Integridade de diff | Passou | `git diff --check` sem erros |
| Docker build | Não executado | Docker/daemon indisponível no sandbox; permanece obrigatório no CI/Coolify |
| PostgreSQL, migrations aplicadas e smoke integrado | Não executado | sem banco/configuração operacional nesta sessão |
| Segredos | Preservados | somente variáveis de ambiente documentadas; nenhum token adicionado ao código |

O rollback permanece simples: reverter o commit da branch e, operacionalmente, desligar `FEATURE_FREE_FIPE` ou as regras de fonte. Não foram usados `DROP`, truncamento, scraping, dados fictícios ou alteração destrutiva de tabelas legadas.

## Referências externas consultadas

A documentação do provider primário e do fallback está registrada em [`docs/fipe-provider-research.md`](docs/fipe-provider-research.md). Esses documentos foram consultados antes da implementação e o código mantém as fontes configuráveis, sem acoplar o sistema a um único fornecedor.
