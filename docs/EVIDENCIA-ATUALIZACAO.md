# Evidência da atualização e caminho de retorno

Documento exigido pelos itens 1, 5 e 6 da diretiva de zero regressão. Escrito sobre o branch `feat/controle-fornecedores-e-custo`.

## Revisão de partida e ambiente

- Partida: `main` em `1b566a5117bdaf5fb882b42a049a4e1669499525` ("versão 1.0.8").
- Branches de trabalho: `feat/controle-fornecedores-e-custo` (entrega), `wip/estados-veiculares` (Fase 2 preservada), `wip/custo-por-etapa` (Fase 3 preservada).
- Ambiente de medição: Node 22.23.4, Linux arm64, PostgreSQL 16.15 local (instalado para esta atualização, porque o ambiente não tinha Docker nem `psql`), `TEST_DATABASE_URL` apontando para `blbuscar_test`.
- Regra de medição que vale para todo o projeto: **a suíte precisa de banco recém-criado**. Rodar duas corridas seguidas no mesmo `blbuscar_test` produz falhas falsas em `content`, `data-reset`, `partner-convites` e `basica-gravame-leilao`, por resíduo de linhas, e não por código. Foi o que aconteceu numa corrida intermediária que marcou 17 falhas e, com banco recriado, voltou exatamente a 10. Antes de qualquer comparação:

```bash
sudo -u postgres psql -c "DROP DATABASE IF EXISTS blbuscar_test;" -c "CREATE DATABASE blbuscar_test;"
export TEST_DATABASE_URL='postgresql://postgres:test@127.0.0.1:5432/blbuscar_test'
npm run build && node --test --test-concurrency=1 apps/api/test/*.test.mjs
```

- Falhas preexistentes da partida, com banco limpo: 10 em 1024 (detalhe em `LINHA-DE-BASE-1.0.8.md`). Todas em marca/SEO/conteúdo de fábrica, nenhuma em consulta, cobrança, provedor ou PDF.

## O que foi entregue e certificado

Commit `c7d8594` — reabrir relatório deixou de disparar consulta paga.

- `vehicleReportForQuery` passou a ter o enriquecimento pago como opt-in (`enrichPaidLien = false`), com o enriquecimento gratuito de FIPE mantido na leitura comum.
- As leituras que hoje não cobram: `GET /queries/:id/report`, `GET /queries/:id/report/pdf`, `GET /queries/:id/report/print`, dossiê, `POST /queries/:id/report/dispute`, `POST /queries/:id/ad-check` e `GET /api/v1/vehicles/:id/pdf`.
- A completude de gravame continua existindo, agora só por ação administrativa explícita e auditada: `POST /admin/queries/:id/refresh-gravame` (`adminQueries.ts:74`) e `POST /admin/queries/refresh-gravame` em lote (`adminQueries.ts:35`), ambas exigindo `VIEW_SENSITIVE_DATA`.

Certificação desta entrega:

| Medição | Resultado |
|---|---|
| `npm run build` (API + web + PWA) | ok |
| Suíte completa com banco limpo (Fase 1) | 1033 testes, 1023 passaram, 10 falharam |
| Suíte completa com banco limpo (Fase estados) | 1058 testes, 1048 passaram, 10 falharam |
| Comparação com a partida | as mesmas 10 falhas preexistentes, identificadas uma a uma; nenhuma nova |
| Testes novos | `leitura-nao-cobra.test.mjs` (9) e `report-refresh.test.mjs` convertido (4), 13 de 13 passando isolados |

A prova de que a leitura não cobra é por contagem real, não por leitura de código: os dois arquivos sobem um servidor com `DATA_PROVIDER=real` e `VEHICLE_API_PROVIDER=credify` apontando para uma Credify falsa que registra cada URL recebida, e a consulta legada é verificada como elegível ao backfill com o mesmo predicado SQL do próprio `lienRefresh`. Dezoito requisições de leitura terminaram com contador de `/gravame` igual a zero; na rota administrativa o contador marcou exatamente uma chamada por clique e a reabertura posterior permaneceu em uma. A entrega em si não mudou: 200, PDF com mais de mil bytes e `%PDF-`, mesmo código de validação, mesmo produto, e o JSON de `/report` idêntico entre servir com fonte paga e servir sem fonte paga.

## O que está preservado e ainda não liberável

~~`wip/estados-veiculares`~~ **concluído e mesclado** (`bfcc115` → merge `26b0860`): honestidade de estados de fonte, os doze pontos da auditoria.

