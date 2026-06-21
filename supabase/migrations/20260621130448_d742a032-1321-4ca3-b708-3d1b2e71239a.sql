WITH test_ids AS (
  SELECT id FROM public.pdv_orders
  WHERE customer_name ILIKE 'TESTE%'
     OR customer_name ILIKE '%Teste%'
     OR order_number LIKE 'TST-%'
     OR notes ILIKE 'Pedido teste%'
)
DELETE FROM public.pdv_order_items WHERE order_id IN (SELECT id FROM test_ids);

WITH test_ids AS (
  SELECT id FROM public.pdv_orders
  WHERE customer_name ILIKE 'TESTE%'
     OR customer_name ILIKE '%Teste%'
     OR order_number LIKE 'TST-%'
     OR notes ILIKE 'Pedido teste%'
)
DELETE FROM public.pdv_payments WHERE order_id IN (SELECT id FROM test_ids);

WITH test_ids AS (
  SELECT id FROM public.pdv_orders
  WHERE customer_name ILIKE 'TESTE%'
     OR customer_name ILIKE '%Teste%'
     OR order_number LIKE 'TST-%'
     OR notes ILIKE 'Pedido teste%'
)
DELETE FROM public.pdv_order_events WHERE order_id IN (SELECT id FROM test_ids);

DELETE FROM public.pdv_orders
WHERE customer_name ILIKE 'TESTE%'
   OR customer_name ILIKE '%Teste%'
   OR order_number LIKE 'TST-%'
   OR notes ILIKE 'Pedido teste%';