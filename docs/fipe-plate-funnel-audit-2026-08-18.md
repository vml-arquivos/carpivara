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

## Validação pública após o deployment a83be20

A tela pública `/fipe` carregou deslogada com o novo rótulo `Consulta zero`, a explicação das limitações documentais e as CTAs comerciais. Ao informar a placa `JIW6972` e enviar a consulta, a interface exibiu `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` em vez de retornar a identificação do veículo e a cotação FIPE. Portanto, a consulta por placa ainda não está validada como funcional em produção e o deployment não deve ser tratado como conclusão funcional até a causa do retorno HTML ser corrigida.

## Diagnóstico confirmado nos logs de runtime

As chamadas `POST /api/fipe/quote` com `JIW6972` chegaram ao backend e terminaram em aproximadamente `10ms` com status `502` e código interno `FIPE_PLATE_UNAVAILABLE`. O retorno HTML observado no navegador é a página de erro do proxy para esse status, que o frontend tentou interpretar como JSON. A aplicação não inventou uma cotação, o que é correto do ponto de vista de integridade, mas o contrato público precisa converter esse erro em JSON neutro e tratável pela interface, além de resolver a dependência de identificação veicular para placas reais antes de prometer uma consulta assertiva.

Fonte operacional: logs de runtime do Coolify — https://coolifycar.casadf.com.br/project/e5fnmvitmxb24zn8ae1ygwso/environment/u3vo7bqp4kwer0oty3bxgrff/application/nypsnvexr5rnon2pfpx22zwp/logs

## Diagnóstico posterior do fluxo público

A validação foi realizada em produção em https://carpivara.casadf.com.br/fipe após o deployment do commit `a83be20`. O runtime respondeu healthcheck 200 e a aplicação carregou, mas a consulta pública pela placa `JIW6972` não produziu uma cotação válida. Os logs de runtime confirmaram que a requisição chegou ao backend e foi encerrada explicitamente com `FIPE_PLATE_UNAVAILABLE`; portanto, não se deve tratar o fluxo como aprovado nem inventar uma cotação aproximada.

O código atual já possui o middleware Express que serializa `AppError` em JSON, mas o frontend assume `response.json()` para qualquer resposta e pode mostrar `Unexpected token '<'` se o proxy devolver uma página HTML em um erro 502. O adaptador oficial usa `VEHICLE_API_BASE_URL`, `VEHICLE_API_QUERY_PATH` e autenticação configurada no ambiente, sem registrar valores. O formato efetivo do provedor ainda precisa ser confirmado de forma sanitizada para completar o mapeamento em `normalizeBdrp`.

Nenhum token, senha, hash, chassi, RENAVAM ou resposta integral do provedor foi registrado neste documento.

## Configuração operacional confirmada

Durante a inspeção sanitizada do terminal de produção, a execução do comando de diagnóstico do adaptador falhou ao avaliar `process.env.VEHICLE_API_QUERY_PATH.replaceAll(...)`, indicando que `VEHICLE_API_QUERY_PATH` está ausente ou vazio no processo atual. O adaptador `OfficialVehicleProvider` trata a ausência de `VEHICLE_API_BASE_URL` ou `VEHICLE_API_QUERY_PATH` como `DATA_PROVIDER_NOT_CONFIGURED`, que a rota pública converte em `FIPE_PLATE_UNAVAILABLE`.

Esse achado explica a falha de identificação da placa em produção: o problema não é uma seleção FIPE aproximada nem deve ser resolvido com dados fictícios. A correção precisa configurar o caminho contratado do serviço veicular, ou ajustar o adaptador para a configuração efetivamente fornecida, e somente depois validar uma placa real. Nenhum valor de URL, token, login ou senha foi exposto ou registrado.

A lista filtrada de variáveis de produção no Coolify mostrou `VEHICLE_API_BASE_URL`, `VEHICLE_API_LOGIN`, `VEHICLE_API_PASSWORD`, `VEHICLE_API_TOKEN` e `VEHICLE_API_TIMEOUT_MS`, mas não mostrou `VEHICLE_API_QUERY_PATH`. Os valores permaneceram protegidos. Portanto, o adaptador tem credenciais/configuração parcial, porém não possui o caminho contratado para a consulta de placa.

## Inspeção sanitizada adicional no Coolify

Em 18/08/2026, o filtro de variáveis de ambiente do recurso `carpivara` no ambiente `production` exibiu exatamente `VEHICLE_API_BASE_URL`, `VEHICLE_API_LOGIN`, `VEHICLE_API_PASSWORD`, `VEHICLE_API_TOKEN` e `VEHICLE_API_TIMEOUT_MS`. `VEHICLE_API_QUERY_PATH` não apareceu na lista filtrada. Nenhum valor foi aberto, copiado ou registrado.

A ausência permanece impeditiva para a consulta por placa porque o adaptador exige o caminho para montar a requisição. Não foi aplicada qualquer alteração de ambiente, pois o caminho contratado não está documentado no repositório nem pode ser inferido com segurança.

## Correção de robustez aplicada no código

O frontend passou a verificar o cabeçalho `Content-Type` antes de interpretar a resposta de `POST /api/fipe/quote` e do salvamento do relatório. Respostas HTML de erro agora resultam em mensagem neutra, sem o erro técnico `Unexpected token '<'`. O backend passou a possuir mensagens públicas específicas para os códigos de falha da identificação por placa, sem revelar provedor, fonte, API ou credenciais.

A validação local `npm test` foi executada com build do backend/frontend e cinco testes de normalização, todos aprovados.
