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
