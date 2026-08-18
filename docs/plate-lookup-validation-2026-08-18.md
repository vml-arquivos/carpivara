# Validação da consulta FIPE por placa — 2026-08-18

A rota pública `POST /api/fipe/quote` aceita o payload somente com `plate` e o frontend já oferece esse fluxo. A tentativa em produção com a placa de contrato `TST0A00` retornou HTTP 422 com código público neutro `FIPE_PLATE_DATA_INVALID`.

A placa `TST0A00` pertence à carga de sandbox do projeto, que só é inserida quando `SANDBOX_SEED_ENABLED=true`; não deve ser habilitada em produção porque contém dados fictícios. O adaptador de produção usa `DATA_PROVIDER=real` e exige um endpoint veicular autorizado para resolver placa em marca, modelo e ano. Sem esse contrato/credencial, não é possível inferir legitimamente o veículo a partir de uma placa somente com a tabela FIPE.

A implementação mantém os detalhes do provedor fora das respostas públicas. O próximo ajuste seguro é converter a ausência de provedor/dados em estado neutro de indisponibilidade e habilitar a consulta real somente após o endpoint veicular autorizado estar presente no ambiente de produção; não usar dados fictícios como fallback público.

Nenhum segredo, token, senha ou valor de variável sensível foi registrado neste arquivo.

## Evidência funcional já publicada

- Cotação manual FIPE em produção: funcionando.
- Resposta pública da cotação: sem `provider` e sem `source`.
- Ofertas públicas: sem `provider`, `source` e `coverage`.
- Impressão e PDF anônimos: bloqueados com HTTP 401.
- Validação pública do relatório: funcionando sem provedor exposto.
- Consulta somente por placa: contrato implementado, mas dependente de provedor veicular autorizado para funcionar com placas reais.

## Observação

O texto público permanece neutro e não revela APIs, fontes, nomes de fornecedores ou detalhes operacionais.


## Inspeção do ambiente

A interface de variáveis do Coolify foi aberta e filtrada por `DATA_PROVIDER`; a lista visível permaneceu na primeira página enquanto carregava. Nenhum valor secreto foi aberto, copiado ou registrado. A evidência funcional da rota continua sendo a resposta 422 neutra para a placa de sandbox em produção.


A inspeção do Coolify confirmou que existe uma variável `DATA_PROVIDER` em produção, marcada como variável de runtime. O valor não foi aberto nem registrado para preservar segredo operacional. A presença isolada da variável não confirma que o modo real e o endpoint de placa estejam configurados.


A edição somente para leitura no Coolify confirmou que `DATA_PROVIDER=real` em produção. O campo continua protegido; nenhum token, URL, login ou senha foi exposto. A falha da placa de sandbox, portanto, é esperada para uma placa fictícia não cadastrada no provedor real e não comprova falha para uma placa real autorizada.

## Reprodução em produção após o redeploy

Em 2026-08-18, uma requisição pública `POST https://carpivara.casadf.com.br/api/fipe/quote` com a placa de teste `JIW6972` retornou `HTTP 502` com `content-type: text/plain; charset=UTF-8` e resposta não JSON, confirmando que a dependência `VEHICLE_API_QUERY_PATH` ainda impede a chamada veicular no ambiente público. O bundle entregue por `https://carpivara.casadf.com.br/fipe` contém o fallback textual `Não foi possível concluir a consulta agora`, portanto o código frontend corrigido está sendo servido.

A tela capturada pelo usuário exibe `O limite diário de consultas FIPE foi atingido. Tente novamente amanhã.`. No código, `POST /api/fipe/quote` reserva a cota antes de resolver a placa, usando `FIPE_GUEST_DAILY_LIMIT`; o default é 3 consultas por IP/dia e o contador é persistido em `fipe_usage`. A página de variáveis do Coolify foi aberta e filtrada pelo nome `FIPE_GUEST_DAILY_LIMIT`; o valor não foi exposto neste registro. O bloqueio observado é uma resposta 429 legítima para o IP do navegador, distinta do 502 que ocorre para IPs ainda não esgotados quando o caminho veicular permanece ausente.

## Limite diário

