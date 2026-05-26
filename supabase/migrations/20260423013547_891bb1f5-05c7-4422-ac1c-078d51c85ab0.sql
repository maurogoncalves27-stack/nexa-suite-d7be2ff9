-- 1) Tabela de mapeamento: nome do item Saipos → produto OU receita
CREATE TABLE public.pos_item_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pos_item_name TEXT NOT NULL UNIQUE,
  inventory_product_id UUID REFERENCES public.inventory_products(id) ON DELETE SET NULL,
  recipe_id UUID REFERENCES public.recipes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pos_mapping_target_xor CHECK (
    (inventory_product_id IS NOT NULL AND recipe_id IS NULL) OR
    (inventory_product_id IS NULL AND recipe_id IS NOT NULL)
  )
);

CREATE INDEX idx_pos_item_mappings_name ON public.pos_item_mappings(pos_item_name);

ALTER TABLE public.pos_item_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manages pos mappings" ON public.pos_item_mappings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER trg_pos_item_mappings_updated_at
  BEFORE UPDATE ON public.pos_item_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Normalização de nome (sem unaccent — usa fallback simples)
CREATE OR REPLACE FUNCTION public.normalize_pos_name(_name TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT trim(lower(regexp_replace(coalesce(_name,''), '[^a-zA-Z0-9]+', ' ', 'g')))
$$;

-- 3) RPC: vincula item Saipos e reprocessa retroativo
CREATE OR REPLACE FUNCTION public.link_pos_item(
  _pos_item_name TEXT,
  _inventory_product_id UUID,
  _recipe_id UUID
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_norm TEXT;
  v_mapping_id UUID;
  v_sale RECORD;
  v_item RECORD;
  v_ing RECORD;
  v_movements_created INT := 0;
  v_items_updated INT := 0;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'manager')) THEN
    RAISE EXCEPTION 'Sem permissão para vincular itens do PDV';
  END IF;

  IF (_inventory_product_id IS NULL AND _recipe_id IS NULL)
     OR (_inventory_product_id IS NOT NULL AND _recipe_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Informe APENAS um destino: produto OU receita';
  END IF;

  v_norm := public.normalize_pos_name(_pos_item_name);

  INSERT INTO public.pos_item_mappings (pos_item_name, inventory_product_id, recipe_id, created_by)
  VALUES (_pos_item_name, _inventory_product_id, _recipe_id, v_uid)
  ON CONFLICT (pos_item_name) DO UPDATE
    SET inventory_product_id = EXCLUDED.inventory_product_id,
        recipe_id = EXCLUDED.recipe_id,
        updated_at = now()
  RETURNING id INTO v_mapping_id;

  UPDATE public.pos_sale_items
     SET inventory_product_id = _inventory_product_id,
         match_status = CASE WHEN _inventory_product_id IS NOT NULL THEN 'matched' ELSE 'recipe' END
   WHERE public.normalize_pos_name(product_name) = v_norm;
  GET DIAGNOSTICS v_items_updated = ROW_COUNT;

  FOR v_sale IN
    SELECT DISTINCT s.id AS sale_id, s.store_id, s.order_number, s.external_id
      FROM public.pos_sales s
      JOIN public.pos_sale_items si ON si.sale_id = s.id
     WHERE public.normalize_pos_name(si.product_name) = v_norm
  LOOP
    FOR v_item IN
      SELECT id, product_name, quantity
        FROM public.pos_sale_items
       WHERE sale_id = v_sale.sale_id
         AND public.normalize_pos_name(product_name) = v_norm
         AND quantity > 0
    LOOP
      IF _inventory_product_id IS NOT NULL THEN
        INSERT INTO public.inventory_stock_movements
          (store_id, product_id, movement_type, quantity, reason, created_by)
        VALUES
          (v_sale.store_id, _inventory_product_id, 'saida', v_item.quantity,
           'PDV Saipos (retroativo) - Venda ' || COALESCE(v_sale.order_number, v_sale.external_id), v_uid);
        v_movements_created := v_movements_created + 1;

      ELSE
        FOR v_ing IN
          SELECT ri.product_id, (ri.quantity * v_item.quantity / NULLIF(r.yield_quantity,0)) AS need_qty, r.name AS recipe_name
            FROM public.recipes r
            JOIN public.recipe_ingredients ri ON ri.recipe_id = r.id
           WHERE r.id = _recipe_id
        LOOP
          IF v_ing.need_qty IS NOT NULL AND v_ing.need_qty > 0 THEN
            INSERT INTO public.inventory_stock_movements
              (store_id, product_id, movement_type, quantity, reason, created_by)
            VALUES
              (v_sale.store_id, v_ing.product_id, 'saida', v_ing.need_qty,
               'PDV Saipos (retroativo) - Receita ' || v_ing.recipe_name || ' - Venda ' || COALESCE(v_sale.order_number, v_sale.external_id), v_uid);
            v_movements_created := v_movements_created + 1;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'mapping_id', v_mapping_id,
    'items_updated', v_items_updated,
    'movements_created', v_movements_created
  );
END;
$$;

-- 4) Listar itens sem vínculo (agrupados)
CREATE OR REPLACE FUNCTION public.list_unlinked_pos_items()
RETURNS TABLE(
  product_name TEXT,
  total_quantity NUMERIC,
  occurrences BIGINT,
  last_sold_at TIMESTAMPTZ,
  stores_count BIGINT
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    si.product_name,
    SUM(si.quantity)::NUMERIC AS total_quantity,
    COUNT(*)::BIGINT AS occurrences,
    MAX(s.sold_at) AS last_sold_at,
    COUNT(DISTINCT s.store_id)::BIGINT AS stores_count
  FROM public.pos_sale_items si
  JOIN public.pos_sales s ON s.id = si.sale_id
  WHERE si.inventory_product_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.pos_item_mappings m
      WHERE public.normalize_pos_name(m.pos_item_name) = public.normalize_pos_name(si.product_name)
    )
  GROUP BY si.product_name
  ORDER BY SUM(si.quantity) DESC;
$$;