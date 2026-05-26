CREATE OR REPLACE FUNCTION public.consolidated_purchase_plan()
RETURNS TABLE (
  product_id uuid,
  product_name text,
  unit text,
  qty_factory numeric,
  qty_stores numeric,
  qty_open_quotations numeric,
  qty_to_buy numeric,
  average_cost numeric,
  estimated_cost numeric,
  sources text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH factory AS (
    SELECT (p->>'product_id')::uuid AS product_id,
           GREATEST(COALESCE((p->>'deficit')::numeric, 0), 0) AS qty
      FROM (SELECT to_jsonb(fp) AS p FROM public.factory_weekly_plan() fp) x
     WHERE (p->>'level') = 'material'
  ),
  stores AS (
    SELECT s.product_id, COALESCE(SUM(s.qty_to_buy), 0) AS qty
      FROM public.suggest_purchases() s
     GROUP BY s.product_id
  ),
  open_q AS (
    SELECT qi.product_id, COALESCE(SUM(qi.quantity), 0) AS qty
      FROM public.quotation_items qi
      JOIN public.quotations q ON q.id = qi.quotation_id
     WHERE q.status = 'open' AND qi.product_id IS NOT NULL
     GROUP BY qi.product_id
  ),
  joined AS (
    SELECT COALESCE(f.product_id, s.product_id) AS pid,
           COALESCE(f.qty, 0) AS qf,
           COALESCE(s.qty, 0) AS qs
      FROM factory f
      FULL OUTER JOIN stores s ON s.product_id = f.product_id
  )
  SELECT
    j.pid AS product_id,
    ip.name AS product_name,
    ip.unit AS unit,
    j.qf AS qty_factory,
    j.qs AS qty_stores,
    COALESCE(o.qty, 0) AS qty_open_quotations,
    GREATEST((j.qf + j.qs) - COALESCE(o.qty, 0), 0) AS qty_to_buy,
    ip.average_cost,
    GREATEST((j.qf + j.qs) - COALESCE(o.qty, 0), 0) * COALESCE(ip.average_cost, 0) AS estimated_cost,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN j.qf > 0 THEN 'fabrica' END,
      CASE WHEN j.qs > 0 THEN 'lojas' END,
      CASE WHEN COALESCE(o.qty, 0) > 0 THEN 'cotacao_aberta' END
    ], NULL) AS sources
  FROM joined j
  JOIN public.inventory_products ip ON ip.id = j.pid
  LEFT JOIN open_q o ON o.product_id = j.pid
  WHERE GREATEST((j.qf + j.qs) - COALESCE(o.qty, 0), 0) > 0
  ORDER BY ip.name;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.consolidated_purchase_plan() TO authenticated;