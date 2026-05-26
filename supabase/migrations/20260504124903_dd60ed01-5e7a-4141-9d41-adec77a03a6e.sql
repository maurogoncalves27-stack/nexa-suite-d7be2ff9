
DROP VIEW IF EXISTS public.pdv_stock_shortages;
CREATE VIEW public.pdv_stock_shortages
WITH (security_invoker = true) AS
SELECT
  s.store_id,
  s.product_id,
  p.name AS product_name,
  p.unit,
  s.quantity AS current_qty,
  s.min_qty,
  CASE
    WHEN s.quantity <= 0 THEN 'out'
    WHEN s.min_qty IS NOT NULL AND s.quantity < s.min_qty THEN 'low'
    ELSE 'ok'
  END AS severity,
  s.updated_at
FROM public.inventory_stock s
JOIN public.inventory_products p ON p.id = s.product_id
WHERE s.quantity <= 0
   OR (s.min_qty IS NOT NULL AND s.quantity < s.min_qty);
