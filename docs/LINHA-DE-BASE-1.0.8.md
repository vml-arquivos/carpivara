# Linha de base 1.0.8 (registrada antes de qualquer edição)

Referência para comparar a atualização incremental. Nada neste arquivo foi alterado pelo código: é o retrato da revisão de partida.

## Revisão

- Branch de partida: `main`
- Commit: `1b566a5117bdaf5fb882b42a049a4e1669499525` ("versão 1.0.8", 18/11/2026 06:35 -0300)
- Branch pré-existente: `feat/funil-consultas-fipe`
- Árvore de trabalho: limpa na clonagem, com `disabled-provider.diff` versionado na raiz
- Pacotes: `bl-buscar` 1.0.8 (raiz), `@blbuscar/api` 0.1.0, `@blbuscar/web` 1.0.8
- Suíte: 147 arquivos em `apps/api/test`, runner nativo do Node, `--test-concurrency=1`

## Ambiente de execução da medição

- Node v22.23.4, Linux arm64
- PostgreSQL 16.15 local (instalado para esta medição), `TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:5432/blbuscar_test`
- Sem Docker no ambiente. O `TESTING.md` prescreve `postgres:16-alpine` em Docker; a mesma versão de servidor foi usada localmente.
- Build: `npm ci` ok, `npm run build` ok (API + web + PWA, 114 entradas de precache)

## Resultados da revisão de partida

Medição com banco real, 13min33s, log completo em `../baseline-db.log` (arquivo fora do repositório, preservado no ambiente):

| Métrica | Valor |
|---|---|
| testes | 1024 |
| passaram | 1014 |
| falharam | 10 |
| ignorados | 0 |

Medição sem banco disponível (log `../baseline-1b566a51.log`), útil para separar o que é ambiente do que é código: 488 testes, 482 passaram, 5 falharam, 1 ignorado. A diferença entre as duas medições é cobertura habilitada pelo PostgreSQL, não regressão.

## As 10 falhas preexistentes

Nenhuma delas foi introduzida por esta atualização. Todas pré-existem à primeira linha editada.

| Arquivo | Teste | Natureza observada |
|---|---|---|
| `apps/api/test/fipe-report.test.mjs` | mantém fallback BL Buscar quando a organização não fornece marca, com as cores da marca | expecting `#0B7A43` (paleta antiga) contra o HTML que já renderiza a paleta atual (`#152D26`/`#548674`): teste defasado em relação à migração de cor |
| `apps/api/test/growth-funnel.test.mjs` | HTML entregue pelo servidor possui SEO específico por rota | regex pede `BL Buscar` no `<title>`, e o produto entrega `BL Buscarr` |
| `apps/api/test/seo-financiamento-bancos.test.mjs` | banco com taxa ganha página própria, com título, taxa real, exemplo e perguntas no HTML | página por banco de financiamento não gera o HTML esperado |
| `apps/api/test/seo-financiamento-bancos.test.mjs` | índice `/financiamento` lista os bancos; endereço que não existe dá 404 | idem, mesmo arquivo |
| `apps/api/test/seo-pages.test.mjs` | texto de fábrica: toda página tem H1 até 30 caracteres, palavra-chave e perguntas | 30 páginas com conteúdo pronto contra 31 esperadas: sitemap e registro de conteúdo desalinhados |
| `apps/api/test/seo-pages.test.mjs` | migração deixa as páginas principais prontas | mesmo desalinhamento de conteúdo de fábrica |
| `apps/api/test/seo-pages.test.mjs` | o HTML inicial já traz título, descrição, texto, perguntas e dados estruturados | idem |
| `apps/api/test/seo-pages.test.mjs` | painel: lista com nota, edita, reflete no HTML e no sitemap, exclui da indexação e restaura o padrão | idem |
| `apps/api/test/seo-publicacao.test.mjs` | título, descrição, canonical e indexação do HTML conferem com o painel; nada vaza de uma rota para outra | publicação de SEO por rota |
| `apps/api/test/seo-simulador.test.mjs` | o conteúdo de fábrica tem o título, a descrição e as 3 perguntas novas | `BL Buscarr` contra `BL Buscar` esperado |

Leitura fria: seis delas giram em torno de texto de SEO e do nome da marca, duas no nome da marca embutido em regex, e duas no conteúdo de fábrica das páginas de banco de financiamento. Nada aponta para o motor de consulta, cobrança, provedores ou PDF.

## Fluxos críticos verificados na partida

Comportamento observado por inspeção de código e pelos próprios testes da suíte, sem alteração:

- Compra e débito: transação única com `wallets FOR UPDATE` e `pg_advisory_xact_lock`, índice único de idempotência por usuário (`uq_vehicle_queries_user_idempotency`), bloqueio de consulta idêntica em `PROCESSING`. `Idempotency-Key` é opcional e é anulada no estorno.
- Timeout: estornado imediatamente no `catch` de `finish()`, e o sweeper de `QUERY_STUCK_MINUTES` repete o estorno; não existe estado de cobrança indeterminada nem reconciliação com o fornecedor de dados. `provider_query_id` é gravado e nunca relido.
- Reabertura de relatório: `GET /queries/:id/report/pdf`, a rota de impressão e o dossiê chamam o enriquecimento com `ensureLienDetail`, que executa `fetchSupplement('gravame')`, ou seja, **gastam uma chamada paga ao abrir o PDF**. As rotas da equipe interna já usam `enrich=false`.
- Troca de fornecedor: resolvida no boot por variável de ambiente (`providers/index.ts`), sem leitura do banco; a tabela `data_providers` existe no schema e não é consultada em lugar nenhum; a tela de Integrações é somente leitura e manda reiniciar o aplicativo.
- Cobertura contratual: campo ausente vira `NOT_PROVIDED` e o veredito não sai `CLEAR` sem cobertura, que é a política honesta já implementada.
- Cache por placa: existe, envolve apenas a consulta por placa do provedor Credify, e a chave não inclui provedor nem versão do contrato, então duas fontes ativas compartilhariam o mesmo cache.

## Condições para liberar

A atualização só é entregável se, ao final: build ok; os 1014 testes que passavam continuarem passando; as 10 falhas acima permanecerem exatamente as mesmas, ou diminuírem, nunca aumentarem; os fluxos de ponta a ponta (compra, consulta, resultado, PDF, estorno, troca de fornecedor) tiverem evidência em homologação com PostgreSQL real; e existir procedimento escrito de desativação de fornecedor e de retorno à configuração anterior.
