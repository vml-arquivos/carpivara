# Segurança e privacidade

- TLS obrigatório; segredos somente no servidor.
- Senhas com hash forte; refresh token rotacionável e MFA para administradores na produção.
- RBAC e permissões por ação.
- Rate limiting por IP + usuário + produto; proteção contra credential stuffing.
- Webhooks com assinatura, idempotência e replay protection.
- Ledger para créditos; transações SQL e locks em saldo.
- Criptografia de respostas sensíveis e backups.
- Logs sem tokens, documentos completos ou payloads sensíveis.
- Retenção e exclusão definidas por finalidade/contrato; registro de consentimento quando aplicável.
- Alertas de abuso: volume anômalo, múltiplas contas, automação, consultas sequenciais e fraude de pagamento.
