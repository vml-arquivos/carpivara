# Changelog

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
