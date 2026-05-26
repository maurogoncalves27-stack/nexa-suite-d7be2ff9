-- ============================================================================
-- factory_weekly_plan: Plano semanal da fábrica (híbrido auto + manual)
-- Retorna 2 níveis:
--   level = 'output'   → produto acabado a produzir (consolida lojas)
--   level = 'material' → matéria-prima a consumir (explosão de fichas)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.factory_weekly_plan()
RETURNS TABLE (
  level                 text,                -- 'output' | 'material'
  source                text,                -- 'auto' | 'manual' | 'mixed' (apenas para output)
  recipe_id             uuid,                -- nulo em material
  recipe_name           text,                -- nulo em material
  product_id            uuid,
  product_name          text,
  unit                  text,
  total_qty             numeric,             -- total a produzir (output) ou a consumir (material)
  factory_stock         numeric,             -- estoque atual na fábrica (output) ou no central (material)
  deficit               numeric,             -- max(0, total_qty - factory_stock)
  store_count           integer,             -- nº lojas que pediram (apenas output)
  manual_qty            numeric,             -- parte vinda de solicitações manuais (output)
  auto_qty              numeric,             -- parte vinda de sugestão automática (output)
  details               jsonb                -- breakdown extra (lojas para output; receitas para material)
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_factory_id uuid;
  v_central_id uuid;
BEGIN
  -- Identifica fábrica e estoque central (fallback: fábrica = central)
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
  -- 1) Sugestão automática (reusa lógica existente)
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
  -- 2) Solicitações manuais pendentes/aprovadas (agrupa por produto)
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
  -- 3) Une auto+manual por produto acabado
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
        (SELECT quantity FROM inventory_stock WHERE store_id = v_factory_id AND product_id = COALESCE(a.output_product_id, m.product_id)),
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
  -- 4) Multiplicador efetivo para explosão de ficha (cobre auto+manual)
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
  -- 5) Explosão das fichas → matéria-prima total
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
  -- 6) Saída final: nível 1 (outputs) + nível 2 (materials)
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
    COALESCE((SELECT quantity FROM inventory_stock
               WHERE store_id = v_central_id AND product_id = m.product_id), 0) AS factory_stock,
    GREATEST(m.total_qty - COALESCE((SELECT quantity FROM inventory_stock
               WHERE store_id = v_central_id AND product_id = m.product_id), 0), 0) AS deficit,
    NULL::integer,
    NULL::numeric,
    NULL::numeric,
    jsonb_build_object('recipes', m.detail)
  FROM materials m
  WHERE m.total_qty > 0
  ORDER BY 1 DESC, deficit DESC, total_qty DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.factory_weekly_plan() TO authenticated;