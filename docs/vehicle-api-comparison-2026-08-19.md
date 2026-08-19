# Comparação de APIs veiculares comerciais — 2026-08-19

## API Placas / Aetheria

A página institucional declara uma base com mais de 300 milhões de registros de veículos emplacados no Brasil e informa campos como marca, modelo, ano, UF, município, cor e situação. A página de contratação exibe preço de R$ 0,03 por consulta, com exemplo de 10.000 consultas por R$ 300,00. A página consultada não detalha, por si só, módulos de gravame, sinistro, leilão ou débitos; esses itens precisam ser confirmados na documentação/conta comercial antes de contratar.

Fontes: https://apiplacas.com.br/ e https://apiplacas.com.br/contratar.php

## Consultar Placa

A documentação pública declara consultas básicas e avançadas por placa/chassi e lista módulos de Renavam, débitos RENAINF, proprietário atual, preço FIPE, leilão Prime, sinistro com perda total, roubo/furto e gravame. Também menciona histórico de recall, ficha técnica, imagens e relatórios.

O módulo FIPE por placa usa `GET https://api.consultarplaca.com.br/v2/consultarPrecoFipe` com o parâmetro obrigatório `placa`. O exemplo de resposta inclui dados cadastrais e técnicos do veículo, chassi, anos, marca, modelo, cor, combustível, município/UF e uma lista de correspondências FIPE com código, versão, preço, mês de referência e histórico de 12 meses. A documentação não informa nessa página o preço específico do módulo FIPE; a página geral de preços informa que é necessário adquirir créditos e que a consulta básica por placa custa R$ 0,31 no menor volume, ou R$ 0,25 com pacote de créditos, caindo até R$ 0,12 em 10.001–20.000 consultas mensais com pacote. Módulos avançados são cobrados separadamente e devem ser confirmados no orçamento.

Fontes: https://docs.consultarplaca.com.br/ e https://docs.consultarplaca.com.br/consultas/consulta-fipe-por-placa e https://docs.consultarplaca.com.br/api-consultar-placa/preco

## AvaliService

A página de soluções declara mais de 50 consultas em quatro famílias e afirma usar fontes 100% oficiais. Na família veicular/CNH, lista leilão em três bases, sinistro, roubo/furto, gravame/alienação, débitos, RENAJUD, RENAINF, restrições, agregados, FIPE e consultas de CNH. Também oferece dados cadastrais, comunicado de venda e CRLV-e.

A documentação pública v1.5 confirma autenticação via JWT Bearer com validade de 24 horas, login em `POST /api/Auth/login` e dezenas de endpoints POST, incluindo `fipe`, `IndicioSinistro`, `Leilao`, `detalhesgravame`, `roubofurto`, `renajud`, `renainf`, `debitosveiculares`, `Agregados` e `veiculoDoc`. A página consultada não publica tabela de preços; solicita apresentação/contato comercial. Logo, aparenta ser forte em profundidade e integração empresarial, mas não pode ser classificada como melhor preço sem cotação formal.

Fontes: https://avaliservice.com.br/solucoes e https://avaliservice.com.br/docs

## ZapCar

A página oficial para integradores declara dados oficiais DETRAN, resposta JSON, chave self-service e pagamento por consulta, sem mensalidade mínima. A API usa `https://api.zapcarconsulta.com.br/v1`, Bearer token, POST para criar a consulta e polling por ID até a conclusão; há estorno automático quando a consulta falha.

A modalidade simples informa marca, modelo, ano, cor, situação e dados de registro. A modalidade completa declara gravame, sinistro, leilão, restrições e mais de 30 itens. Também há serviços separados para gravame, RENAJUD, débitos com código de barras, débitos estaduais, decodificação de chassi/motor, histórico de proprietários, CRLV e código de segurança.

Preços publicados na página consultada: simples R$ 5,99; completa R$ 29,99; gravame R$ 6,99; RENAJUD R$ 6,99; débitos + código de barras R$ 19,99; débitos estaduais R$ 2,39 (requer placa + UF + RENAVAM); histórico de proprietários R$ 9,90; decodificação de chassi/motor R$ 2,49; CRLV a partir de R$ 25,99. A página informa que a chave pode ser criada gratuitamente e que o saldo é consumido por chamada.

Fontes: https://www.zapcarconsulta.com.br/api-integradores e https://www.zapcarconsulta.com.br/api-integradores/docs
