# SmartPOS + NEXA Garçom em produção

Entrega única: balcão (SmartPOS) e mesa/comanda (Garçom) rodando na Gertec GPOS780 com pagamento real.

## Recomendação de TEF

**Payer — API Localhost, rodando dentro da SmartPOS.**

Motivos:
- É o mesmo Payer já homologado e em produção no totem — reaproveitamos `src/lib/tef/payer/*` sem nova homologação de fluxo.
- O suporte Payer confirmou hoje que a integração no SmartPOS é a mesma API Localhost; muda só o endereço do serviço (no próprio aparelho, não no PC).
- Sem dependência de internet no momento do pagamento e sem o agente Windows (`electron-acbr`) — o app web fala direto com o serviço local da maquininha.
- Gateway fica como opção futura (só faz sentido se a venda rodar fora da maquininha); PayGo continua exclusivo do totem.

## O que falta hoje

Estado atual verificado no código:
- `SmartPos.tsx` e `Garcom.tsx` usam `createMockAdapter` — pagamento é simulado.
- SmartPOS **não grava nada no banco**: não cria `pdv_orders`, itens, nem pagamento. Só mostra tela de "Aprovado".
- Garçom grava mesa/rodadas/itens e fecha a sessão, mas o pagamento é mock e não há registro em pagamentos.
- Nenhuma impressão: tela de recibo diz "impressão será nativa na Fase 3".

## Escopo da entrega

### 1. TEF real (Payer localhost no aparelho)
- Novo módulo `src/lib/tef/payer/smartpos.ts`: mesmo protocolo do Payer, com base URL do serviço local do aparelho, configurável por terminal.
- Adapter `createPayerTefAdapter` passa a ser usado em SmartPOS e Garçom no lugar do mock, escolhendo o provider via `pdv_tef_config` da loja (fallback mock só em ambiente de preview/navegador comum).
- Suporte a crédito, débito, PIX e parcelado; tratamento de cancelamento/abort e reimpressão do último comprovante.
- Nada em `electron-acbr/**`, `electron-totem/payer/**` nem no fluxo PayGo do totem é alterado.

### 2. Persistência da venda
- SmartPOS passa a criar `pdv_orders` + `pdv_order_items` + registro de pagamento (NSU, bandeira, últimos 4, autorização, provider) na aprovação, com canal `smartpos`.
- Garçom grava o mesmo registro de pagamento ao fechar a comanda e vincula à sessão de mesa.
- Guarda de idempotência: uma aprovação TEF nunca gera dois pedidos (mesmo se a tela recarregar).
- Sessão de caixa virtual por operador/terminal, seguindo a regra atual do PDV (sem dinheiro físico).

### 3. Impressão do comprovante TEF
- Impressão na bobina embutida do GPOS780 (via serviço de impressão do aparelho), com via do cliente e via do estabelecimento.
- Botão "Reimprimir último comprovante" na tela de recibo.
- **NFC-e fica para a fase seguinte** (Focus NFe já pronto, entra depois do go-live).

### 4. Configuração, acesso e operação
- Página de configuração do terminal SmartPOS: loja, terminal/número lógico, provider TEF, URL do serviço local, teste de conexão.
- Login/perfil: `waiter` para garçom, operador de balcão para SmartPOS, com restrição às lojas Asa Sul, 114 Norte, Águas Claras e Lago Sul.
- Fechamento/resumo do turno por operador (total vendido, por forma de pagamento).

### 5. Robustez de campo
- Estado de rede: fila local dos itens do carrinho e aviso claro quando o pedido não subiu.
- Tratamento de TEF aprovado com falha ao gravar pedido (não pode perder venda): retry e alerta ao gestor.
- Tela de "pendências" para conferência.

## Checklist para o go-live

1. Confirmar com a Payer o endereço/porta do serviço Localhost dentro da SmartPOS e as credenciais de produção do terminal.
2. Confirmar o método de impressão exposto pelo aparelho (SDK/serviço) — isso define a implementação da bobina.
3. Definir número lógico/terminal por maquininha e cadastrar em `pdv_tef_config`.
4. Homologar 1 aparelho em uma loja piloto (sugestão: Asa Sul) com venda real de valor baixo em crédito, débito e PIX + cancelamento.
5. Rollout para as demais lojas depois de 3 a 5 dias de piloto sem incidente.
6. Fase seguinte: NFC-e via Focus NFe no SmartPOS.

## Detalhes técnicos

- Reuso: `src/lib/tef/payer/{client,types,tefAdapter}.ts`, `src/lib/tef/providerSwitch.ts`, `src/hooks/useTefPayment.tsx`, `src/hooks/useTefReceipts.ts` (leitura; alterações no TEF congelado só se você autorizar).
- Tabelas: `pdv_orders`, `pdv_order_items`, `pdv_tables`, `pdv_table_sessions`, `pdv_table_rounds`, `pdv_tef_config` (+ tabela de pagamentos do pedido se ainda não existir).
- Páginas: `src/pages/SmartPos.tsx`, `src/pages/SmartPosLogin.tsx`, `src/pages/Garcom.tsx`, nova página de configuração do terminal.
- Sem alteração em `/totem`, `/pdv`, PayGo ou NFC-e nesta entrega.
