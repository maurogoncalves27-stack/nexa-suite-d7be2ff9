-- 1. Campo de contingência em inventory_stock
ALTER TABLE public.inventory_stock
  ADD COLUMN IF NOT EXISTS target_qty NUMERIC(14,4) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.inventory_stock.target_qty IS 'Estoque-alvo (contingência) que a loja deve manter deste produto';

-- 2. Tabela de produtos × lojas vinculadas (lojas que recebem cada produto produzido)
CREATE TABLE IF NOT EXISTS public.product_store_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE (product_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_product_store_links_product ON public.product_store_links(product_id);
CREATE INDEX IF NOT EXISTS idx_product_store_links_store ON public.product_store_links(store_id);

ALTER TABLE public.product_store_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users view product_store_links"
  ON public.product_store_links FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admin/Manager manage product_store_links"
  ON public.product_store_links FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

-- 3. Função: sugestão de produção por receita (para fichas escopo 'fabrica')
CREATE OR REPLACE FUNCTION public.production_suggestions()
RETURNS TABLE (
  recipe_id UUID,
  recipe_name TEXT,
  yield_quantity NUMERIC,
  yield_unit TEXT,
  output_product_id UUID,
  output_product_name TEXT,
  factory_stock NUMERIC,
  total_needed NUMERIC,
  suggested_qty NUMERIC,
  suggested_multiplier NUMERIC,
  store_breakdown JSONB
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH factory AS (
    SELECT id FROM public.stores WHERE store_type IN ('central','fabrica') LIMIT 1
  ),
  receitas AS (
    SELECT r.id, r.name, r.yield_quantity, r.yield_unit, r.output_product_id, r.scope
    FROM public.recipes r
    WHERE r.is_active = true
      AND r.scope = 'fabrica'
      AND r.output_product_id IS NOT NULL
  ),
  por_loja AS (
    SELECT
      r.id AS recipe_id,
      psl.store_id,
      s.name AS store_name,
      COALESCE(ist.quantity, 0) AS stock_qty,
      COALESCE(ist.target_qty, 0) AS target_qty,
      GREATEST(COALESCE(ist.target_qty,0) - COALESCE(ist.quantity,0), 0) AS to_send
    FROM receitas r
    JOIN public.product_store_links psl ON psl.product_id = r.output_product_id
    JOIN public.stores s ON s.id = psl.store_id
    LEFT JOIN public.inventory_stock ist
      ON ist.store_id = psl.store_id AND ist.product_id = r.output_product_id
  ),
  totais AS (
    SELECT recipe_id, COALESCE(SUM(to_send), 0) AS total_needed,
           jsonb_agg(jsonb_build_object(
             'store_id', store_id,
             'store_name', store_name,
             'stock', stock_qty,
             'target', target_qty,
             'to_send', to_send
           ) ORDER BY store_name) AS breakdown
    FROM por_loja
    GROUP BY recipe_id
  ),
  fab_stock AS (
    SELECT r.id AS recipe_id,
      COALESCE((
        SELECT ist.quantity FROM public.inventory_stock ist, factory f
        WHERE ist.store_id = f.id AND ist.product_id = r.output_product_id
      ), 0) AS factory_qty
    FROM receitas r
  )
  SELECT
    r.id,
    r.name,
    r.yield_quantity,
    r.yield_unit,
    r.output_product_id,
    ip.name,
    fs.factory_qty,
    COALESCE(t.total_needed, 0),
    GREATEST(COALESCE(t.total_needed,0) - fs.factory_qty, 0) AS suggested_qty,
    CASE WHEN r.yield_quantity > 0
         THEN CEIL(GREATEST(COALESCE(t.total_needed,0) - fs.factory_qty, 0) / r.yield_quantity)
         ELSE 0
    END AS suggested_multiplier,
    COALESCE(t.breakdown, '[]'::jsonb)
  FROM receitas r
  LEFT JOIN totais t ON t.recipe_id = r.id
  LEFT JOIN fab_stock fs ON fs.recipe_id = r.id
  LEFT JOIN public.inventory_products ip ON ip.id = r.output_product_id
  ORDER BY suggested_qty DESC, r.name;
$$;

GRANT EXECUTE ON FUNCTION public.production_suggestions() TO authenticated;