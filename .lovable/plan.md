# E-commerce Grupo Aquela Parmê — Plano de Implementação

Subdomínio `pedir.aquelaparme.com.br`. Marca-mãe **Grupo Aquela Parmê** com 3 abas internas (Parmê / Estrogonofe / Box). 1 CNPJ, 1 cozinha, 1 impressora, 1 pedido, 1 pagamento. Início **somente retirada**, preparado para delivery futuro.

## Decisões já fechadas
- Pagamento: **Mercado Pago** (PIX + cartão). Pedido só vai pro PDV após `payment.status=approved`.
- WhatsApp: Giana monta o pedido no chat e envia link de pagamento MP.
- Analytics: **GA4** em `aquelaparme.com.br` e `pedir.aquelaparme.com.br` + dashboard interno no NEXA.
- Drive: conector já ligado. Eu **não** vou varrer automaticamente — você me aponta cada imagem quando precisar; eu busco via gateway e subo como asset.
- NFC-e: fora desta fase (avaliar após MP→PDV→impressão estarem estáveis). 1 nota por pedido quando entrar.
- Fora do escopo: delivery, login/fidelidade, cupons, app nativo.

## Modelo de dados (migrations)

**Tabelas novas** (todas com GRANT + RLS):
- `ecommerce_stores` — 4 lojas físicas com slug, endereço, horário, telefone, status (aberta/fechada).
- `ecommerce_carts` — efêmero (24h), chave `session_token` OU `whatsapp_phone`, RLS por token.
- `ecommerce_cart_items` — item + brand + qtd + obs + complementos.
- `pdv_orders` ganha colunas: `source` ('site'|'whatsapp'), `brand_breakdown jsonb`, `mp_preference_id`, `mp_payment_id`, `customer_phone`, `customer_name`, `pickup_eta`.
- `ecommerce_events` — log de eventos (view_item, add_to_cart, begin_checkout, purchase) para o dashboard interno.

**Reuso**: `menu_items` + `menu_item_brands` (já existe), `pdv_channels` (1 entry "Site Direto" × 4 lojas reais).

## Edge functions

| Função | Papel |
|---|---|
| `ecommerce-cart` | CRUD do carrinho (token-based, sem auth) |
| `mp-create-preference` | Cria preferência MP, retorna init_point |
| `mp-webhook` | Recebe notificação MP, valida assinatura, chama dispatch |
| `dispatch-paid-order` | Cria `pdv_orders` status='received', dispara impressão e notificação gestor |
| `whatsapp-cliente-order-tools` | Tools da Giana: list_menu, add_to_cart, checkout (gera link MP) |
| `ecommerce-order-status` | Página pública de status do pedido |
| `ga4-server-event` | (opcional) Measurement Protocol para eventos server-side |

## Frontend (`pedir.aquelaparme.com.br`)

Rotas:
- `/` → seletor de loja (4 lojas físicas, mostra qual está aberta)
- `/loja/:slug` → cardápio unificado com abas "Tudo / Parmê / Estrogonofe / Box"
- `/loja/:slug/carrinho` → revisão + nome/telefone + horário retirada
- `/loja/:slug/pagamento` → embed MP (Checkout Pro)
- `/pedido/:id` → status (aguardando pagamento → recebido → preparando → pronto)

Aliases SEO (mesmo conteúdo, meta diferente): `/parme/:loja`, `/estrogonofe/:loja`, `/box/:loja`.

Tema: CSS variables trocam por aba (vermelho/marrom/laranja). Logo do **Grupo Aquela Parmê** no header (você me envia).

## Cozinha (impressão)

Single comanda agrupada por marca com cabeçalho colorido. Reusa infra de impressão do PDV (mesma impressora). Sem KDS.

## Notificação ao gestor

Push + sino (NotificationsBell) quando `dispatch-paid-order` roda.

## Dashboard interno NEXA

Nova rota `/ecommerce` com: pedidos do dia por loja/marca, ticket médio, taxa de cross-brand, funil (view→cart→checkout→pago), top items. Lê `pdv_orders` + `ecommerce_events`.

## Ordem de implementação

1. Migrations + seed das 4 lojas + 1 `pdv_channels` "Site Direto"
2. Storefront completo **sem pagamento** (carrinho funcional, mock checkout) — você valida UX
3. MP: secrets, `mp-create-preference`, `mp-webhook`, `dispatch-paid-order`
4. Página de status + impressão na cozinha + sino do gestor
5. Tools Giana no WhatsApp Cliente (`whatsapp-cliente-order-tools`)
6. GA4 (tag site + tag pedir) + dashboard `/ecommerce`
7. DNS + publish + smoke test ponta-a-ponta

## O que vou pedir quando chegar a hora

- **Etapa 3**: `MERCADOPAGO_ACCESS_TOKEN` e `MERCADOPAGO_WEBHOOK_SECRET` (production) via add_secret
- **Etapa 6**: 2 Measurement IDs GA4 (`G-XXXX` do site e do pedir)
- **Etapa 7**: apontar `pedir.aquelaparme.com.br` → `185.158.133.1`
- **Quando precisar de imagem**: você me diz "pega tal arquivo da pasta X do Drive" e eu busco via connector gateway + subo como asset

## Regra de ouro
`pdv_orders.status='received'` **só** depois de `mp-webhook` validar pagamento aprovado e chamar `dispatch-paid-order`. Nada vai pra cozinha antes disso.

Posso seguir?
