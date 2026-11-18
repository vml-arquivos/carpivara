

## Identidade visual: o que a varredura não pegava e como foi resolvido

Quatro passadas. A terceira e a quarta só apareceram porque fotografei as telas em vez de confiar no grep.

- Passadas 1 e 2: tabela exata das cores nomeadas + giro de matiz preservando luminância sobre CSS, TypeScript, SVG,
  HTML, manifest e geradores (229 + 81 ocorrências, 102 proteções de estado).
- Passada 3: a landing tinha um sistema de tokens próprios (--home-*), heranca da pagina dourada. O botao Consultar
  saiu âmbar e a casca do heroi saiu verde-escura; nenhum dos dois estava na tabela porque dourado não é verde.
  `--home-gold`, `--home-canvas`, #`AD8245`, `#211B10` e o gradiente decorativo #4ADE80 entraram no mapa; ícones, OG e capas
  foram regenerados.
- Passada 4: fundos escuros com cast verde de saturacao baixa, em que o verde não dominava o azul -- rgb(17,29,24) no
  heroi da home. A deteccao passou a tratar verde escuro de baixa saturação.
- Erro que cometi e desfiz: ao mover tintas para a tabela, #7FE3BC (#7FE3BC (tinta semântica `--ok-ink` do tema escuro) foi
  giradada para azul, porque a tabela tem precedência sobre a proteção de estado.Restaurei o token e tirei o hex da
  tabela para não repetir.
- Falso alarme investigado: a home quebrou no meu servidor de preview caseiro, que devolvia HTML para as rotas de API
  (o app fazia undefined.filter()). Com o mesmo tipo de servidor, o build de antes e o de depois renderizam idênticos.
  Não era regressao de código.

Certificacao: linha de base 1058/1048/10. Apos a passada 3 a suíte inteira repetiu exatamente as mesmas 10 falhas,
nenhuma nova, nenhuma resolvida (cert-brand3.log). A árvore final, com as passadas 3 e 4 no código da API, e
re-certificada em cert-final.log.

Continua com você: o gate `release:verify` segue vermelho pelo advisory high do `zod` 3 e pelas 10 falhas antigas de
SEO/nome, e a grafia definitiva do nome (BL Buscar × BL Buscarr) segue sem a sua palavra.
