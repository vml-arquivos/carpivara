# Status da integração de consulta por placa

Data: 2026-08-19

A conta APIBrasil foi autenticada como `maxcellvendas2@gmail.com`. O painel de credenciais indicou inicialmente que não havia token; após confirmação explícita do usuário, o Bearer Token foi rotacionado e apareceu como ativo, com expiração em 19/08/2027. O token foi copiado pelo botão protegido do painel e não foi gravado em arquivo, log, repositório ou mensagem.

O Coolify está autenticado no ambiente `production` da aplicação `carpivara`, e o formulário de nova variável foi aberto. A tentativa de transferir o token diretamente do clipboard para o formulário via JavaScript expirou por falta de acesso ao clipboard. Nenhuma confirmação de que a variável foi criada foi observada; portanto, o segredo ainda precisa ser inserido por método seguro.

Não registrar o valor do token neste documento. Não enviar credenciais ao usuário por mensagem. Após inserir `APIBRASIL_BEARER_TOKEN`, configurar também as variáveis públicas necessárias ao adaptador APIBrasil, conferir os nomes já existentes e redeployar apenas depois de validar o conjunto completo.

Estado da página APIBrasil: a navegação posterior ficou presa em `Carregando...`; a sessão pode precisar ser reaberta pelo usuário no navegador.
