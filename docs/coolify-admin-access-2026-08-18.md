# Acesso operacional observado — 2026-08-18

Fonte externa consultada: https://coolifycar.casadf.com.br/project/e5fnmvitmxb24zn8ae1ygwso/environment/u3vo7bqp4kwer0oty3bxgrff/application/nypsnvexr5rnon2pfpx22zwp

O painel Coolify v4.3.7 abriu o recurso `carpivara` no ambiente `production`, com status `Running`. O domínio público configurado é `https://carpivara.casadf.com.br`. O painel mostra o usuário operacional `VILSON MARCIO DE LIMA` e oferece os atalhos `Terminal` global e `Terminal` da aplicação, além de `Runtime Logs`, `Deployment Logs`, `Environment Variables`, `Servers` e `Git Source`.

O acesso interno exposto pelo recurso é o container `carpivara` na porta 4000. Nenhuma senha, token ou hash foi registrada neste arquivo. A conta foi verificada e corrigida somente por metadados e atualização parametrizada no terminal autenticado do recurso, sem retornar `password_hash`.
## Consulta e redefinição em 2026-08-18

No terminal autenticado do recurso `carpivara`, a consulta somente leitura confirmou `vilsonmarcio@gmail.com`, nome `Vilson Marcio de Lima`, papel `SUPER_ADMIN` e `active=true`.

A primeira tentativa autorizada de atualização de senha não alterou dados: o shell expandiu `$1` e `$2` dentro do comando SQL, gerando erro PostgreSQL `42601` de sintaxe. Nenhum hash ou senha foi exibido. O comando foi então corrigido para preservar os placeholders SQL parametrizados.

A aplicação pública é `https://carpivara.casadf.com.br` e o acesso operacional foi realizado pelo terminal autenticado do Coolify. A redefinição foi aplicada com `password_enabled=true`, `active=true`, `failed_login_attempts=0` e `locked_until=null`; a validação de login foi concluída com sucesso.
## Redefinição autorizada concluída

A senha temporária foi convertida com bcrypt e aplicada no banco de produção por update parametrizado. A verificação posterior retornou a conta com `role: SUPER_ADMIN`, `active=true`, `password_enabled=true`, `failed_login_attempts=0` e `locked_until=null`. Nenhum hash foi retornado ou registrado. O login por e-mail foi validado na aplicação pública e o menu `Administração` abriu a visão operacional protegida, confirmando o RBAC SUPER_ADMIN.
