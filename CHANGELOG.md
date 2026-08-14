# Changelog

## 0.4.0 — Hardening e experiência premium

### Corrigido

- Corrigida a compilação TypeScript adicionando as declarações tipadas compatíveis com `bcryptjs`.
- Corrigida a ausência de controle de concorrência funcional com idempotência por usuário e chave de requisição.
- Corrigido o risco de perda de créditos em timeout ou falha de provider com estorno transacional auditado.
- Corrigida a ausência de mensagem humana para falhas de consulta e autenticação.

### Adicionado

- Mecanismo de migrations versionadas, com controle de aplicação em banco e índices de integridade.
- Campos de bloqueio de login, log de acesso e metadados para operações críticas.
- Camada extensível de permissões e rotas administrativas protegidas.
- Cenários sandbox adicionais: IPVA, gravame, recall, furto/roubo, resposta incompleta, multas e timeout.
- Consulta salva por ID, filtro de histórico, exportação JSON autenticada e compra sandbox auditada.
- Landing comercial, autenticação, dashboard responsivo, relatório reorganizado, carteira, preferências e painel administrativo condicional.
- Modo claro, escuro e sistema com persistência local.
- Metadados SEO aprimorados e JSON-LD inicial.
- Testes unitários, roteiro de validação integrada e documentação de provider real.

### Segurança

- Logs estruturados com remoção de chaves sensíveis.
- Rate limit global e específico de login configuráveis por ambiente.
- Senhas protegidas por hash bcrypt; tokens expiram e não carregam dados sensíveis adicionais.
- Respostas brutas do provider permanecem no backend e o armazenamento pode ser desativado por ambiente.
- Seed e compra de créditos sandbox deixam de ser habilitados por padrão no código; devem ser ativados explicitamente por variável.
