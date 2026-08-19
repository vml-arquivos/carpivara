# Recuperação de conta — observações de produção

- Aplicação Carpivara no Coolify: `nypsnvexr5rnon2pfpx22zwp`, ambiente `production`.
- Domínio público: `https://carpivara.casadf.com.br`.
- O painel estava autenticado como administrador e indicava `Running`, porém com `Changes pending`.
- A página de Environment Variables não mostrou variáveis de e-mail/SMPP ao filtrar por `SMTP`; somente nomes de runtime foram observados, sem copiar valores secretos.
- A aplicação exibe uma notificação do Coolify informando que não há canal de notificações configurado; isso é separado do envio transacional da aplicação.
- A implementação deve usar variáveis de runtime para o e-mail, nunca versionar credenciais.

Fonte consultada: painel autenticado do Coolify em `https://coolifycar.casadf.com.br/project/e5fnmvitmxb24zn8ae1ygwso/environment/u3vo7bqp4kwer0oty3bxgrff/application/nypsnvexr5rnon2pfpx22zwp/environment-variables`.
