## Diagnóstico

Encontrei dados de teste da Giana ainda no banco e a página "Testes Giana" (`/crm-tests`) ativa no menu.

**No banco:**
- `reservations`: 4 reservas de teste (3 "Gustavo" + 1 "Helena", todas com telefone `619999000x`).
- `pdv_orders`: 2 pedidos com cliente "Teste" / "Teste Cliente" e telefone `61999999999` (+ itens e eventos vinculados).
- `chat_conversations`: 33 conversas atreladas a `session_id` registrado em `chat_test_runs` (runs da bateria automatizada da Giana).
- `whatsapp_customer_conversations`, `ecommerce_carts`, `pdv_whatsapp_carts`: 0 registros de teste hoje — incluo no critério mesmo assim para o futuro.

**Na UI:**
- `src/pages/CrmTests.tsx` (página)
- `src/App.tsx` linhas 83 e 384 (lazy import + rota `/crm-tests`)
- `src/components/AppSidebar.tsx` linha 214 (item "Testes Giana")
- `src/components/AppLayout.tsx` linha 141 (PAGE_TITLES)

## O que vou fazer

### 1. Migration de limpeza (Lovable Cloud)

Critério de "teste Giana" (memória `giana-test-names`):
- `name/customer_name ILIKE 'teste%'` OU `ILIKE 'gustavo'` OU `ILIKE 'helena'` (Helena + 619999000x foi da mesma bateria)
- OU `phone/customer_phone LIKE '%619999000%'` (inclui 61999999999)

Tabelas afetadas (em ordem, respeitando FKs):
- `pdv_order_events` e `pdv_order_items` dos `pdv_orders` que casam → depois `pdv_orders`
- `pdv_whatsapp_carts` que casam
- `ecommerce_cart_items` dos `ecommerce_carts` que casam → depois `ecommerce_carts`
- `reservations` que casam
- `whatsapp_customer_messages` das `whatsapp_customer_conversations` que casam → depois `whatsapp_customer_conversations`
- `chat_conversations` cujo `session_id` está em `chat_test_runs` → depois `chat_test_runs` inteira (a página que a alimenta vai deixar de existir)

Sem alteração de schema, só `DELETE`.

### 2. Remover a página "Testes Giana"

- Apagar `src/pages/CrmTests.tsx`.
- `src/App.tsx`: remover `const CrmTests = lazy(...)` (linha 83) e a `<Route path="/crm-tests" ...>` (linha 384).
- `src/components/AppSidebar.tsx`: remover o item `{ title: "Testes Giana", url: "/crm-tests", ... }` (linha 214).
- `src/components/AppLayout.tsx`: remover entrada de PAGE_TITLES para `/crm-tests` (linha 141).

Nada mais é tocado (Giana em produção, edge functions, código de chat, etc. ficam intactos).
