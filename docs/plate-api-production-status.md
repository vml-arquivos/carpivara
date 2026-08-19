# Status da integração de consulta por placa

Data: 2026-08-19

A conta APIBrasil foi autenticada como `maxcellvendas2@gmail.com`. O painel de credenciais indicou inicialmente que não havia token; após confirmação explícita do usuário, o Bearer Token foi rotacionado e apareceu como ativo, com expiração em 19/08/2027. O token foi copiado pelo botão protegido do painel e não foi gravado em arquivo, log, repositório ou mensagem.

O Coolify está autenticado no ambiente `production` da aplicação `carpivara`, e o formulário de nova variável foi aberto. A tentativa de transferir o token diretamente do clipboard para o formulário via JavaScript expirou por falta de acesso ao clipboard. Nenhuma confirmação de que a variável foi criada foi observada; portanto, o segredo ainda precisa ser inserido por método seguro.

Não registrar o valor do token neste documento. Não enviar credenciais ao usuário por mensagem. Após inserir `APIBRASIL_BEARER_TOKEN`, configurar também as variáveis públicas necessárias ao adaptador APIBrasil, conferir os nomes já existentes e redeployar apenas depois de validar o conjunto completo.

Estado da página APIBrasil: a navegação posterior ficou presa em `Carregando...`; a sessão pode precisar ser reaberta pelo usuário no navegador.

- 2026-08-19: o smoke test em produção confirmou healthcheck, referências, catálogo e FIPE manual; a consulta por placa ainda retornou HTTP 502.
- Diagnóstico: o deployment `b9dw4dpizg9ll9xeu8da846g` ainda executava `d87fc76`, portanto a correção `49a43d4c` não estava implantada. O Git Source do Coolify foi atualizado para `49a43d4c8f5e2d9ba167bd953aa67451cacee1c8` e o novo deployment `dinfxyvvbhv2zonmdb6dl3le` foi iniciado.
- O novo deployment estava em progresso e já mostrava importação do commit correto e build da nova imagem. Nenhum token ou valor secreto foi registrado.

Na verificação seguinte, o deployment `dinfxyvvbhv2zonmdb6dl3le` permanecia em progresso, agora no estágio de build Docker da imagem do commit `49a43d4c`; os logs não mostravam falha até esse ponto. A produção continuava marcada como Running e nenhum segredo foi exibido.

O deployment `dinfxyvvbhv2zonmdb6dl3le` avançou: o build Docker foi concluído e os logs informaram que a aplicação está removendo os containers antigos para aplicar a nova imagem. O Coolify indicou que o rolling update não é suportado para as portas mapeadas, mas não houve falha; a validação pública deve aguardar o status Success.

Na etapa final do deployment, o build foi concluído e o Coolify iniciou a remoção do container antigo. O log de debug mostrou `docker stop --time=out=30` para o container anterior; o processo ainda estava em andamento e nenhum erro de aplicação ou credencial apareceu.

## 2026-08-19 — correção da rota APIBrasil

A validação do deployment `49a43d4c` confirmou HTTP 404 na consulta por placa. A causa foi a concatenação de `VEHICLE_API_BASE_URL=https://gateway.apibrasil.io/api/v2` com `VEHICLE_API_QUERY_PATH=/api/v2/consulta/veiculos/credits`, duplicando o prefixo. A variável de produção foi corrigida para `/consulta/veiculos/credits`, sem alterar o segredo. O Coolify iniciou o deployment `adr54usw2plsnefd8bio5egz` após confirmação explícita do usuário; a conclusão e o smoke test ainda estão pendentes.

Nenhum token, senha ou valor sensível foi registrado.

---

Registro atualizado em 2026-08-19.

## 2026-08-19 — configuração pública confirmada

A verificação no Coolify confirmou `VEHICLE_API_BASE_URL=https://gateway.apibrasil.io/api/v2` e `VEHICLE_API_QUERY_PATH=/consulta/veiculos/credits` em produção. A URL final montada pelo adaptador é `https://gateway.apibrasil.io/api/v2/consulta/veiculos/credits`; não há mais duplicação de `/api/v2` nem truncamento de `credits`. O smoke após o deployment `adr54usw2plsnefd8bio5egz` ainda retornou 502 para a placa, enquanto healthcheck, catálogo e FIPE manual permaneceram verdes. A próxima investigação deve separar autenticação Bearer, formato do payload e resposta/runtime da APIBrasil. Nenhum token ou valor secreto foi registrado.

## 2026-08-19 — correção da precedência de token

A causa provável do 502 foi a precedência do segredo legado `VEHICLE_API_TOKEN` sobre `APIBRASIL_BEARER_TOKEN` no ambiente de produção. O adaptador foi corrigido para priorizar explicitamente o token APIBrasil, o teste de transporte foi ampliado para cobrir os dois segredos, `npm test` passou integralmente e o commit `c6f5596` foi enviado para `main`. O Coolify foi atualizado para esse commit e iniciou o deployment `eruiuuw7ijtfkugtcqzr7rpn`. Nenhum token ou valor secreto foi registrado.
