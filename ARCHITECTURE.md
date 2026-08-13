# Carpivara — Arquitetura alvo

## Princípios
- Provedor de dados desacoplado da aplicação por adaptadores.
- Resposta bruta preservada para auditoria; UI usa somente o modelo normalizado.
- Ledger de créditos imutável; saldo nunca é alterado sem transação correspondente.
- Consulta é idempotente por operação e tem estorno em falha técnica.
- Sandbox e produção separados por ambiente e credenciais.
- LGPD por design: minimização, finalidade, mascaramento, retenção e trilha de auditoria.

## Domínios
1. Identity: usuários, perfis, sessão, RBAC, MFA futura.
2. Customers/B2B: organizações, membros, subcontas e limites.
3. Wallet: créditos, pacotes, promoções, ajustes e estornos.
4. Billing: gateway, webhooks idempotentes, conciliação e notas futuras.
5. Vehicle Intelligence: produtos, provedores, consultas, normalização e score.
6. Reports: histórico, favoritos, PDF/JSON e compartilhamento controlado.
7. Operations: auditoria, métricas, filas, falhas de provedor e suporte.
8. Growth: landing pages, conteúdo SEO, cupons, indicação e funil.

## Fluxo crítico
Login -> saldo -> escolha produto -> placa -> reserva de créditos -> provedor -> normalização -> persistência -> relatório -> histórico.
Se o provedor falhar antes de resposta válida: estorno automático e evento de auditoria.

## Produção
Web CDN -> reverse proxy/WAF -> API -> PostgreSQL
                                  -> Redis (fila/cache/rate limit)
                                  -> Object Storage (PDFs)
                                  -> Payment Provider
                                  -> Vehicle Data Provider(s)

Nunca expor chave do provedor no frontend.
