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
