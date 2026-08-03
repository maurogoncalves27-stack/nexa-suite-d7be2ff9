# Plano: Fluxo unificado de pedidos, comandas e NFC-e

## Objetivo
Garantir que o fluxo de vendas funcione exatamente assim:

- Cliente pode pedir por: **Totem**, **iFood**, **Site/WhatsApp**.
- **NFC-e** de pedidos iFood / Site / WhatsApp: **impressa no PDV** da loja.
- **NFC-e** de pedidos no Totem: **impressa no próprio Totem**.
- **Todas as comandas** (cozinha + cupom cliente) vão para o **PDV da loja**.
- No PDV, o operador pode **escolher em qual impressora** sairá cada impressão.

```text
Canal        Emite NFC-e onde?     Comanda/cupom onde?   Quem seleciona impressora?
Totem        Totem (DANFE)         PDV da loja           PDV (automático por função)
iFood        PDV (DANFE)           PDV da loja           PDV (manual ou por função)
Site/Zap     PDV (DANFE)           PDV da loja           PDV (manual ou por função)
Balcão PDV   PDV (DANFE)           PDV da loja           PDV (manual ou por função)
```

## Estado atual verificado

- **Totem**: já cria `pdv_orders` com `closure_channel = 'totem'` e chama `closeOrder({ printTargets: ['nfce','kitchen'] })`. A NFC-e é emitida pela Focus NFe e a DANFE imprime no Totem via `window.electron.printUrl`; a comanda da cozinha é roteada para as impressoras `kitchen/both` da loja física (`routePrintOrder`).
- **iFood / Site / WhatsApp**: pedidos aparecem no `/pdv-novo`, mas **não disparam fechamento fiscal automático** nem impressão de cupom cliente. Só a comanda pode ser reimpressa manualmente via `printNewOrder`.
- **Balcão (`BalcaoTab`)**: cria pedido com `status = 'concluded'`, mas **não emite NFC-e nem imprime nada**.
- **Seleção de impressora**: o roteamento é automático por `print_role` (`customer`, `kitchen`, `both`, `totem`). Não há escolha manual de impressora no momento da ação.

## Entregáveis

### 1. Fechamento fiscal automático para iFood / Site / WhatsApp

- No `/pdv-novo`, ao avançar o pedido para `ready` (pronto para retirada) ou `dispatched` (despachado), disparar `closeOrder` com o `channel` correto (`ifood` ou `whatsapp`).
- `closeOrder` já emite a NFC-e via Focus NFe e, se houver DANFE, imprime no PDV via `window.electron.printUrl`.
- Após a NFC-e, imprimir cupom do cliente + comanda da cozinha no PDV (`printTargets: ['nfce','customer','kitchen']`).
- Garantir que a impressão só ocorra uma vez por pedido (usar `closure_status` e `closure_id` já existentes em `pdv_orders`).

### 2. Integrar Balcão com fechamento fiscal

- Substituir a finalização direta de `BalcaoTab` por uma chamada a `closeOrder` (ou função equivalente).
- Inserir o pagamento em `pdv_payments` e depois chamar `closeOrder` com `channel: 'pdv'`.
- Suportar pagamento em dinheiro, cartão (TEF) e PIX no balcão, quando aplicável.

### 3. Seleção manual de impressora no PDV

- Adicionar, no modal de ações do pedido do `/pdv-novo`, uma opção "Imprimir em..." que lista as impressoras ativas da loja.
- Permitir escolher: **Comanda da cozinha**, **Cupom do cliente** ou **Ambos**.
- Ao confirmar, chamar `routePrintOrder` com `manual: true` e enviar apenas para a impressora selecionada (sobrescrevendo o roteamento por `print_role`).
- Manter o atalho rápido "Imprimir comanda" / "Imprimir cupom" usando o roteamento automático por função.

### 4. Garantir canais por loja

- Assegurar que toda loja física tenha os canais: `balcao`, `ifood`, `whatsapp`, `totem`, `salao`.
- O `ensureBalcaoChannel` já existe; criar função similar ou migration para criar os demais canais padrão, se ausentes.

### 5. Configuração de impressoras por papel

- **Totem**: impressora com `print_role = 'totem'` (usada apenas para DANFE/senha do Totem).
- **PDV**: impressoras com `print_role = 'customer'`, `kitchen` ou `both`.
- Documentar no painel de impressoras que a função `totem` é exclusiva do Totem e não imprime comandas do PDV.

## O que não muda

- **TEF**: continua chaveado PayGo/Payer conforme configuração de loja (`pdv_tef_config`).
- **Focus NFe**: mesmo token por CNPJ/ambiente, compartilhado entre Totem e PDV da mesma loja.
- **Cardápio**: continua vindo de `menu_items` para todos os canais.
- **iFood Homologação**: não será usada para testes de PDV/Totem.

## Critérios de aceitação

1. Pedido feito no Totem emite NFC-e no Totem e imprime comanda na cozinha do PDV.
2. Pedido iFood concluído emite NFC-e no PDV e imprime cupom + comanda no PDV.
3. Pedido Site/WhatsApp concluído emite NFC-e no PDV e imprime cupom + comanda no PDV.
4. Venda do Balcão emite NFC-e e imprime cupom + comanda no PDV.
5. Operador do PDV pode escolher a impressora específica antes de imprimir.
6. Nenhuma impressão duplicada ocorre para o mesmo pedido.
