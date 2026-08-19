# Validação da correção Consulta zero e conta

- Commit publicado: `39d18cd` — `fix: remover placa da consulta zero e destacar conta`.
- Alterações locais validadas por `npm test`: build backend/frontend e 7 testes do backend aprovados.
- Redeploy manual iniciado no Coolify em 19/08/2026, deployment `oqcqwn7xwvzuwimkzsohwecr`, status observado como `In progress`.
- O deployment anterior de gestão de perfil e recuperação de senha permanece como `Success`; nenhum segredo foi registrado neste arquivo.
- Validação pública pendente após a conclusão do novo rollout: confirmar modo manual da FIPE e atalho `Editar usuário e senha` no dashboard.

O build Docker avançou até criação do container e atualização do serviço; o Coolify ainda mostrava `In progress` durante a última verificação, sem erro de compilação ou healthcheck registrado. A aplicação geral permanecia `Running` enquanto o rollout finalizava.

A validação pública após o deployment `oqcqwn7xwvzuwimkzsohwecr` revelou que o Coolify utilizou a referência antiga `0557f25`, não o commit recém-publicado `39d18cd`: a página `/fipe` ainda exibe a aba e o campo de placa. O deployment antigo ficou `Success`, mas precisa ser corrigida a referência Git no Coolify antes do redeploy final.

A origem Git do Coolify estava fixada no SHA antigo `0557f256d25bd203b47cc006ef616918ddf5dd8a`. O campo foi atualizado para o SHA completo correto do commit `39d18cdd2fe5a9323cabdce22093ece0baa5cfe6`; ainda falta salvar a alteração e iniciar o redeploy definitivo.

A referência Git foi salva com sucesso no Coolify e o redeploy correto foi iniciado usando o commit `39d18cd`, deployment `dsvfj6tfiqkyi9eqcb5uufs8`. O histórico passou a mostrar `In progress Manual 39d18cd`; a validação pública será repetida somente após o status ficar `Success`.

O deployment `dsvfj6tfiqkyi9eqcb5uufs8` avançou para a compilação do backend e do frontend; não há erro visível nos logs até este ponto. O serviço ainda aparece como `In progress` e a validação pública aguarda o encerramento do rollout.

O deployment `dsvfj6tfiqkyi9eqcb5uufs8` concluiu a construção da imagem e chegou à etapa de criação do container com as variáveis de runtime, mas o Coolify ainda mantém o item como `In progress` durante a troca dos containers antigos. Não há falha reportada nos logs observados.

Validação pública após o deployment `dsvfj6tfiqkyi9eqcb5uufs8`: `https://carpivara.casadf.com.br/fipe` mostra diretamente `Escolha o veículo` com os campos Tipo, Marca, Modelo e Ano. Não há campo, aba ou instrução de consulta por placa. A página continua exibindo a Consulta zero gratuita e os próximos produtos comerciais como `Em breve`.

