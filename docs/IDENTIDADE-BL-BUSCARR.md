# Identidade visual do BL Buscarr

Fonte desta página: **Manual de Marca BL — Bolão Livre, "Identidade Visual (sem verde)"**, novembro de 2026. O manual
é o sistema do grupo (BL — Bolão Livre, assinatura institucional Sorte Tech). O BL Buscarr é a aplicação de consulta
veicular dessa família e passa a usar o mesmo sistema de cor, tipografia e gradiente: o monograma inclinado e as formas
compactas continuam sendo os do Buscarr — a inclinação faz parte do desenho —, mas a paleta verde-pinho anterior está
substituída.

## Paleta

| Papel | Hex | Origem |
| --- | --- | --- |
| Azul principal (marca, ações, links) | `#2563EB` | manual, "Azul Principal" |
| Azul claro (acento, destaque, foco) | `#60A5FA` | manual, "Azul Claro (Highlight)" |
| Azul escuro (profundidade, hover, monograma) | `#1E40AF` | manual, "Azul Escuro (Profundidade)" |
| Cinza neutro (linhas, bordas, texto sobre escuro) | `#E5E7EB` | manual, "Cinza Neutro" |
| Branco (superfície) | `#FFFFFF` | manual, "Branco" |
| Preto (assinatura, P&B) | `#000000` | manual, "Preto" |

Derivados necessários para o produto existir, todos da mesma família e com a mesma luminância do que substituíram:
`#EFF6FF` e `#DBEAFE`/`#BFDBFE`/`#93C5FD` (tintas de azul claro para fundos suaves e monocromas), `#F3F4F6`/`#F9FAFB`
(superfícies), `#111827`/`#1F2937`/`#374151`/`#4B5563`/`#6B7280` (escala de texto derivada do preto, porque texto
corrido em `#000000` puro cansa em tela), `#0B1220`/`#030712` (superfícies escuras profundas).

**Gradiente oficial:** topo `#60A5FA` → meio `#2563EB` → base `#1E40AF` (token `--grad-brand`).

## A exceção que não é estética: cor de estado

O verde continua existindo no produto **só como estado do dado**, nunca como marca: `--ok #0E9F6E` (com a tinta
`#E3F8EF`) e o farol verde significam "a fonte consultou e não registrou nada". Recolorir isso por identidade faria o
cliente ler um resultado diferente do que a fonte afirmou, o que a diretiva do produto proíbe. Por isso o aplicador
`scripts/brand/paleta-2026.py` protege a lista `ESTADO` e qualquer linha cujo contexto indica estado (`--ok`, farol,
nível `GREEN`), e o contrato `apps/api/test/identidade-visual.test.mjs` exige o azul de marca ao mesmo tempo em que
permite o verde de estado. O medidor de força de senha e o botão flutuante do WhatsApp também mantêm seus verdes, que
são signos desses serviços, não da marca.

## Tipografia

Inter nos três usos do manual: SemiBold em títulos (24–32 px) e botões (14–16 px), Medium em subtítulos (16–20 px),
Regular em texto (14–16 px). Montserrat SemiBold é a alternativa prevista para títulos. O `Nunito` permanece apenas na
placa Mercosur (`--font-plate`), que imita o formato real do objeto, não a marca.

## Arquivos

| Aplicação | Arquivo em `apps/web/public/brand/` |
| --- | --- |
| Cabeçalho claro | `logo-horizontal.svg` |
| Cabeçalho escuro | `logo-horizontal-dark.svg` |
| Composição vertical | `logo-vertical.svg` e `logo-vertical-dark.svg` |
| Monograma isolado | `logo-mark.svg` e `logo-mark-dark.svg` |
| Impressão monocromática | `logo-mono.svg` e `logo-mono-white.svg` |
| Aplicativo e avatar | `logo-app-icon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`, `apple-touch-icon.png` |
| Compartilhamento | `og-image.png` |

Gerador: `python3 scripts/brand/build-logos.py` (vetoriais) e, para os rasterizados,
`CHROME_PATH=<chromium> PLAYWRIGHT_MODULE=playwright-core node scripts/brand/rasterize.mjs` (requer ImageMagick).
Tamanhos do manual: ícone/avatar mínimo 128 px, ideal 512 px; monograma em feed ≥ 400 px; assinatura horizontal em
cabeçalho ≥ 600 px. Área livre ao redor da assinatura = um terço da altura do monograma.

## Regras do manual que viraram regra de código

- Sem contorno, sem sombra pesada, sem efeito neon no logotipo.
- Não aplicar a marca sobre foto detalhada sem faixa ou overlay.
- Versão P&B (`logo-mono.svg`, `logo-mono-white.svg`) em impressão e documentos formais.
- Nenhum verde ou amarelo chamativo como cor de marca.

## Como trocar de novo

`python3 scripts/brand/paleta-2026.py` simula e `--apply` aplica a virada: tabela exata para as cores nomeadas, giro de
matiz preservando luminância para o resto, e proteção do que é estado. É idempotente e não toca em `node_modules`,
`dist` nem nos testes. Depois rerodam-se os geradores de asset, o build e a suíte.
