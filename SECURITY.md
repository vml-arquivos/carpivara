# Segurança e privacidade

## Controles implementados

A aplicação exige segredos exclusivamente em runtime. `DATABASE_URL`, `JWT_SECRET`, credenciais de provider e chaves de pagamento não fazem parte do frontend, do Dockerfile ou de argumentos de build. A configuração é validada no startup e `JWT_SECRET` exige comprimento mínimo de 32 caracteres.

| Controle | Aplicação |
| --- | --- |
| Senhas | Hash bcrypt com custo 12. O hash não é exposto nas respostas. |
| Sessão | JWT com expiração configurável; o cliente mantém somente o token de sessão no `sessionStorage`. |
| Login | Rate limit específico, auditoria de falha e bloqueio temporário após cinco tentativas consecutivas. |
| API | Helmet, limite de payload JSON, rate limit configurável, validação Zod e consultas SQL parametrizadas. |
| Autorização | Middleware de permissões para consultar, comprar créditos, administrar preços e visualizar operação. |
| Créditos | Transações PostgreSQL, `FOR UPDATE`, saldo não negativo, ledger e estorno automático. |
| Rastreamento | Request ID, eventos de auditoria e logs estruturados com chaves sensíveis filtradas. |
| Dados retornados | Interface recebe somente o modelo normalizado; o payload original não possui endpoint público. |

## Privacidade e LGPD

O sistema foi estruturado para redução de exposição. Informações como renavam, chassi, motor e documento são mascaradas na interface quando apresentadas; dados brutos permanecem no backend para auditoria e podem ter o armazenamento desativado por `STORE_RAW_PROVIDER_RESPONSE=false`.

A produção precisa definir formalmente finalidade, base legal, prazo de retenção, processos de exclusão e controles para o acesso de administradores a dados pessoais. O repositório não declara conformidade jurídica automática: a operação deve passar por validação jurídica e pelo contrato do fornecedor de dados.

## Configuração de produção

TLS deve terminar no proxy reverso/Coolify. Use `NODE_ENV=production`, uma URL pública válida, segredo aleatório de alta entropia e `SANDBOX_SEED_ENABLED=false`. A compra sandbox também deve ficar desabilitada fora de demonstração.

## Próximas camadas antes de pagamento real

A implementação de gateway deve aceitar crédito apenas por webhook autenticado, idempotente e conferido contra o status do provedor. Caso dados pessoais retornem do fornecedor, considere criptografia em repouso da resposta bruta, rotação de chave, retenção mínima e alertas de acesso anômalo.
