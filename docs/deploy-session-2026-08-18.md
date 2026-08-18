# Sessão de deploy — 2026-08-18

O painel Coolify autenticado está em `https://coolifycar.casadf.com.br/project/e5fnmvitmxb24zn8ae1ygwso/environment/u3vo7bqp4kwer0oty3bxgrff`, projeto `carpivara`, ambiente `production`, Coolify v4.3.7.

A aplicação `carpivara` está com status `Running`, domínio `https://carpivara.casadf.com.br`, e o banco `postgress` também está `Running`. O endpoint público antes do redeploy respondeu `{"ok":true,"app":"Carpivara","provider":"real","database":"ok"}` em `https://carpivara.casadf.com.br/health`.

A aplicação está em `https://coolifycar.casadf.com.br/project/e5fnmvitmxb24zn8ae1ygwso/environment/u3vo7bqp4kwer0oty3bxgrff/application/nypsnvexr5rnon2pfpx22zwp`.

A aplicação foi aberta no Coolify pela URL direta, mas a tela `carpivara > Configuration` permaneceu visualmente preta/vazia após aguardar o carregamento. A página HTML foi salva pelo navegador para diagnóstico; a listagem anterior do ambiente continua mostrando aplicação e banco como `Running`.

Redeploy normal confirmado e iniciado pelo painel. A execução abriu a URL `/deployment/2xs4xkzt3am1sehgvd8h5q1l`; o Coolify mostrou `1 deployment`, status `In progress`, origem `Manual` e commit exibido `dc65695` no primeiro instante do acompanhamento. Os logs indicaram clonagem do repositório GitHub antes do build.

Após 31 segundos, a execução seguia `In progress`. Os logs mostraram a leitura do Dockerfile, `npm run build -w apps/api && npm run build -w apps/web`, cópia dos artefatos para a imagem, criação do container e início da remoção dos containers antigos. Ainda não havia status final.

A execução `2xs4xkzt3am1sehgvd8h5q1l` concluiu com status `Success` em aproximadamente 43 segundos. O log final mostrou o novo container criado, iniciado e marcado como `Started`, seguido do encerramento controlado do container de build. O histórico do Coolify passou a exibir a execução manual como `Success`.

O painel exibiu o commit curto `dc65695` nessa execução, embora o branch remoto validado localmente esteja em `dd7cfbc`. A discrepância foi registrada para confirmação por healthcheck e inspeção do Git Source antes de qualquer nova ação; não será iniciado outro redeploy sem necessidade.

Nova execução iniciada pelo Coolify: `tl8rbnuy1dh4dq3ybpjpydl1`, manual, ainda `In progress`. Apesar de `origin/main` ter sido atualizado local e remotamente para `1132ff5`, o log do Coolify registra checkout de `dc656959f58f2fd8bf5fb44d800fb03e1940bf25`, ou seja, a revisão anterior. A publicação correta ainda não foi confirmada; é necessário revisar a configuração `Git Source`/branch/commit do recurso antes de considerar o redeploy concluído.

Na configuração `Git Source`, o recurso confirma repositório `vml-arquivos/carpivara`, branch `main` e agora exibe o campo `Commit SHA` como `1132ff5`. O Coolify sinaliza `You have changes that haven't been saved yet`; a ação pendente é salvar essa alteração antes do redeploy.

O Coolify exibiu o toast `Success — Application source updated!` após salvar o SHA `1132ff5`. O topo ainda mostra `Changes pending`, indicando que a configuração foi salva no recurso mas ainda precisa ser aplicada através de um novo redeploy. O campo persistido na tela permanece `1132ff5`.

Após salvar o source atualizado, o menu `Actions > Redeploy` foi acionado na aplicação. O recurso ainda exibia `Changes pending` no momento da ação; será necessário confirmar no histórico se a execução anterior foi substituída/encerrada e se uma nova execução com `1132ff5` foi criada.

A causa da falha foi confirmada nos logs: o Coolify conseguiu localizar `refs/heads/main` em `1132ff52354b52abe266f4502e961d0324fa9f96`, mas tentou executar `git fetch origin 1132ff5`, resultando em `fatal: couldn't find remote ref 1132ff5`. O campo de source foi atualizado para o SHA completo `1132ff52354b52abe266f4502e961d0324fa9f96` e aguarda o salvamento.

O Coolify exibiu novamente `Success — Application source updated!`; o campo persistido agora contém o SHA completo `1132ff52354b52abe266f4502e961d0324fa9f96`. O indicador `Changes pending` corresponde à aplicação dessa configuração no container por meio do próximo redeploy.

Após o salvamento do SHA completo, o Coolify iniciou novo deployment manual de `main` com commit exibido `1132ff5` e estado `In progress`; o clone deve resolver o hash completo configurado no source. A execução estava ativa por aproximadamente 28 segundos no último acompanhamento.

No deployment ativo `1etpvb8owqzgwivc4kmsxpnw`, o Coolify já passou pelo clone e pela construção da imagem com o hash completo `1132ff52354b52abe266f4502e961d0324fa9f96`; os logs mostram a imagem Docker criada e a etapa de atualização do container em andamento. URL de acompanhamento: https://coolifycar.casadf.com.br/project/e5fnmvitmxb24zn8ae1ygwso/environment/u3vo7bqp4kwer0oty3bxgrff/application/nypsnvexr5rnon2pfpx22zwp/deployment/1etpvb8owqzgwivc4kmsxpnw

