# Pesquisa de provider FIPE

## Fonte consultada

[FIPE API v2 — documentação OpenAPI](https://deividfortuna.github.io/fipe/v2/)

A documentação identifica uma API pública de consulta da Tabela FIPE, com dados de carros, motos e caminhões, atualizados mensalmente, e expõe o host `https://fipe.parallelum.com.br/api/v2`. A própria documentação informa limite de 500 requisições não autenticadas por dia e até 1.000 por dia com token gratuito, além do header opcional `X-Subscription-Token`.

## Contratos observados

A API documenta `GET /references` para referências mensais, `GET /{vehicleType}/brands?reference={code}` para marcas e `GET /{vehicleType}/brands/{brandId}/models?reference={code}` para modelos. A documentação também apresenta endpoints para anos e consulta por código FIPE. Os tipos de veículo documentados são `cars`, `motorcycles` e `trucks`.

## Decisão de implementação

O Carpivara deverá encapsular o provider atrás de uma interface própria, sem expor o contrato externo ao frontend. O token será somente server-side, por variável de ambiente. A ativação deverá permanecer protegida por feature flag e a consulta deverá registrar provider, referência mensal, timestamp e estado de disponibilidade. A implementação não deve afirmar que o dado é preço em tempo real; a linguagem do produto deve indicar valor FIPE vigente consultado agora, referente à tabela mensal retornada pela fonte.

## Observação de rollout

Como a fonte possui limites operacionais e o repositório ainda não possui contrato FIPE, o provider será adicionado de modo configurável, com cache persistente e fallback opcional. Nenhuma integração veicular real existente será substituída.

## Provider alternativo consultado

[BrasilAPI — documentação FIPE](https://brasilapi.com.br/docs)

A BrasilAPI documenta o fluxo hierárquico gratuito com referências em `GET /fipe/tabelas/v1`, marcas em `GET /fipe/marcas/v1/{vehicleType}`, modelos em `GET /fipe/veiculos/v1/{vehicleType}/{makerCode}`, anos em `GET /fipe/anos/v1/{vehicleType}/{makerCode}/{modelCode}` e detalhes/preço em `GET /fipe/detalhes/v1/{vehicleType}/{makerCode}/{modelCode}/{yearCode}`. Também documenta consulta direta por código em `GET /fipe/preco/v1/{fipeCode}`. Os tipos públicos são `caminhoes`, `carros` e `motos`; a resposta de detalhe inclui `valor`, `marca`, `modelo`, `anoModelo`, `combustivel`, `codigoFipe`, `mesReferencia`, `tipoVeiculo`, `siglaCombustivel` e `dataConsulta`.

A BrasilAPI é adequada como adapter alternativo para a consulta gratuita de preço quando o código FIPE já estiver disponível ou quando o fluxo de seleção hierárquica for implementado. O adapter deve normalizar dinheiro em centavos, preservar a referência mensal e não misturar preço FIPE com dados de placa/proprietário.
