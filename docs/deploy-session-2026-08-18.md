# Sessão de deploy — 2026-08-18

O painel Coolify autenticado está em `https://coolifycar.casadf.com.br/project/e5fnmvitmxb24zn8ae1ygwso/environment/u3vo7bqp4kwer0oty3bxgrff`, projeto `carpivara`, ambiente `production`, Coolify v4.3.7.

A aplicação `carpivara` está com status `Running`, domínio `https://carpivara.casadf.com.br`, e o banco `postgress` também está `Running`. O endpoint público antes do redeploy respondeu `{"ok":true,"app":"Carpivara","provider":"real","database":"ok"}` em `https://carpivara.casadf.com.br/health`.

A aplicação está em `https://coolifycar.casadf.com.br/project/e5fnmvitmxb24zn8ae1ygwso/environment/u3vo7bqp4kwer0oty3bxgrff/application/nypsnvexr5rnon2pfpx22zwp`.

A aplicação foi aberta no Coolify pela URL direta, mas a tela `carpivara > Configuration` permaneceu visualmente preta/vazia após aguardar o carregamento. A página HTML foi salva pelo navegador para diagnóstico; a listagem anterior do ambiente continua mostrando aplicação e banco como `Running`.

Redeploy normal confirmado e iniciado pelo painel. A execução abriu a URL `/deployment/2xs4xkzt3am1sehgvd8h5q1l`; o Coolify mostrou `1 deployment`, status `In progress`, origem `Manual` e commit exibido `dc65695` no primeiro instante do acompanhamento. Os logs indicaram clonagem do repositório GitHub antes do build.

Após 31 segundos, a execução seguia `In progress`. Os logs mostraram a leitura do Dockerfile, `npm run build -w apps/api && npm run build -w apps/web`, cópia dos artefatos para a imagem, criação do container e início da remoção dos containers antigos. Ainda não havia status final.

A execução `2xs4xkzt3am1sehgvd8h5q1l` concluiu com status `Success` em aproximadamente 43 segundos. O log final mostrou o novo container criado, iniciado e marcado como `Started`, seguido do encerramento controlado do container de build. O histórico do Coolify passou a exibir a execução manual como `Success`.

O painel exibiu o commit curto `dc65695` nessa execução, embora o branch remoto validado localmente esteja em `dd7cfbc`. A discrepância foi registrada para confirmação por healthcheck e inspeção do Git Source antes de qualquer nova ação; não será iniciado outro redeploy sem necessidade.