A filtragem de variáveis no Coolify não encontrou `FIPE_GUEST_DAILY_LIMIT`, confirmando que o processo estava usando o default de 3 consultas por IP/dia. O formulário para inclusão de `FIPE_GUEST_DAILY_LIMIT=10` foi aberto e preenchido na interface; a confirmação visual do salvamento ainda depende da conclusão do formulário.

A variável `FIPE_GUEST_DAILY_LIMIT` foi criada no Coolify com valor `10`; após a submissão, o modal fechou e a lista de variáveis voltou a aparecer. Nenhum valor secreto foi aberto ou registrado.

O Git Source do Coolify foi atualizado com sucesso para o commit `1ccd334`; a interface confirmou `Application source updated`. O redeploy ainda será iniciado separadamente.

O redeploy do commit `1ccd334` foi iniciado no Coolify com o identificador `rpmle9g6mxgtvwgh9dx5clw9`; o deployment aparece como `In progress`. A variável de limite diário já estava salva antes da execução.

O redeploy `rpmle9g6mxgtvwgh9dx5clw9` falhou antes do build porque o Git Source recebeu o SHA abreviado `1ccd334`, que o clone raso do Coolify não conseguiu resolver. A aplicação anterior permaneceu em execução; nenhuma troca parcial de container foi observada. A correção é atualizar o pin para o SHA completo e repetir o redeploy.

Após a falha por SHA abreviado, o Git Source foi corrigido para `1ccd334cf53c66c54e9e1843c987c7e5cb3bafdc`; o Coolify confirmou novamente `Application source updated`.

O segundo redeploy foi iniciado com o SHA completo; o Coolify criou o deployment `iojf399gtgnokxi2q7rjsroe`, inicialmente em `In progress`. O deployment anterior com SHA abreviado permanece `Failed` e não alterou o container ativo.

O deployment `iojf399gtgnokxi2q7rjsroe` avançou para o build e não repetiu a falha de resolução do commit; permanece `In progress` durante a instalação e compilação.

Na verificação aos 55 segundos, o deployment `iojf399gtgnokxi2q7rjsroe` ainda estava `In progress`, com build em execução e sem erro de checkout; o container anterior continuava preservado enquanto o healthcheck não concluía.

A imagem Docker do deployment `iojf399gtgnokxi2q7rjsroe` foi concluída; a interface mostra a etapa de criação das variáveis de runtime e remoção dos containers antigos. O estado ainda aparece `In progress`, portanto o smoke test público ainda não foi executado.

O deployment `iojf399gtgnokxi2q7rjsroe` concluiu com `Success`, duração aproximada de 1m48s, usando o commit `1ccd334` com a correção de devolução de cota. O container foi trocado e a aplicação voltou a `Running`.

## Reprodução após o redeploy da correção de cota

A variável de limite diário foi persistida no Coolify e o deployment `iojf399gtgnokxi2q7rjsroe` concluiu com sucesso usando o commit `1ccd334`. A requisição pública `POST /api/fipe/quote` com a placa `JIW6972` deixou de retornar o bloqueio `FIPE_DAILY_LIMIT`, mas o domínio público respondeu `502` com `Content-Type: text/plain; charset=UTF-8` e corpo sanitizado `error code: 502`. Isso confirma que a correção da cota foi publicada, enquanto o proxy/CDN continua gerando uma resposta não-JSON para a falha de upstream; o frontend deve tratar esse formato, e a causa de origem permanece a configuração ausente do caminho do provedor veicular (`VEHICLE_API_QUERY_PATH`). Nenhum token, login, senha ou URL completa do provedor foi registrado.

## Correção adicional do limite compartilhado

A implementação foi ajustada para usar `CF-Connecting-IP` quando o endereço é válido, com fallback para `req.ip`, e passou a usar o escopo versionado `v2:ip`. Isso evita reutilizar contadores criados com a chave anterior e reduz o risco de compartilhar a cota entre visitantes quando a aplicação recebe tráfego por proxy reverso. Falhas de provedor continuam devolvendo a cota reservada, sem consumir a consulta gratuita. O build e os cinco testes existentes passaram localmente após a alteração. Nenhum segredo foi registrado.
