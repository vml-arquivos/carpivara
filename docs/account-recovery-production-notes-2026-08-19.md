# Recuperação de conta — observações de produção

- Aplicação Carpivara no Coolify: `nypsnvexr5rnon2pfpx22zwp`, ambiente `production`.
- Domínio público: `https://carpivara.casadf.com.br`.
- O painel estava autenticado como administrador e indicava `Running`, porém com `Changes pending`.
- A página de Environment Variables não mostrou variáveis de e-mail/SMPP ao filtrar por `SMTP`; somente nomes de runtime foram observados, sem copiar valores secretos.
- A aplicação exibe uma notificação do Coolify informando que não há canal de notificações configurado; isso é separado do envio transacional da aplicação.
- A implementação deve usar variáveis de runtime para o e-mail, nunca versionar credenciais.

Fonte consultada: painel autenticado do Coolify em `https://coolifycar.casadf.com.br/project/e5fnmvitmxb24zn8ae1ygwso/environment/u3vo7bqp4kwer0oty3bxgrff/application/nypsnvexr5rnon2pfpx22zwp/environment-variables`.
## Redeploy corrigido

Em 19/08/2026, a origem Git do Coolify foi atualizada para o SHA completo `0557f256d25bd203b47cc006ef616918ddf5dd8a` da branch `main`, evitando a falha observada ao usar apenas o hash curto. O deployment manual `av8yqgnz9p22idbbwigak6ch` foi iniciado e, no último acompanhamento, permanecia em andamento durante a instalação/build. Não foram registrados valores de variáveis secretas.

Os deployments anteriores com o mesmo commit curto e com `c6f5596` foram marcados como falhos; o novo deployment deve ser acompanhado até o status final antes da validação funcional.

---
## Validação pública do novo container

Após o redeploy, `https://carpivara.casadf.com.br/health` respondeu `{"ok":true,"app":"Carpivara","database":"ok"}`. A página pública `https://carpivara.casadf.com.br/` também carregou normalmente com o título `CARPIVARA | Consulta veicular inteligente`, mantendo os CTAs e o acesso de autenticação. Esta verificação confirma disponibilidade do serviço, mas os fluxos autenticados de perfil e recuperação ainda precisam ser validados em sessão autenticada/teste funcional.

---
## Resultado final do deployment

O Coolify registrou o deployment manual do commit `0557f25` como **Success**, com duração de aproximadamente 1 minuto e 47 segundos. O serviço permaneceu em `Running`. O endpoint `/health` respondeu com aplicação e banco OK, e a página inicial pública carregou normalmente.

A configuração de origem permanece baseada no SHA completo do commit publicado. O envio efetivo de e-mails depende da configuração de SMTP em variáveis de runtime, conforme documentado no `DEPLOY-COOLIFY.md`; nenhuma credencial foi adicionada ao repositório.

---
## Validação visual dos fluxos públicos

Na aplicação publicada, o botão `Entrar` abriu a tela de autenticação atualizada. O link `Esqueci minha senha` abriu o formulário `Recupere seu acesso`, com campo de e-mail e botão `Enviar link de recuperação`. O layout carregou sem erro aparente e preservou o cadastro gratuito e o login existentes.

A validação do envio real de e-mail permanece condicionada às credenciais SMTP de produção, que não estavam configuradas no painel quando a implementação foi verificada.

---
## Teste funcional seguro de recuperação

Na produção, foi enviada uma solicitação com o endereço inexistente `qa-recovery-2026@example.invalid`. A interface exibiu a resposta genérica: `Se o e-mail estiver cadastrado, enviaremos as instruções para redefinir sua senha.` Nenhum e-mail real foi disparado e não houve exposição sobre a existência de contas.

---
