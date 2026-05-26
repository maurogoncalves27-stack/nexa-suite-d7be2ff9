CREATE OR REPLACE FUNCTION public.suggest_purchases()
 RETURNS TABLE(product_id uuid, product_name text, unit text, category text, total_stock numeric, total_min numeric, total_max numeric, qty_to_buy numeric, average_cost numeric, estimated_cost numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH agg AS (
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      p.unit,
      p.category,
      COALESCE(SUM(s.quantity), 0) AS total_stock,
      COALESCE(SUM(s.min_qty), 0) AS total_min,
      COALESCE(SUM(s.max_qty), 0) AS total_max,
      p.average_cost
    FROM public.inventory_products p
    LEFT JOIN public.inventory_stock s ON s.product_id = p.id
    LEFT JOIN public.stores st ON st.id = s.store_id AND st.is_virtual = false
    WHERE p.is_active = true
      AND COALESCE(p.product_type, 'insumo') NOT IN ('produzido','personalizado')
    GROUP BY p.id, p.name, p.unit, p.category, p.average_cost
  )
  SELECT
    product_id, product_name, unit, category,
    total_stock, total_min, total_max,
    GREATEST(total_max - total_stock, total_min - total_stock, 0) AS qty_to_buy,
    average_cost,
    GREATEST(total_max - total_stock, total_min - total_stock, 0) * COALESCE(average_cost, 0) AS estimated_cost
  FROM agg
  WHERE total_min > 0 AND total_stock < total_min
  ORDER BY (total_min - total_stock) DESC;
$function$;