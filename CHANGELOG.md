# Changelog

## 1.0.10 — Identidade BL aplicada por inteiro, nos temas claro e escuro
- Cores do site, da área do cliente e do painel seguem o Manual de Marca BL: Azul Principal `#2563EB` nos botões e ações, Azul Claro `#60A5FA` em destaques, Azul Escuro `#1E40AF` em profundidade, Cinza Neutro `#E5E7EB` em linhas. Gradiente oficial nos ícones e nos elementos de destaque.
- Abertura da página inicial em gradiente azul (claro: Azul Principal para Azul Escuro; escuro: Azul Escuro para preto azulado), com consulta de placa em botão azul.
- Tema escuro com superfícies derivadas do Azul Escuro e do preto (`#0B1220`, `#111C30`, `#16233A`), no lugar do cinza neutro. Botões com fundo azul e texto branco nos dois temas; links claros no escuro.
- Títulos em Inter SemiBold, subtítulos em Medium, texto em Regular e botões em SemiBold. Espaçamento dos títulos da home e das páginas internas menos apertado.
- Estrelas de avaliação e cores de gráficos do simulador saíram do amarelo/laranja e passaram a usar os azuis da marca. Aviso interno do suporte deixou de ser amarelo.
- Ícone do app, favicon e monograma com o gradiente oficial; novos `logo-monograma.svg`, `logo-horizontal-mono.svg` e `logo-horizontal-mono-white.svg` (preto e branco, para documentos).
- Capas das páginas, imagens das consultas, imagem de compartilhamento, ilustração da abertura e capturas do app regeneradas sem verde, rosa ou amarelo.
- O verde segue só como cor de estado do relatório ("sem registro" e farol verde), porque significa o resultado da fonte. Corrigido o tom do estado "ok" no tema escuro, que tinha virado azul por engano.
- Nome padronizado como "BL Buscarr" em textos, testes e migração da marca. Página `/demonstracao` ganhou texto de SEO (estava no mapa do site sem cadastro).

 
## 1.0.9 — Reabrir relatório deixou de cobrar, e o relatório voltou a ser honesto sobre o que não sabe
- Estado de cada base passou a ser um vocabulário único: ocorrência, nada consta confirmado pela fonte, sem retorno, fora da cobertura do pacote e consulta indisponível. "NÃO INFORMADO", "NÃO DISPONÍVEL" e "NÃO LOCALIZADO" deixaram de ser lidos como ausência confirmada, e marcadores de indisponibilidade não compram nem inibem a consulta complementar.
- HTTP 404/410 na Credify e na AnyCar passou a ser "consulta indisponível" (endpoint fora do contrato da conta), e não mais "placa não encontrada": falha de provisão não pode virar resultado no relatório. Placa inexistente continua chegando como CODIGO=2 no corpo.
- Envelope do /gravame sem dados deixou de virar "Sem gravame ou alienação fiduciária registrados", e registro sem STATUS deixou de ser afirmado como ativo.
- Campo de seção vendida cuja fonte não foi comprada não some mais: sai com a leitura "fora da cobertura deste pacote", distinguindo ausência confirmada de item não verificado.
- Campos calculados pelo sistema (quilometragem de referência, projeção de preço, decodificação do chassi, análises de leilão) saem sinalizados como estimativa e nunca como dado da fonte.
- Fonte opcional que falha degrada o resultado para parcial em vez de derrubar a consulta; a consulta parcial não entrega veredito limpo.
- Reabrir relatório - JSON, PDF, impressão, dossiê, contestação, conferência de anúncio e a rota v1 de PDF por chave de API - deixou de completar o gravame de consultas legadas. É decisão de custo: essa completude gasta uma chamada paga ao fornecedor e não pode ser disparada por leitura.
- A completude de gravame passou a ser ação administrativa, por ação explícita e auditada: `POST /admin/queries/:id/refresh-gravame` (uma consulta) e `POST /admin/queries/refresh-gravame` (em lote, com prévia de quantas consultas faltam).
- O enriquecimento gratuito segue na leitura comum: valor e projeção da Tabela FIPE pública continuam sendo acrescentados às consultas Completa/Premium antigas, porque não passam pelo provedor pago.
- A landing tinha um sistema de tokens próprio (dourado no botão, casca verde-escura no herói) e havia fundos escuros com cast verde de saturação baixa: ambos entraram no sistema do manual. A tinta semântica `--ok-ink` do tema escuro, girada por engano, foi restaurada.
- Identidade visual realinhada ao Manual de Marca BL (Bolão Livre, "sem verde"): azul principal `#2563EB`, azul claro `#60A5FA`, azul escuro `#1E40AF`, cinza neutro `#E5E7EB`, branco e preto, com o gradiente oficial do manual; logotipos vetoriais, ícones do app, máscara, imagem de compartilhamento e capas regenerados. As cores de estado do relatório ficaram de fora da virada de propósito: o verde do farol e de "sem registro" é leitura do dado, não marca, e trocá-lo faria o cliente ver resultado diferente do que a fonte afirmou.
- Nenhuma rota, URL ou contrato de saída mudou; o cliente recebe o relatório guardado com o mesmo código de validação, e a cobrança da compra continua como era.
## 1.0.8 — Lojistas e comparação de anúncios

