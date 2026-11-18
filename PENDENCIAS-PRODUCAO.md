# Pendências do BL Buscar antes de entrar no ar

Itens que dependem de informação, conta ou acesso fora do código.

## Dados da empresa (hoje como `[PREENCHER]`)
- Razão social, CNPJ, endereço, WhatsApp e Instagram: `apps/api/src/lib/brand.ts` e `apps/web/src/shared/brand.ts` (campo `legal`). Os dois arquivos precisam ficar iguais (o teste `marca` confere).
- Grupo: rodapé usa "Uma plataforma Sorte Tech" e o link https://bolaolivre.com.br (`group` em `brand.ts`); confirme o texto e o link finais.
- Revisar `TEXTOS-LEGAIS.md` com esses dados antes de publicar termos e política de privacidade.

## Identidade visual
- Logotipo, cores e capas atuais são provisórios. Quando houver o definitivo: `scripts/brand/build-logos.py`, `scripts/brand/rasterize.mjs`, cores em `brand.ts` e `tokens.css`.
- Registro da marca BL Buscar (INPI).

## Infraestrutura
- Aplicação nova no Coolify, com banco, segredos e usuários próprios (nada compartilhado com outro sistema).
- DNS no Cloudflare: `buscarr.com.br` e `admin.buscarr.com.br`.
- E-mail: autenticar o domínio no provedor de envio (SPF, DKIM) para `no-reply@buscarr.com.br`; caixa `contato@buscarr.com.br`.
- Login com Google/Microsoft/Apple: novos redirecionamentos em `OAUTH-SETUP.md`.
- Pagamento: chaves e webhook do BL Buscar no gateway.
- Credify: credenciais do BL Buscar nas variáveis do Coolify.
- Google: Search Console, IndexNow e, se quiser, Analytics (`GA_MEASUREMENT_ID` vem vazio; nada é carregado sem ele).
- Depois do primeiro deploy: seguir `docs/TESTE-PRODUCAO.md`.
