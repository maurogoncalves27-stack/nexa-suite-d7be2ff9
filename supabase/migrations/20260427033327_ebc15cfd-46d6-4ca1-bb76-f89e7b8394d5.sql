CREATE OR REPLACE FUNCTION public.factory_weekly_plan()
 RETURNS TABLE(level text, source text, recipe_id uuid, recipe_name text, product_id uuid, product_name text, unit text, total_qty numeric, factory_stock numeric, deficit numeric, store_count integer, manual_qty numeric, auto_qty numeric, details jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_factory_id uuid;
  v_central_id uuid;
BEGIN
  SELECT id INTO v_factory_id FROM stores
   WHERE store_type = 'fabrica' AND COALESCE(is_virtual, false) = false
   LIMIT 1;
  SELECT id INTO v_central_id FROM stores
   WHERE store_type = 'central' AND COALESCE(is_virtual, false) = false
   LIMIT 1;
  IF v_central_id IS NULL THEN v_central_id := v_factory_id; END IF;
  IF v_factory_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH
  auto AS (
    SELECT
      (s->>'recipe_id')::uuid                AS recipe_id,
      (s->>'output_product_id')::uuid        AS output_product_id,
      COALESCE((s->>'suggested_qty')::numeric, 0) AS qty,
      COALESCE((s->>'suggested_multiplier')::numeric, 0) AS multiplier,
      COALESCE((s->>'factory_stock')::numeric, 0) AS factory_stock,
      s->'store_breakdown'                   AS store_breakdown
    FROM jsonb_array_elements(
      to_jsonb(COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM production_suggestions() p), '[]'::jsonb))
    ) s
    WHERE COALESCE((s->>'suggested_qty')::numeric, 0) > 0
  ),
  manual AS (
    SELECT
      fri.product_id,
      SUM(COALESCE(fri.quantity_approved, fri.quantity_requested)) AS qty,
      jsonb_agg(jsonb_build_object(
        'store_id', fr.store_id,
        'store_name', st.name,
        'qty', COALESCE(fri.quantity_approved, fri.quantity_requested),
        'request_id', fr.id,
        'status', fr.status
      )) AS detail
    FROM factory_request_items fri
    JOIN factory_requests fr ON fr.id = fri.request_id
    JOIN stores st ON st.id = fr.store_id
    WHERE fr.status IN ('pending','approved')
    GROUP BY fri.product_id
  ),
  outputs AS (
    SELECT
      COALESCE(a.output_product_id, m.product_id) AS product_id,
      a.recipe_id,
      r.name                                    AS recipe_name,
      ip.name                                   AS product_name,
      COALESCE(r.yield_unit, ip.unit)           AS unit,
      COALESCE(a.qty, 0) + COALESCE(m.qty, 0)   AS total_qty,
      COALESCE(a.qty, 0)                        AS auto_qty,
      COALESCE(m.qty, 0)                        AS manual_qty,
      COALESCE(a.factory_stock,
        (SELECT ist.quantity FROM inventory_stock ist
          WHERE ist.store_id = v_factory_id
            AND ist.product_id = COALESCE(a.output_product_id, m.product_id)),
        0
      )                                         AS factory_stock,
      COALESCE(a.multiplier, 0)                 AS multiplier,
      r.yield_quantity                          AS yield_quantity,
      jsonb_build_object(
        'auto_breakdown', a.store_breakdown,
        'manual_breakdown', m.detail
      )                                         AS details
    FROM auto a
    FULL OUTER JOIN manual m ON m.product_id = a.output_product_id
    LEFT JOIN inventory_products ip ON ip.id = COALESCE(a.output_product_id, m.product_id)
    LEFT JOIN recipes r ON r.id = a.recipe_id
  ),
  output_multipliers AS (
    SELECT
      o.recipe_id,
      o.product_id,
      o.yield_quantity,
      CASE
        WHEN o.recipe_id IS NULL OR o.yield_quantity IS NULL OR o.yield_quantity <= 0 THEN 0
        ELSE CEIL(o.total_qty / o.yield_quantity)
      END AS effective_multiplier
    FROM outputs o
    WHERE o.total_qty > 0
  ),
  materials AS (
    SELECT
      ri.product_id                                AS product_id,
      ip.name                                      AS product_name,
      COALESCE(ri.unit, ip.unit)                   AS unit,
      SUM(ri.quantity * om.effective_multiplier)   AS total_qty,
      jsonb_agg(jsonb_build_object(
        'recipe_id', om.recipe_id,
        'qty_per_recipe', ri.quantity,
        'multiplier', om.effective_multiplier,
        'subtotal', ri.quantity * om.effective_multiplier
      )) AS detail
    FROM output_multipliers om
    JOIN recipe_ingredients ri ON ri.recipe_id = om.recipe_id
    JOIN inventory_products ip ON ip.id = ri.product_id
    WHERE om.effective_multiplier > 0
    GROUP BY ri.product_id, ip.name, COALESCE(ri.unit, ip.unit)
  )
  SELECT
    'output'::text                            AS level,
    CASE
      WHEN o.auto_qty > 0 AND o.manual_qty > 0 THEN 'mixed'
      WHEN o.manual_qty > 0 THEN 'manual'
      ELSE 'auto'
    END                                       AS source,
    o.recipe_id,
    o.recipe_name,
    o.product_id,
    o.product_name,
    o.unit,
    o.total_qty,
    o.factory_stock,
    GREATEST(o.total_qty - o.factory_stock, 0) AS deficit,
    COALESCE(jsonb_array_length(COALESCE(o.details->'auto_breakdown', '[]'::jsonb))
           + jsonb_array_length(COALESCE(o.details->'manual_breakdown', '[]'::jsonb)), 0) AS store_count,
    o.manual_qty,
    o.auto_qty,
    o.details
  FROM outputs o
  WHERE o.total_qty > 0

  UNION ALL

  SELECT
    'material'::text,
    NULL::text,
    NULL::uuid,
    NULL::text,
    m.product_id,
    m.product_name,
    m.unit,
    m.total_qty,
    COALESCE((SELECT ist.quantity FROM inventory_stock ist
               WHERE ist.store_id = v_central_id
                 AND ist.product_id = m.product_id), 0) AS factory_stock,
    GREATEST(m.total_qty - COALESCE((SELECT ist.quantity FROM inventory_stock ist
               WHERE ist.store_id = v_central_id
                 AND ist.product_id = m.product_id), 0), 0) AS deficit,
    NULL::integer,
    NULL::numeric,
    NULL::numeric,
    jsonb_build_object('recipes', m.detail)
  FROM materials m
  WHERE m.total_qty > 0
  ORDER BY 1 DESC, deficit DESC, total_qty DESC;
END;
$function$;