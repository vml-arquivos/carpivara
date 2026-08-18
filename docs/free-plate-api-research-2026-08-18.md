# Avaliação de API gratuita de consulta por placa — 18/08/2026

## BrasilAPI

Fonte consultada: [BrasilAPI](https://brasilapi.com.br/).

A página pública descreve a BrasilAPI como um projeto experimental que centraliza e disponibiliza endpoints modernos com baixa latência, com documentação pública acessível em `/docs`. Os termos visíveis orientam que o serviço não seja abusado e proíbem crawling/full scan automatizado; o volume deve corresponder ao uso de uma pessoa real consultando um dado específico. A página não afirma, por si só, que existe um endpoint gratuito de consulta por placa; essa hipótese ainda precisa ser confirmada na documentação de endpoints.

Fonte: https://brasilapi.com.br/

## Resultado da documentação BrasilAPI

A documentação pública consultada em [BrasilAPI Docs](https://brasilapi.com.br/docs) lista categorias como CNPJ, NCM, registro BR, bancos, câmbio, FIPE, fundos, PIX, taxas, tickers, CEP, CPTEC, DDD, IBGE, feriados, ISBN e TUSS. Não foi localizada uma categoria ou endpoint de consulta veicular por placa. A categoria FIPE existente serve à tabela FIPE, mas não resolve placa para veículo. Portanto, a BrasilAPI não atende sozinha ao requisito de iniciar a consulta pela placa.

Fonte: https://brasilapi.com.br/docs

## APIBrasil — plano gratuito

A referência pública consultada informa que a API Consulta Placa Veículo da APIBrasil oferece um plano gratuito com **100 requisições diárias**, renovadas automaticamente, segundo o artigo consultado. O texto também afirma que a API retorna dados como marca, modelo, ano e chassi usando a placa. Essa fonte é um artigo de terceiros, não a documentação contratual oficial; ainda é necessário validar no portal/documentação oficial da APIBrasil o endpoint, o cadastro da chave, o formato atual da resposta, a política de uso e se os 100 acessos continuam vigentes.

Fonte secundária: https://programadorbrasil.com.br/como-utilizar-a-api-consulta-placa-veiculo-da-apibrasil-com-limite-gratis/

## APIBrasil — validação do site oficial

O acesso direto ao site oficial `https://www.apibrasil.com.br/` foi interrompido por uma verificação de segurança da Vercel, sem documentação visível. O resultado de busca oficial indica um produto de veículos por placa, mas não foi possível confirmar diretamente o endpoint nem as condições atuais do plano gratuito nesta etapa. Por isso, a integração não deve ser feita apenas com base em snippets.

Fonte oficial: https://www.apibrasil.com.br/

## API Placas — contrato oficial

A documentação oficial da [API Placas](https://apiplacas.com.br/doc.php) confirma uma consulta GET por placa no formato `https://wdapi2.com.br/consulta/{placa}/{token}`. O token é fornecido após cadastro; a documentação também informa que há tokens para consultas normais e premium. A resposta JSON documentada contém identificação veicular útil para o funil, incluindo `marca`, `modelo`, `ano`, `anoModelo`, `placa`, `marcaModelo`, `uf`, `municipio`, `cor`, `chassi` parcialmente mascarado e o objeto `extra`. A resposta também pode trazer um objeto `fipe.dados`, mas a documentação alerta que os valores FIPE podem não aparecer em todas as consultas e que podem existir múltiplos resultados, recomendando selecionar pelo maior `score`.

A documentação consultada confirma o endpoint e o formato, mas não declara na página um plano gratuito permanente; informa apenas que o limite diário depende do plano e pode ser consultado no painel ou por `https://wdapi2.com.br/saldo/{token}`. Portanto, a API é tecnicamente simples e compatível, mas a gratuidade precisa ser confirmada no cadastro/condições comerciais antes de escolhê-la como provedor definitivo.

Fonte: https://apiplacas.com.br/doc.php

## API Placas — condição comercial pública

A página pública de contratação da API Placas informa preço de **R$ 0,03 por consulta** e apresenta aquisição de pacotes; no exemplo padrão de 10.000 consultas, o total exibido é R$ 300,00. Não foi identificado um plano gratuito permanente nessa página. Assim, embora o contrato técnico seja simples e a resposta contenha os campos necessários, ela não atende ao requisito de API gratuita sem confirmação de crédito promocional.

Fonte: https://apiplacas.com.br/contratar.php

## Busca complementar por alternativas gratuitas

A busca por uma API brasileira de placa sem cartão, sem chave e com cota gratuita identificou principalmente a APIBrasil (plano gratuito citado por fonte secundária), a API Placas (token e contratação por pacote), o Portal Gov.br/Denatran (serviço para usuário no portal, não uma API pública anônima simples) e discussões comunitárias sem contrato oficial. Não foi encontrada uma API pública de consulta por placa que pudesse ser integrada de forma segura e verificável sem cadastro/token. A BrasilAPI continua sendo gratuita para seus endpoints documentados, mas sua documentação atual não lista placa.

Fontes consultadas:
- https://www.gov.br/pt-br/servicos/consultar-online-os-dados-de-placa-veicular
- https://www.projetoacbr.com.br/forum/topic/82463-api-para-consulta-de-placa-de-veiculos/
- https://apiplacas.com.br/doc.php
- https://brasilapi.com.br/docs

## APIBrasil — SDK oficial

A documentação pública do SDK PHP da APIBrasil confirma os métodos `vehicles->dados(['placa' => 'ABC1234'])` e `vehicles->fipe(['placa' => 'ABC1234'])`. O exemplo de inicialização exige `APIBRASIL_BEARER_TOKEN` para a API geral e `APIBRASIL_DEVICE_TOKEN` para serviços baseados em dispositivo; a própria documentação instrui obter as credenciais em `https://apibrasil.com.br`. Isso confirma que a integração é simples do ponto de vista do código, mas não é uma API anônima sem credencial. Ainda não foi confirmada, no material oficial acessível, a cota gratuita atual.

Fonte: https://package.apibrasil.com.br/

## Projetos públicos e APIs sem chave

A pesquisa encontrou wrappers e projetos comunitários baseados no Sinesp, além de bibliotecas que fazem scraping de sites de terceiros. Esses projetos não oferecem um contrato oficial estável para produção; podem depender de captcha, mudanças de página, bloqueios e bases não autorizadas. Também foi localizado o portal oficial Gov.br/Denatran, mas seu acesso é voltado ao usuário autenticado no portal e não equivale a uma API pública anônima simples. Não será adotado scraping nem wrapper comunitário como integração produtiva, pois isso violaria o requisito de assertividade e criaria risco de indisponibilidade/regressão.

Fontes de descoberta:
- https://github.com/topics/placa
- https://github.com/yagoluiz/consultaplaca-api
- https://github.com/Sorackb/sinesp-api
- https://www.gov.br/pt-br/servicos/consultar-online-os-dados-de-placa-veicular

## APIBrasil — cadastro e gratuidade anunciados

Resultados oficiais de busca para o site APIBrasil anunciam integração de APIs de veículos, cadastro sem cartão e sem fidelidade. O blog oficial menciona até sete consultas gratuitas por dia para consulta de placas, enquanto uma fonte secundária consultada menciona 100 requisições diárias. Há uma divergência entre essas referências; portanto, a APIBrasil é a melhor candidata gratuita encontrada, mas a cota efetiva precisa ser confirmada no painel da conta antes de configurar produção. A integração também exige os tokens da conta, conforme o SDK oficial.

Fontes:
- https://www.apibrasil.com.br/
- https://apibrasil.blog/desvendando-as-apis-para-consulta-de-placas-de-carro/
- https://package.apibrasil.com.br/

## APIBrasil — confirmação no blog oficial

O artigo oficial da APIBrasil intitulado “API de Consulta de Placas de Carro: Informações Imediatas e Gratuitas” afirma que é possível aproveitar **até sete consultas gratuitas**. O artigo descreve consultas por placa como retorno de modelo, ano, cor e situação cadastral. Ele é material informativo, não documentação de API; ainda assim, reforça a APIBrasil como a alternativa gratuita mais simples encontrada. A cota exata e as credenciais devem ser obtidas no cadastro/painel oficial, sem assumir o número de 100 consultas citado por fonte externa.

Fonte: https://apibrasil.blog/desvendando-as-apis-para-consulta-de-placas-de-carro/

## Documentação técnica

A página pública `https://doc.apibrasil.io/` redireciona para autenticação; portanto, a documentação detalhada de veículos não pode ser validada sem uma conta APIBrasil. A página oficial e o SDK público, entretanto, confirmam o gateway `https://gateway.apibrasil.io/api/v2`, autenticação Bearer para operações por créditos e o método de veículos por placa (`consulta->veiculos` / `vehicles->dados`). A implementação deve deixar o caminho configurável e não assumir um retorno FIPE: somente a identificação veicular normalizada deve alimentar a seleção FIPE interna já existente.

Fonte: https://doc.apibrasil.io/
