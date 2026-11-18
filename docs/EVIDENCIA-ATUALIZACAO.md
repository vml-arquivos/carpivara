

## Identidade visual: o que a varredura nao pegava e como foi resolvido

Quatro passadas. A terceira e a quarta so apareceram porque fotografei as telas em vez de confiar no grep.

- Passadas 1 e 2: tabela exata das cores nomeadas + giro de matiz preservando luminancia sobre CSS, TypeScript, SVG,
  HTML, manifest e geradores (229 + 81 ocorrencias, 102 protecoes de estado).
- Passada 3: a landing tinha um sistema de tokens proprios (--home-*), heranca da pagina dourada. O botao Consultar
  saiu amber e a casca do heroi saiu verde-escura; nenhum dos dois estava na tabela porque dourado nao e verde.
  --home-gold, --home-canvas, #AD8245, #211B10 e o gradiente decorativo #4ADE80 entraram no mapa; icones, OG e capas
  foram regerados.
- Passada 4: fundos escuros com cast verde de saturacao baixa, em que o verde nao dominava o azul -- rgb(17,29,24) no
  heroi da home. A deteccao passou a tratar verde escuro de baixa saturacao.
- Erro que cometi e desfiz: ao mover tintas para a tabela, #7FE3BC (tinta semantica --ok-ink do tema escuro) foi
  girada para azul, porque a tabela tem precedencia sobre a protecao de estado.Restaurei o token e tirei o hex da
  tabela para nao repetir.
- Falso alarme investigado: a home quebrou no meu servidor de preview caseiro, que devolvia HTML para as rotas de API
  (o app fazia undefined.filter()). Com o mesmo tipo de servidor, o build de antes e o de depois renderizam identicos.
  Nao era regressao de codigo.

Certificacao: linha de base 1058/1048/10. Apos a pasada 3 a suinte inteira repetiu exatamente as mesmas 10 falhas,
nenhuma nova, nenhuma resolvida (cert-brand3.log). A arvore final, com as passadas 3 e 4 no codigo da API, e
re-certificada em cert-final.log.

Continua com voce: o gate release:verify segue vermelho pelo advisory high do zod 3 e pelas 10 falhas antigas de
SEO/nome, e a grafia definitiva do nome (BL Buscar x BL Buscarr) segue sem a sua palavra.
