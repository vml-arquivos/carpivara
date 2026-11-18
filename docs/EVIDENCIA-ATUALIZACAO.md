
## Identidade visual (Manual de Marca BL): o que a varredura não pegava

Quatro passadas. A terceira e a quarta só apareceram porque eu fotografei as telas em vez de confiar no `grep`.

- Passadas 1 e 2: tabela exata das cores nomeadas + giro de matiz preservando luminância, sobre CSS, TypeScript, SVG,
  HTML, manifest e os geradores. 229 + 81 ocorrências tratadas, 102 proteções de estado.
- Passada 3: a landing tinha um **sistema de tokens próprio** (`--home-*`), herança da página dourada. O botão
  "Consultar" saiu âmbar e a casca do herói saiu verde-escura, e nenhum dos dois estava na tabela porque dourado não
  é verde. Entraram no mapa `--home-gold`, `--home-canvas`, `#AD8245`, `#211B10` e o gradiente decorativo `#4ADE80`;
  ícones, imagem de compartilhamento e capas foram regenerados pelos geradores oficiais.
- Passada 4: fundos escuros com cast verde de saturação baixa, em que o verde não dominava o azul — `rgb(17, 29, 24)`
  no herói da home. A detecção passou a tratar verde escuro de baixa saturação.
- Erro que cometi e desfiz: ao mover tintas para a tabela, `#7FE3BC` (tinta semântica `--ok-ink` do tema escuro) foi
  girada para azul, porque a tabela tem precedência sobre a proteção de estado. Restaurei o token e tirei o hex da
  tabela, para não acontecer de novo.
- Falso alarme investigado: a home quebrou no meu servidor de preview caseiro, que devolvia `index.html` (HTML) para
  as rotas de API, e o app então fazia `undefined.filter()`. Com o mesmo tipo de servidor, o build de antes e o de
  depois da paleta renderizam idênticos. Não era regressão de código.

Certificação: linha de base 1058 testes, 1048 passando, 10 falhas preexistentes. Após a passada 3, a suíte inteira
repetiu exatamente as mesmas 10, nenhuma nova e nenhuma resolvida (`cert-brand3.log`). A árvore final, que tem as
passadas 3 e 4 também no código da API, é re-certificada em `cert-final.log`.

O que o manual não resolve e continua com você: o gate `release:verify` segue vermelho pelo advisory high do `zod` 3
e pelas 10 falhas antigas de SEO/nome, e a grafia definitiva do nome (BL Buscar × BL Buscarr) continua sem a sua
palavra.
