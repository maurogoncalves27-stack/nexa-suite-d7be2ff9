-- 1) Adiciona min/max por loja no estoque
ALTER TABLE public.inventory_stock
  ADD COLUMN IF NOT EXISTS min_qty NUMERIC(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_qty NUMERIC(14,4) NOT NULL DEFAULT 0;

-- Garante linha de estoque para todo (loja física, produto ativo) para permitir definir mínimo mesmo sem saldo
-- (não é obrigatório agora — usuário cria conforme define mínimos)

-- 2) Função: sugestão de compra (agregada por produto, somando todas as lojas físicas)
CREATE OR REPLACE FUNCTION public.suggest_purchases()
RETURNS TABLE (
  product_id uuid,
  product_name text,
  unit text,
  category text,
  total_stock numeric,
  total_min numeric,
  total_max numeric,
  qty_to_buy numeric,
  average_cost numeric,
  estimated_cost numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- 3) Função: sugestão de transferência fábrica → lojas
-- Para cada loja com estoque abaixo do mínimo, sugere enviar até o máximo,
-- limitado ao estoque disponível na fábrica (loja origem informada)
CREATE OR REPLACE FUNCTION public.suggest_transfers(_origin_store_id uuid)
RETURNS TABLE (
  destination_store_id uuid,
  destination_store_name text,
  product_id uuid,
  product_name text,
  unit text,
  current_qty numeric,
  min_qty numeric,
  max_qty numeric,
  needed_qty numeric,
  origin_available numeric,
  suggested_qty numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH origin AS (
    SELECT s.product_id, s.quantity AS available
    FROM public.inventory_stock s
    WHERE s.store_id = _origin_store_id
  ),
  needs AS (
    SELECT
      s.store_id AS destination_store_id,
      st.name AS destination_store_name,
      s.product_id,
      p.name AS product_name,
      p.unit,
      s.quantity AS current_qty,
      s.min_qty,
      s.max_qty,
      GREATEST(s.max_qty - s.quantity, s.min_qty - s.quantity, 0) AS needed_qty
    FROM public.inventory_stock s
    JOIN public.stores st ON st.id = s.store_id
    JOIN public.inventory_products p ON p.id = s.product_id
    WHERE s.store_id <> _origin_store_id
      AND st.is_virtual = false
      AND s.min_qty > 0
      AND s.quantity < s.min_qty
      AND p.is_active = true
  )
  SELECT
    n.destination_store_id,
    n.destination_store_name,
    n.product_id,
    n.product_name,
    n.unit,
    n.current_qty,
    n.min_qty,
    n.max_qty,
    n.needed_qty,
    COALESCE(o.available, 0) AS origin_available,
    LEAST(n.needed_qty, COALESCE(o.available, 0)) AS suggested_qty
  FROM needs n
  LEFT JOIN origin o ON o.product_id = n.product_id
  WHERE COALESCE(o.available, 0) > 0
  ORDER BY n.destination_store_name, n.product_name;
$$;