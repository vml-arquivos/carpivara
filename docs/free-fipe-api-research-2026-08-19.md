# Pesquisa de API FIPE gratuita — 2026-08-19

## Deivid Fortuna / Parallelum

A documentação pública informa que a API REST oferece 500 requisições gratuitas não autenticadas por dia; um token gratuito em fipe.online eleva o limite anunciado para 1.000 requisições por dia. Os endpoints públicos usam `https://parallelum.com.br/fipe/api/v1`, com rotas para marcas, modelos, anos e valor FIPE. A documentação não oferece consulta por placa: a busca é por tipo de veículo, marca, modelo e ano.

Fonte: https://deividfortuna.github.io/fipe/

## fipe.api.br

A página pública anuncia plano gratuito de 1.000 consultas por dia, sem cartão para começar, com preços do mês vigente e histórico de três meses. A autenticação anunciada é por Bearer API key gerada no dashboard. Os endpoints v2 usam `https://fipe.api.br/api/v2`, incluindo marcas, modelos, anos e valor. Também não há endpoint de placa; o serviço é FIPE por catálogo.

Fonte: https://fipe.api.br/

## Conclusão provisória

Para FIPE manual gratuita, a alternativa pública mais simples e verificável é a API de Deivid Fortuna/Parallelum, que funciona sem token até o limite diário anunciado. Para o Carpivara, a consulta por placa continua exigindo primeiro uma fonte de identificação veicular; a API FIPE gratuita, isoladamente, não consegue transformar placa em marca/modelo/ano.

## Validação ao vivo dos endpoints

Em 2026-08-19, `https://parallelum.com.br/fipe/api/v1/carros/marcas`, `/marcas/59/modelos` e `/marcas/59/modelos/5940/anos` responderam JSON corretamente. A rota v1 `/references` respondeu 404 (`Cannot GET /api/v1/references`), portanto a v1 gratuita não expõe referências mensais pelo mesmo contrato do provider atual. A rota `https://fipe.parallelum.com.br/api/v2/references` respondeu 200 com referências mensais, incluindo `agosto/2026`, mostrando que a v2 é um contrato diferente e deve ser tratada separadamente.

A substituição segura deve manter o provider v2 atual se ele já estiver funcionando em produção ou criar um modo v1 explícito, com referência corrente sintetizada/derivada e rotas v1, sem apontar cegamente a base v1 para o provider v2.
