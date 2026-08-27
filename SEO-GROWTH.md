# SEO e aquisição — BUSCARR 0.5.0

## Objetivo

A versão 0.5.0 organiza a aquisição em páginas públicas por intenção, com conteúdo útil, metadata por rota e uma jornada progressiva: conteúdo, FIPE gratuita, criação ou acesso à conta, escolha do produto, checkout e relatório. O cadastro continua gratuito e nenhuma página pública promete uma cobertura que não esteja ativa no produto e na fonte correspondente.

## Páginas públicas por intenção

As doze páginas abaixo são implementadas no frontend, recebem metadata específica no servidor e no cliente, e estão incluídas no sitemap público:

| Intenção | Rota |
| --- | --- |
| Consulta de placa | `/consulta-placa` |
| Consulta veicular | `/consulta-veicular` |
| Gravame | `/consultar-gravame` |
| Sinistro | `/consultar-sinistro-veiculo` |
| Leilão | `/consultar-leilao-veiculo` |
| Débitos | `/consultar-debitos-veiculo` |
| Multas | `/consultar-multas-veiculo` |
| Recall | `/consultar-recall` |
| Checklist de compra | `/historico-veicular` |
| Produtos e preços | `/planos` |
| Lojistas | `/para-lojistas` |
| Concessionárias | `/para-concessionarias` |

Além das páginas de intenção, a home, a Consulta FIPE, os Termos de Uso e a Política de Privacidade possuem metadata pública própria. A validação de relatórios permanece fora da indexação por conter uma jornada transacional específica.

## Metadata e rastreabilidade

Cada rota pública utiliza `title`, `description`, canonical, Open Graph, Twitter Card e JSON-LD `WebPage` com URL canônica. O servidor injeta metadata por rota no HTML entregue a crawlers, enquanto o cliente mantém o head correto após navegação ou carregamento da aplicação. `robots.txt` permite conteúdo público, bloqueia `/api/` e a validação transacional, e aponta para o sitemap.

Os eventos do funil são limitados a nomes conhecidos e metadados curtos. A atribuição aceita somente UTMs e referência de origem; o navegador não registra placa, e-mail, documento, senha, token ou qualquer segredo. A placa digitada na home é convertida apenas em `plateFormat` para telemetria. O backend ainda utiliza identificação de sessão com hash e trata a telemetria como fail-open: falha no analytics não interrompe login, FIPE, checkout ou relatório.

## Conversão responsável

A home apresenta a FIPE gratuita e os conteúdos editoriais como primeiro passo. As páginas SEO orientam para a FIPE, a conta ou os produtos conforme a intenção, sem redirecionar todas as buscas diretamente para pagamento. Antes de iniciar o checkout, o usuário visualiza o produto, a cobertura disponível e o valor. O relatório diferencia informação encontrada de bloco não consultado e informa que a consulta não substitui documentos oficiais, vistoria ou avaliação profissional.

O painel administrativo exibe os indicadores agregados dos últimos 30 dias: visitantes do funil, visitantes de SEO, sessões com clique em CTA, início de checkout e taxa de cadastro por visitante. A FIPE também mantém contadores operacionais de início, conclusão, salvamento, download e saúde do provedor.

## Conteúdo editorial

O conteúdo deve responder dúvidas reais de quem compra, vende ou avalia veículos usados: consulta de placa, histórico, débitos, multas, gravame, sinistro, leilão, recall, transferência, golpes e checklist pré-compra. Exemplos devem ser fictícios e claramente identificados. Não devem ser criadas páginas programáticas vazias apenas para capturar palavras-chave.

## Próximos ciclos

A evolução deve priorizar fontes e produtos efetivamente ativos, melhoria de cobertura e confirmação oficial quando necessária. Recuperação de checkout, recompra e comunicações comerciais dependem de consentimento e permanecem separadas de analytics anônimo.
