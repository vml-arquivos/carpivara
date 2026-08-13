# Modelo de dados

Tabelas atuais: users, user_profiles, organizations, organization_members, wallets, wallet_transactions, query_products, vehicle_queries, vehicle_query_results, saved_vehicles, query_exports, sandbox_vehicles, payments, data_providers e audit_logs.

## Regras
- vehicle_query_results.normalized: contrato interno estável.
- raw_response: resposta original do provedor; em produção deve ser criptografada ou armazenada em cofre/objeto criptografado conforme contrato e LGPD.
- wallet_transactions: razão financeira de créditos; não apagar.
- audit_logs: autenticação, consultas, exportações, ajustes e operações administrativas.
- consultas permanecem no histórico do usuário conforme política de retenção definida juridicamente e pelo contrato do fornecedor.

## Próxima evolução
payment_webhooks, refresh_tokens, api_keys B2B, coupons, subscriptions, invoices, support_tickets, consent_events, data_retention_jobs e provider_costs.
