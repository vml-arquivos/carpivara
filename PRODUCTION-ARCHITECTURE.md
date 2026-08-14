# Arquitetura de produção da CARPIVARA

## Decisão de integração

A plataforma terá três superfícies explicitamente separadas: o **site público** apresenta a proposta, planos e conteúdo editorial; a **área do cliente** exige sessão autenticada e só expõe a carteira, as consultas e os relatórios do próprio titular; a **administração** fica protegida por permissões de servidor e não é vinculada à navegação pública. Nenhuma autorização dependerá apenas da interface: cada rota da API aplicará identidade, papel e permissão antes de ler ou alterar dados.

| Capacidade | Caminho definido | Proteção operacional |
|---|---|---|
| Dados veiculares oficiais | Integração contratada com a Consulta Online SENATRAN/SERPRO | Credenciais somente em runtime; nenhuma coleta por scraping; falha fechada quando a integração não estiver configurada |
| Preço e crédito | Produtos e pacotes em banco de dados, administrados por perfil autorizado | Valores em centavos, idempotência e histórico contábil imutável |
| Pagamento | Checkout hospedado do Asaas com Pix e cartão | Pedido interno antes do checkout, `externalReference`, webhook idempotente e crédito somente após confirmação financeira |
| Relatórios e consultas | Registros vinculados ao proprietário autenticado | Filtro obrigatório por `user_id`, auditoria e exportação autorizada |
| Administração | Rotas administrativas protegidas por RBAC | Sem menu público, sem dados pessoais expostos fora das permissões necessárias |

## Dados veiculares

A fonte oficial identificada é a Consulta Online SENATRAN/WSDenatran, disponibilizada mediante autorização e contratação com o SERPRO. A aplicação não tratará dados de veículo de origem desconhecida como informação oficial e não manterá exemplos fictícios como se fossem produção. Enquanto o contrato e as credenciais não forem inseridos no ambiente, a consulta real permanecerá indisponível de forma explícita e segura.

## Pagamentos

O checkout do Asaas será usado para cobranças avulsas de pacotes de créditos, com Pix e cartão. Cada intento terá uma ordem interna, uma referência externa única, a URL do checkout e estados conciliáveis. A URL de retorno melhora a jornada do usuário, mas a concessão de créditos ocorrerá somente a partir do webhook autenticado e idempotente.

## Estado externo necessário

A implementação pode ser publicada sem segredos. Para ativar o processamento real, ainda serão necessários: chave de API de produção do Asaas e token de autenticação do webhook; contrato e credenciais da Consulta Online SENATRAN/SERPRO; registros de OAuth para Google, Microsoft e Apple; e, se desejado, um subdomínio administrativo dedicado no DNS.

## Referências

[1]: https://www.gov.br/conecta/catalogo/apis/wsdenatran "WSDenatran — Veículos, Condutores e Infrações"
[2]: https://docs.asaas.com/docs/checkout-asaas "Asaas Checkout"
[3]: https://docs.asaas.com/docs/webhook-para-cobrancas "Eventos para cobranças — Asaas"
