# Banco de dados

A CARPIVARA utiliza PostgreSQL. A criação inicial permite bootstrap seguro em banco vazio e o histórico de evolução é controlado pela tabela `schema_migrations`. As migrations aplicadas são transacionais e protegidas por advisory lock.

## Tabelas centrais

| Grupo | Tabelas | Finalidade |
| --- | --- | --- |
| Identidade | `users`, `user_profiles`, `roles`, `permissions`, `role_permissions` | Usuários, perfis, bloqueio de login e autorização extensível. |
| Organização | `organizations`, `organization_members` | Preparação para empresas, membros e subcontas. |
| Carteira | `wallets`, `wallet_transactions`, `payments` | Saldo, ledger e pagamentos/sandbox. |
| Consulta | `query_products`, `vehicle_queries`, `vehicle_query_results`, `sandbox_vehicles` | Produtos configuráveis, requisições, relatório normalizado e massa de testes. |
| Operação | `data_providers`, `saved_vehicles`, `query_exports`, `audit_logs`, `schema_migrations` | Controle de provider, favoritos, exportação, auditoria e versão de schema. |

## Integridade das consultas e créditos

A consulta cria `vehicle_queries` com status `PROCESSING` e registra um lançamento `QUERY` na mesma transação que reduz o saldo. O saldo da carteira é bloqueado com `FOR UPDATE` e possui `CHECK (balance >= 0)`.

Se o provider falhar, a mesma consulta é bloqueada novamente. Enquanto estiver em processamento, uma transação `REFUND` devolve o valor, a consulta passa a `REFUNDED` e o histórico preserva a evidência técnica sem repassar detalhes internos ao cliente.

A combinação de `user_id` com `idempotency_key` é única quando a chave está presente. Isso evita dupla cobrança causada por clique duplo, retry de rede ou reenvio do mesmo pedido.

## Dados sensíveis e retenção

`vehicle_query_results.normalized` é o contrato estável do produto. `raw_response` é reservado à auditoria e deve ser tratado como dado de acesso restrito; em produção, a política de retenção e a necessidade de criptografia devem ser definidas antes de utilizar provider que devolva dados pessoais.

`wallet_transactions` e `audit_logs` são registros de rastreabilidade e não devem ser apagados por rotinas comuns. Qualquer eliminação deve seguir a política de retenção e os requisitos legais aplicáveis.

## Evolução futura

Migrations futuras podem introduzir refresh tokens, eventos de pagamento com webhook, API keys B2B, custos de provider, retenção automatizada, consentimento, cupons e assinaturas. Cada alteração deve ser adicionada como migration nova e validada em cópia do banco antes de deploy.
