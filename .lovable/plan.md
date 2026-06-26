## Diagnóstico

Existem 10 pedidos em `pdv_orders` com `source = 'site'`, todos de 22/06/2026 (clientes "mauro", "lilian lima", "Cliente Teste"). Os demais pedidos têm `source = NULL` (importados do iFood/legado) e devem ficar.

## O que vou fazer

Deletar tudo que casa com `source = 'site'` em `pdv_orders`, junto com itens e eventos vinculados — sem mexer em nada mais:

1. `DELETE FROM pdv_order_events WHERE order_id IN (SELECT id FROM pdv_orders WHERE source='site')`
2. `DELETE FROM pdv_order_items WHERE order_id IN (...)`
3. `DELETE FROM pdv_orders WHERE source='site'`

Nada de mudança de schema, nada de código.