O deployment `1etpvb8owqzgwivc4kmsxpnw` terminou com status `Success` após 02m03s. Os logs confirmam container novo iniciado e container de build removido, com `COOLIFY_BRANCH=main` e imagem baseada no commit completo `1132ff52354b52abe266f4502e961d0324fa9f96` (exibido na interface como `1132ff5`).

O smoke test pós-redeploy confirmou healthcheck 200, mas `/api/fipe/status` retornou `enabled=false` e `pdfEnabled=false`, pois as flags de rollout estavam ausentes no ambiente. Após confirmação, o Coolify foi aberto em Environment Variables e `FEATURE_FREE_FIPE=true` foi preenchida no formulário de nova variável; falta salvar a variável e adicionar `FEATURE_REPORT_PDF=true` antes do próximo redeploy.

As duas variáveis de produção foram adicionadas com sucesso pelo Coolify: `FEATURE_FREE_FIPE=true` e `FEATURE_REPORT_PDF=true`. O filtro visual foi aplicado para localizar as flags; o próximo passo é disparar o redeploy para que o processo Node leia as novas variáveis.
GET /health -> 200
GET /api/fipe/status -> 200
GET /api/fipe/references -> 200
GET /api/fipe/brands?vehicleType=cars&reference=336 -> 200
GET /api/fipe/models?vehicleType=cars&brandCode=1&reference=336 -> 200
GET /api/fipe/years?vehicleType=cars&brandCode=1&modelCode=1&reference=336 -> 200
POST /api/fipe/quote -> 201
GET /api/fipe/offers -> 200
GET /api/validar-relatorio/CPF-4L7SFHAWSP17 -> 200
GET /api/fipe/reports/CPF-4L7SFHAWSP17/print -> 200
GET /api/fipe/reports/CPF-4L7SFHAWSP17/pdf -> 200
{
  "health": {
    "ok": true,
    "app": "Carpivara",
    "provider": "real",
    "database": "ok"
  },
  "provider": {
    "enabled": true,
    "pdfEnabled": true,
    "providers": [
      "parallelum",
      "brasilapi"
    ]
  },
  "reference": {
    "code": "336",
    "name": "agosto/2026"
  },
  "brand": {
    "code": "1",
    "name": "Acura"
  },
  "model": {
    "code": "1",
    "name": "Integra GS 1.8"
  },
  "year": {
    "code": "1992-1",
    "name": "1992 Gasolina"
  },
  "quote": {
    "documentCode": "CPF-4L7SFHAWSP17",
    "provider": "parallelum",
    "referenceMonth": "agosto de 2026",
    "value": null
  },
  "offerCount": 6,
  "reportValidation": {
    "authentic": true,
    "reportKind": "FIPE_FREE",
    "reportVersion": 1,
    "provider": "parallelum",
    "documentCode": "CPF-4L7SFHAWSP17",
    "createdAt": "2026-08-18T13:45:13.148Z",
    "status": "VALID",
    "hash": "42bf00325e475b7fce7deb48a56975f19a22c8db7de5135a9ce175bab4f9988e",
    "plate": null,
    "fipeReferenceMonth": "agosto de 2026"
  },
  "printContentType": "text/html; charset=utf-8",
  "pdfContentType": "application/pdf"
}

--- Smoke final v2 ---
GET /health -> 200
GET /api/fipe/status -> 200
GET /api/fipe/references -> 200
GET /api/fipe/brands?vehicleType=cars&reference=336 -> 200
GET /api/fipe/models?vehicleType=cars&brandCode=1&reference=336 -> 200
GET /api/fipe/years?vehicleType=cars&brandCode=1&modelCode=1&reference=336 -> 200
POST /api/fipe/quote -> 201
GET /api/fipe/offers -> 200
GET /api/validar-relatorio/CPF-9RYAYHECLRT7 -> 200
GET /api/fipe/reports/CPF-9RYAYHECLRT7/print -> 200
GET /api/fipe/reports/CPF-9RYAYHECLRT7/pdf -> 200
{
  "health": {
    "ok": true,
    "app": "Carpivara",
    "provider": "real",
    "database": "ok"
  },
  "provider": {
    "enabled": true,
    "pdfEnabled": true,
    "providers": [
      "parallelum",
      "brasilapi"
    ]
  },
  "reference": {
    "code": "336",
    "name": "agosto/2026"
  },
  "brand": {
    "code": "1",
    "name": "Acura"
  },
  "model": {
    "code": "1",
    "name": "Integra GS 1.8"
  },
  "year": {
    "code": "1992-1",
    "name": "1992 Gasolina"
  },
  "quote": {
    "documentCode": "CPF-9RYAYHECLRT7",
    "provider": "parallelum",
    "referenceMonth": "agosto de 2026",
    "valueCents": 1077300,
    "valueLabel": "R$ 10.773,00"
  },
  "offerCount": 6,
  "reportValidation": {
    "authentic": true,
    "reportKind": "FIPE_FREE",
    "reportVersion": 1,
    "provider": "parallelum",
    "documentCode": "CPF-9RYAYHECLRT7",
    "createdAt": "2026-08-18T13:46:48.089Z",
    "status": "VALID",
    "hash": "3413b53e814c6229c2a316ef13f6b6a8bfac920f8fc939472195c28fa9f2c86f",
    "plate": null,
    "fipeReferenceMonth": "agosto de 2026"
  },
  "printContentType": "text/html; charset=utf-8",
  "pdfContentType": "application/pdf"
}
