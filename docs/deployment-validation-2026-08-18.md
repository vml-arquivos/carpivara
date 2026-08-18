# Validação de deployment — 2026-08-18

## Produção
- URL da aplicação: https://carpivara.casadf.com.br
- Painel Coolify: https://coolifycar.casadf.com.br
- Aplicação: `nypsnvexr5rnon2pfpx22zwp`
- Ambiente: `production`

## Commits
- `main` no GitHub: `416dbaf48faf5ff15e6b6a0d1335da681be5bd33` (`feat: consulta FIPE por placa com relatório protegido`)
- O primeiro redeploy foi concluído com a referência antiga `1132ff52354b52abe266f4502e961d0324fa9f96`; não deve ser considerado a versão da mudança.
- A origem Git do Coolify foi corrigida para o SHA completo `416dbaf48faf5ff15e6b6a0d1335da681be5bd33` e salva.
- Novo deployment correto: `hii0vre8j9ftgwna204so9ap`, exibido como `416dbaf`, ainda em andamento no último acompanhamento.

## Último estado observado
- O Coolify já confirmou o SHA correto no log de importação e concluiu a construção da imagem Docker.
- O serviço ainda estava na etapa de substituição/reinicialização do container; é necessário acompanhar até `Success` antes do smoke test público.
- Não registrar neste arquivo senhas, hashes de senha, tokens ou credenciais.

## Próxima validação
1. Confirmar status `Success` do deployment `hii0vre8j9ftgwna204so9ap`.
2. Executar smoke test contra `https://carpivara.casadf.com.br`.
3. Verificar visualmente o fluxo público FIPE, consulta por placa, ausência de fonte/provedor e bloqueio de impressão/PDF para visitante.
4. Verificar que o repositório não contém artefatos temporários ou segredos antes da entrega.

## 2026-08-18 — correção do funil FIPE

Na aplicação de produção do Coolify, o redeploy manual iniciado após o push do commit `a83be20` apareceu na fila como `In progress` usando a referência antiga `416dbaf`. O deployment `84srbiufivxufnlgwwjdhlru` ainda não deve ser considerado publicação da nova versão; é necessário atualizar a referência Git do Coolify para `a83be20` e fazer novo redeploy. Nenhuma credencial foi registrada.

## 2026-08-18 — publicação correta a83be20

Após salvar a referência Git no Coolify e iniciar novo redeploy, o deployment `h8r1hrcw6sywzdopp5wkbted` apareceu como `In progress` com o commit `a83be20`. O log exibido pelo painel confirmou a importação da referência `refs/heads/main` apontando para `a83be20`; o processo estava na etapa de reinicialização do container. A validação pública deve ocorrer somente após o status `Success`.

## 2026-08-18 — redeploy corrigido

A referência incorreta foi substituída pelo SHA confirmado no GitHub: `a83be207175be6af0b6b8c18111e28001820d13f`. O novo deployment `lkv7iqypujhmrnhovxpsifac` foi iniciado pelo Coolify e apareceu como `In progress` com o commit `a83be20`; a tentativa anterior `h8r1hrcw6sywzdopp5wkbted` falhou porque apontava para um SHA inexistente. A aplicação anterior continuou saudável durante a correção.

O deployment `lkv7iqypujhmrnhovxpsifac` avançou para a fase de empacotamento e atualização do container. Os logs confirmaram o commit `a83be207175be6af0b6b8c18111e28001820d13f`, o build da API e do frontend concluído, a imagem Docker criada e a remoção dos containers antigos iniciada. O status ainda estava `In progress` no último acompanhamento.

O deployment `lkv7iqypujhmrnhovxpsifac` terminou com status `Success`, duração aproximada de 1m07s, usando o commit `a83be20` (`a83be207175be6af0b6b8c18111e28001820d13f`). O serviço aparece novamente como `Running` no Coolify.

## Validação pós-deploy

Os logs de runtime do container `nypsnvexr5rnon2pfpx22zwp-153236526876` mostram o servidor iniciado na porta `4000` com ambiente de produção e vários `GET /health` respondendo `200`. O timeout observado no smoke test externo ocorreu durante a janela de propagação/troca do container e não foi acompanhado por erro de inicialização nos logs do runtime.

Fonte operacional: Coolify — https://coolifycar.casadf.com.br/project/e5fnmvitmxb24zn8ae1ygwso/environment/u3vo7bqp4kwer0oty3bxgrff/application/nypsnvexr5rnon2pfpx22zwp/logs

Após o smoke test parcial, os logs de runtime registraram `GET /fipe/brands` com status `200` e duração de `93ms`, indicando que a rota concluiu no servidor. O timeout observado no cliente ficou restrito à sessão externa do smoke test e será revalidado com chamadas isoladas.

O domínio público voltou a responder no navegador após o período de timeout. A aplicação carregou corretamente, porém a sessão persistida de `SUPER_ADMIN` abriu o dashboard autenticado (`/`), com os menus de Administração e Preferências visíveis. A validação da tela pública FIPE deve ser feita após sair dessa sessão, sem alterar dados da conta.
