# Notas de validação visual

A versão compilada foi aberta no servidor local em viewport desktop. A landing apresentou corretamente a marca CARPIVARA, a hierarquia “Puxe os fatos. Descubra o que importa.”, CTA de consulta, seletor de tema, card de relatório automotivo, benefícios e seção de funcionamento.

O CTA principal levou ao fluxo de autenticação. A tela de acesso apresentou divisão visual premium entre narrativa de produto e formulário, tabs para entrar/criar conta, campos rotulados, botão de retorno e avisos de ambiente seguro. Nenhum corte visual crítico foi observado nas telas verificadas.

As verificações funcionais de login, consulta, idempotência, histórico, estorno e administração estão registradas em `TESTING.md` e foram executadas pelo roteiro `scripts/integration-smoke.sh`.

A nova assinatura vetorial foi aplicada ao cabeçalho e ao rodapé da landing compilada. A verificação em desktop confirmou contraste adequado, leitura nítida em tamanho compacto e coerência com a paleta azul-marinho/dourado; o símbolo comunica escudo, capivara adulta com óculos e detalhe automotivo sem utilizar fundo, textura ou aparência infantil.

## Atualização de identidade e acesso social

A landing local foi revalidada após a troca da marca para a direção visual inspirada na Ideia 5. O símbolo premium com capivara, escudo protetivo e silhueta automotiva foi carregado corretamente, acompanhado de wordmark com `CAR` em dourado e `PIVARA` em grafite, alinhado à paleta azul-marinho, grafite, dourado, prata e branco.

A tela de acesso foi verificada em viewport desktop. Ela apresenta os controles de Google, Microsoft e Apple, um separador claro para login por e-mail e senha e a área de cadastro com confirmação de senha e consentimentos obrigatórios. Sem credenciais OIDC de runtime, os controles sociais são exibidos de forma segura e desabilitada, prevenindo uma tentativa de login que falharia para a pessoa usuária. A captura correspondente é `screenshots/127_0_0_1_2026-08-14_03-00-30_6293.webp`.

## Validação em produção — commit e699db5

O deployment manual do commit `e699db5` foi concluído com status **Success** no Coolify e a aplicação permanece em estado **Running**. O endpoint público `https://carpivara.casadf.com.br/health` retornou `{"ok":true,"app":"Carpivara","provider":"mock","database":"ok"}`, confirmando disponibilidade da API e conexão com o banco. A primeira navegação à raiz pública ocorreu imediatamente após o deploy e apresentou área de renderização ainda em carregamento; uma nova verificação será realizada após a estabilização dos assets.
A verificação subsequente da raiz pública confirmou o carregamento completo da landing, do símbolo premium e da paleta aprovada. A tela de acesso em produção também foi aberta com sucesso: as abas de entrada e cadastro, os campos de e-mail/senha e os controles de Google, Microsoft e Apple estão presentes. Os provedores permanecem desabilitados até a inclusão das credenciais OIDC de runtime, comportamento intencional e seguro.