- Fez o mais difícil: criou vocabulário único em `report/layers.ts` (`OCCURRENCE`, `CONFIRMED_NONE`, `NO_RETURN`, `UNAVAILABLE`, `OUT_OF_SCOPE`) e propagou por `gravame.ts`, `vehicleTotal.ts`, `normalizeV2.ts`, `advice.ts`, `leilao.ts`, `analiseLeilao.ts`, `enrichmentExtras.ts`, `anycarProvider.ts` e `credifyProvider.ts`. Eliminou `DEFAULT_CLEAR` do normalizador, tirou "não informado" da lista de texto limpo, fez 404/410 virar indisponibilidade em vez de ausência, e separou "fora de cobertura" de "sem retorno" no guia de leitura.
- Certificação final desta fatia: `estados-veicular.test.mjs` em 24 de 24, e suíte inteira com banco limpo em **1058 testes, 1048 passaram, 10 falharam — exatamente as 10 preexistentes, sem nenhuma nova e sem nenhuma perdida**.
- Correção que destravou quase tudo (`c447316`): `NO_RETURN_TEXT` e `CONFIRMED_NONE_TEXT` tinham a alternação inteira dentro de `^(…)$`, então exigiam igualdade total e "NAO INFORMADO" não casava com o prefixo "NAO INFORMAD". Frases passaram a ser reconhecidas por prefixo e só códigos curtos (`N`, `NAO`, `NADA`, `0`, `N/D`) exigem igualdade.
- Quatro falhas que a correção expôs e que foram tratadas uma a uma: peça da Credify respondendo "não encontrado" derrubava a consulta em `DATA_PROVIDER_INCOMPLETE`; a AnyCar sem confirmação matava a consulta inteira em vez de degradar para parcial; o predicado de elegibilidade do backfill de gravame ficou cego para consultas legadas; e `RN_MULTAS` sumia em vez de sair como fora de cobertura.
- Duas expectativas de teste foram alteradas com justificativa escrita no próprio arquivo, ambas porque o teste codificava a confusão proibida pela diretiva: `credify-guard`/`credify-provider` liam HTTP 404 como "placa não encontrada" (`NOT_FOUND`), e `fontes-por-produto` lia `status:true` sem lista como ausência confirmada. O que se mede continua medindo o mesmo (teto de custo, degradação parcial); só o estado atribuído à fonte mudou. Em `contrato-apis`, o caso de "não encontrado" passou a usar `CODIGO=2` no corpo, como a Credify publica, e foi acrescentado um caso novo afirmando que HTTP 404 derruba a consulta em vez de virar nada-consta — a cobertura aumentou.

`wip/custo-por-etapa` (commit `99f9985`) — custo por etapa, teto e travas persistentes.

- Só a fundação: `migrations.custo.ts`, `lib/queryCosts.ts`, trecho de `config.ts` e reescrita de `providerGuard.ts` para trava em banco. Build quebrado nesse commit, sem gravação de custo nos adaptadores, sem teto aplicado, sem leitura administrativa, sem testes. Não entra.

Também ficou registrado que a Fase 1 não alterou custo, preço, cobrança de compra, URLs nem contrato de saída, e que nenhuma variável de ambiente nova foi criada até aqui.

## Caminho de retorno

- Desativar a entrega atual: reverter o commit `c7d8594` (`git revert --no-edit c7d8594`) devolve o comportamento antigo, inclusive a reabertura pagante. Não há migração de banco envolvida, então reverter não precisa de operação de dados.
- Voltar à versão estável inteira: `git checkout 1b566a5` (partida) ou `git checkout main`. Nenhum dado é afetado; não houve mudança de schema.
- Reativar a completude de gravame de forma controlada sem código: usar a rota administrativa individual ou em lote, que já existe, com auditoria `QUERY_GRAVAME_REFRESHED`.
- Os dois wips têm rollback trivial por estarem em branches não mesclados: `git checkout feat/controle-fornecedores-e-custo` e abandoná-los, ou mesclar depois de verdes.

## Bloqueios reais, que dependem de fora do código

A diretiva manda registrar o bloqueio em vez de fingir validação. Estes são os bloqueios:

1. Credenciais da Credify do BL Buscar. `PENDENCIAS-PRODUCAO.md` diz que ficam nas variáveis do Coolify, e a auditoria confirmou que sem elas nada de Credify foi validado com consulta real: IP autorizado, plano, finalidades de consumo, e o `IdConsulta` de cada produto.
2. Preço contratado por chamada. Dois endpoints usados nos pacotes maiores, `/veiculoproprietarioplaca` e `/farolleilao`, não têm preço no repositório. Enquanto isso, o cálculo de "rota de menor custo elegível" fica incompleto e o custo dos pacotes Básica e Premium está subestimado.
3. Orçamento autorizado para consultas reais de teste. Sem isso, a validação de ponta a ponta em homologação fica em simulação, e a diretiva exige separar claramente o que foi comprovado por simulação, homologação e consulta real.
4. Configuração do painel de fontes hoje é parcialmente travada pelo contrato em código (`productContract.ts`), e a tabela `query_source_rules` usada pela regra de "vendável" não é escrita pelo painel, então validação de cobertura no salvar precisa vir junto com a fase do registry, não antes.
5. As 10 falhas preexistentes giram em torno de nome de marca em regex de SEO e de páginas de banco de financiamento, e mexer nelas é decisão editorial (o produto se chama "BL Buscarr" nas telas e "BL Buscar" em textos antigos), não técnica. Precisam de uma decisão sua antes de qualquer correção.

## Próxima sequência, em fatias pequenas e certificadas

Ordem recomendada, cada fatia com build + testes em banco limpo antes de mesclar:

1. Estados de fonte: corrigir a ancoragem do `classifyText` e percorrer as 9 falhas conhecidas. É pré-requisito de honestidade para qualquer roteador.
2. Custo por etapa: terminar migração, gravar nos adaptadores, aplicar teto, expor leitura administrativa.
3. Registry de fornecedores em banco com troca em runtime pelo painel, mantendo o provedor atual como padrão até ativação do administrador, e validação de cobertura no salvar.
4. Roteador por menor custo elegível com prévia de rota, cobertura e custo antes de salvar, histórico e restauração.
5. Idempotência por chamada paga, estado de cobrança indeterminada e reconciliação por identificador externo.
6. Identidade visual em telas críticas, PDF e página de configuração, sem mudar campos nem operação.

As quatro primeiras não precisam de credencial para serem escritas; a validação real delas precisa.
