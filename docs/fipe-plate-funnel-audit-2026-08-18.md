# Auditoria do funil FIPE por placa — 2026-08-18

## Achados da tela

A tela pública apresenta corretamente a consulta FIPE como gratuita, mas o bloco superior usa apenas `R$ 0` e `sem cobrança`, sem uma chamada comercial explícita para `Consulta zero`. O formulário informa que a identificação é automática, porém o visitante não recebe uma confirmação visual da identificação completa do veículo antes da cotação. Após o resultado, o funil deve separar claramente duas decisões: continuar somente com a FIPE, que informa valor médio, ou avançar para a consulta completa, que deve ser apresentada como próxima etapa comercial.

A comunicação pública deve deixar explícito que a FIPE não verifica gravame, sinistro, roubo/furto, leilão, débitos ou restrições. Nenhuma fonte, provedor, API ou detalhe técnico deve aparecer para visitantes.

## Achados do contrato atual

A rota pública `POST /api/fipe/quote` aceita a placa e consulta o provedor veicular, mas a resolução atual utiliza a identificação normalizada apenas para encontrar marca, modelo e ano na tabela FIPE. A resposta pública retorna a cotação FIPE e blocos informativos, porém não carrega um objeto de identificação veicular completo.

A fábrica `makeFipeQuote` também reduz o resultado ao conjunto FIPE e não anexa os campos veiculares encontrados na consulta por placa. Por isso, a tela não consegue mostrar, de forma estruturada, placa, marca, modelo completo, anos de fabricação/modelo, cor, combustível, tipo, categoria, carroceria, município e UF quando esses dados estiverem disponíveis.

## Validação em produção

Uma chamada pública com a placa exibida no print (`JIW6972`) retornou HTTP 422 com mensagem neutra. O contrato atual pode ocultar se a causa foi ausência de dados compatíveis, falha de normalização ou seleção FIPE ambígua; o fluxo deve manter o resultado sem cotação quando a identificação não for assertiva e apresentar uma mensagem orientativa, nunca inventar ou aproximar um veículo.

## Critérios de aceite

A consulta só deve exibir valor FIPE quando a placa tiver identificação veicular suficiente e a seleção marca/modelo/ano tiver sido resolvida de forma não ambígua. O resultado deve exibir os dados de identificação disponíveis e os dados FIPE completos, sem metadados de fonte. O visitante deve poder escolher `Continuar só com a FIPE` ou `Tenha acesso à consulta completa`, com cadastro gratuito exigido para artefatos protegidos e encaminhamento comercial claro para produtos ativos.
