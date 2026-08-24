# BUSCARR 0.3.3 — acesso somente por senha

## Resultado

O aplicativo autenticador deixou de ser obrigatório. O acesso da equipe, inclusive do SUPER_ADMIN, funciona com e-mail e senha.

## O que mudou

- Nova configuração `TEAM_TOTP_REQUIRED`.
- O valor padrão é `false`: acesso somente por senha.
- As sessões da equipe continuam sendo gravadas e validadas no banco.
- O código do autenticador foi preservado e pode ser reativado no futuro com `TEAM_TOTP_REQUIRED=true`.
- Nenhuma regra de consulta, relatório, pagamento, carteira ou permissão foi alterada.

## Produção no Coolify

Adicione esta variável à aplicação:

```text
TEAM_TOTP_REQUIRED=false
```

Depois faça o redeploy da versão 0.3.3.

## Acesso imediato ao container atual

O arquivo `HOTFIX-ACESSO-SOMENTE-SENHA.sh` cria backup, desliga o pedido do autenticador no container atual, cria uma nova senha temporária para `vilsonmarcio@gmail.com`, reinicia somente a aplicação BUSCARR e valida o healthcheck.

No servidor, execute:

```bash
bash HOTFIX-ACESSO-SOMENTE-SENHA.sh
```

A alteração feita diretamente no container é temporária e será substituída no próximo redeploy. O redeploy da versão 0.3.3 torna a configuração permanente.

## Validação

- Compilação da API: aprovada.
- Compilação do site: aprovada.
- Testes automatizados: 51 aprovados, 0 falhas.
- Sintaxe do hotfix: aprovada.

## Segurança

Como o segundo fator ficará desligado, use uma senha longa, exclusiva da BUSCARR e nunca a compartilhe. Troque a senha temporária logo após o primeiro acesso.
