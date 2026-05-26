DROP VIEW IF EXISTS public.inventory_lot_alerts;

CREATE VIEW public.inventory_lot_alerts
WITH (security_invoker = true) AS
SELECT
  l.id AS lot_id,
  l.store_id,
  s.name AS store_name,
  l.product_id,
  p.name AS product_name,
  p.unit,
  l.lot_number,
  l.quantity,
  l.expiry_date,
  (l.expiry_date - CURRENT_DATE) AS days_to_expiry,
  CASE
    WHEN l.expiry_date < CURRENT_DATE THEN 'expired'
    WHEN (l.expiry_date - CURRENT_DATE) <= 7 THEN 'critical'
    WHEN (l.expiry_date - CURRENT_DATE) <= 15 THEN 'warning'
    WHEN (l.expiry_date - CURRENT_DATE) <= 30 THEN 'attention'
    ELSE 'ok'
  END AS alert_level
FROM public.inventory_lots l
JOIN public.inventory_products p ON p.id = l.product_id
JOIN public.stores s ON s.id = l.store_id
WHERE l.status = 'active' AND l.quantity > 0;