- Página para lojistas com cadastro direcionado, solicitação de contratação e instruções para publicar a vitrine após liberação.
- Ofertas de estoque público e disponível sob demanda, a partir do relatório privado do comprador.
- Conferência de dois anúncios no comparador existente, com preço e diferença em relação à FIPE quando disponível.

## 1.0.7 — Entenda seu relatório

- Guia sob demanda com orientações de negociação ligadas a alertas do relatório adquirido.
- Prioridade opcional por IA usando apenas códigos fixos, com ordem por regras como alternativa.
- Comparador diferencia débitos sem retorno de débitos fora da cobertura.

## 1.0.6 — Contraste e hierarquia na página inicial

- Abertura em verde profundo com título branco, fotografia e ação de consulta em dourado fosco.
- Temas claro e escuro com superfícies, textos e ações de contraste próprio. Ferramentas e catálogo reorganizados.

## 1.0.5 — Página inicial e SEO

- Primeira dobra com fotografia automotiva, consulta em destaque, ferramentas abaixo e contraste adaptado ao tema.
- Catálogo em duas colunas no desktop, guia ilustrado de compra e imagens WebP responsivas.
- Metadados da home revisados, guias rastreáveis no HTML inicial e imagem no sitemap.

## 1.0.4 — Identidade BL Buscarr

- Monograma BL inclinado, assinatura BUSCARR, ícones e favicon.
- Inter e paleta verde-pinho com sálvia no site, aplicativo do cliente e painel. Identidade aplicada aos PDFs gerados e à imagem de compartilhamento.

## 1.0.3 — Demonstração de consultas

- Página pública com sete relatórios de exemplo para três placas fictícias, com visualização em tela e download de PDF.
- Os exemplos funcionam com o provedor de dados desligado e ficam separados da compra e do histórico de consultas reais.

## 1.0.2 — Nova interface do BL Buscar

- A página inicial reúne o formulário de placa, a FIPE, o simulador e a validação de relatórios em uma nova composição. O catálogo de consultas usa fichas horizontais no desktop.
- Páginas internas, área do cliente e painel administrativo receberam tipografia, superfícies, navegação e componentes revisados. O acesso à conta usa um formulário centralizado.
- Revisão dos títulos e textos de orientação das telas principais.

## 1.0.1 — Respostas da Credify no formato publicado

- **Recall com CODIGO dentro de CONSULTA.** Esse formato passa a ser aceito (antes a consulta era recusada).
- **Data do gravame legível.** A data de inclusão sai como 20/02/2024 mesmo quando a base envia `20240220` ou `2024-02-20`.
- **Multas mais completas.** Cada multa mostra local, data, hora e demais detalhes enviados, e a situação `opened` aparece como "Em aberto" (e `paid` como "Pago").
- Testes novos em `formatos-resposta` para esses formatos.

## 1.0.0 — BL Buscar

Primeira versão do BL Buscar (buscarr.com.br), consulta veicular por placa da Sorte Tech, assim como o Bolão Livre.

- Mesmas funções do sistema que serviu de base (versão 1.65.1): consultas por placa, carteira e créditos, relatório em tela e em PDF, painel administrativo, loja e simuladores, SEO.
- Mesma integração com a Credify e o mesmo contrato de APIs por produto. Preços dos produtos sem alteração.
- Marca, cores, logotipo, textos, e-mails, PDFs, páginas legais e nomes técnicos (pacote, cookies, chaves, prefixos) trocados para BL Buscar.
- Marca centralizada em um só lugar (`apps/api/src/lib/brand.ts` e `apps/web/src/shared/brand.ts`); teste `marca` confere que os dois são iguais.
- Migração `091_marca_bl_buscar`: atualiza textos de marca já gravados no banco (modelos de relatório, autor de artigos, respostas prontas do suporte).
- Rodapé "Uma plataforma Sorte Tech" com link para o Bolão Livre (bolaolivre.com.br).
- Dados que dependem da empresa (razão social, CNPJ, endereço, WhatsApp e Instagram) ficam como `[PREENCHER]` até serem informados.
