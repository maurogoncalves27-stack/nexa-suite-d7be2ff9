## Escopo aprovado (recapitulando)

Cardápio único da empresa, com:
- Pausa de item por loja (Coca pausada em Asa Norte some no totem, smartpos e site daquela loja).
- Foto e nome vindos da ficha técnica; trocar lá atualiza tudo.
- Replicar disponibilidade entre lojas — **total** (cardápio inteiro) ou **por categoria**.
- Baixa de estoque automática a partir da ficha técnica em **todos** os canais, inclusive iFood (cardápio iFood é 100% igual ao nosso).
- Estorno no cancelamento.

## Base que já existe

- `menu_items` + `menu_item_brands` + `menu_item_stores(is_available)` + `recipes` + `recipe_ingredients` + `inventory_stock` + `pdv_stock_consumption_log` + RPC `pdv_consume_order_stock(_order_id)` (lê a ficha técnica e dá baixa).
- Site `/pedir/:slug`, Totem e SmartPOS já leem `menu_item_stores.is_available`.

## O que vou implementar

### Backend (migração única)
1. **`pdv_reverse_order_stock(_order_id)`** — devolve ingredientes consumidos ao estoque, registra movimento `adjustment / pdv_order_cancel`, limpa `stock_consumed_at`.
2. **Trigger `trg_pdv_orders_status_stock`** em `pdv_orders AFTER UPDATE OF status`:
   - Status passa para `confirmed / preparing / ready / dispatched / concluded` e ainda não consumiu → chama `pdv_consume_order_stock`.
   - Status passa para `cancelled` e já tinha consumido → chama `pdv_reverse_order_stock`.
   - Cobre PDV-Novo, iFood (webhook/poll usam `pdv_advance_order_status`), Totem e Site automaticamente — sem precisar editar edge functions.

### Frontend — página `/cardapio` (`src/pages/Menu.tsx`)
3. Listar **todos os itens da marca** (hoje só lista itens com linha em `menu_item_stores` para a loja ativa — itens novos somem).
4. Em cada card, **toggle "Disponível em [loja ativa]"** que faz upsert/delete em `menu_item_stores` (insere `is_available=true` quando liga, deleta a linha quando desliga = pausado).
5. Badge "Pausado em N lojas" no card quando aplicável.
6. Novo botão **"Replicar"** no topo abrindo `ReplicateMenuDialog`:
   - Loja origem (default = loja ativa).
   - Lojas destino (multi-select).
   - Modo: **Cardápio inteiro** ou **Por categoria** (multi-select de categorias).
   - Copia exatamente as linhas de `menu_item_stores` da origem para as destino (sobrescreve só o conjunto selecionado).

### Editor de item (`MenuItemEditorDialog.tsx`)
7. Quando o item tem `recipe_id`, exibir badge **"Foto e nome vêm da ficha técnica · Editar em /receitas"** e travar os campos. Trocar lá reflete em site/totem/SmartPOS de toda a empresa (já é assim na vitrine).

## Fora de escopo agora
- Editor da página `/cardapio` continua igual exceto pela badge da foto.
- Sem mexer em `/pdv` antigo, `pos_sales` ou Saipos.
- iFood em produção fica intacto — a baixa de estoque entra automaticamente via trigger.

## Ordem
Migração (1+2) → Menu.tsx (3-6) → ReplicateMenuDialog novo → editor com badge (7).

Aprova pra eu seguir?