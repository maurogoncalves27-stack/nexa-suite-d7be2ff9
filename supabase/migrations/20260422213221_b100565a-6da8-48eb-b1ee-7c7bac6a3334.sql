-- =========================================================
-- FICHAS TÉCNICAS DE PRODUÇÃO
-- =========================================================

-- Tabela principal: receita / ficha técnica
CREATE TABLE public.recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  output_product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE RESTRICT,
  yield_quantity NUMERIC(14,4) NOT NULL DEFAULT 1 CHECK (yield_quantity > 0),
  yield_unit TEXT NOT NULL DEFAULT 'UN',
  prep_time_minutes INTEGER,
  shelf_life_hours INTEGER,
  photo_path TEXT,
  notes TEXT,
  allergens TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  nutrition_info JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recipes_output ON public.recipes(output_product_id);
CREATE INDEX idx_recipes_active ON public.recipes(is_active);

-- Ingredientes da receita
CREATE TABLE public.recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE RESTRICT,
  quantity NUMERIC(14,4) NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL DEFAULT 'UN',
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recipe_ingredients_recipe ON public.recipe_ingredients(recipe_id);
CREATE INDEX idx_recipe_ingredients_product ON public.recipe_ingredients(product_id);

-- Passos do modo de preparo
CREATE TABLE public.recipe_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  description TEXT NOT NULL,
  duration_minutes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(recipe_id, step_number)
);

CREATE INDEX idx_recipe_steps_recipe ON public.recipe_steps(recipe_id);

-- Produções realizadas (histórico)
CREATE TABLE public.production_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE RESTRICT,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  multiplier NUMERIC(14,4) NOT NULL DEFAULT 1 CHECK (multiplier > 0),
  produced_quantity NUMERIC(14,4) NOT NULL,
  total_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  notes TEXT,
  produced_by UUID,
  produced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_production_runs_recipe ON public.production_runs(recipe_id);
CREATE INDEX idx_production_runs_store ON public.production_runs(store_id);
CREATE INDEX idx_production_runs_date ON public.production_runs(produced_at DESC);

-- Triggers updated_at
CREATE TRIGGER trg_recipes_updated_at
  BEFORE UPDATE ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- RLS
-- =========================================================
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_runs ENABLE ROW LEVEL SECURITY;

-- recipes: todos autenticados leem; quem pode receber estoque cria/edita/exclui
CREATE POLICY "Authenticated can view recipes"
  ON public.recipes FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Inventory receivers can insert recipes"
  ON public.recipes FOR INSERT TO authenticated
  WITH CHECK (public.can_receive_inventory(auth.uid()));

CREATE POLICY "Inventory receivers can update recipes"
  ON public.recipes FOR UPDATE TO authenticated
  USING (public.can_receive_inventory(auth.uid()));

CREATE POLICY "Inventory receivers can delete recipes"
  ON public.recipes FOR DELETE TO authenticated
  USING (public.can_receive_inventory(auth.uid()));

-- recipe_ingredients
CREATE POLICY "Authenticated can view recipe ingredients"
  ON public.recipe_ingredients FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Inventory receivers manage recipe ingredients"
  ON public.recipe_ingredients FOR ALL TO authenticated
  USING (public.can_receive_inventory(auth.uid()))
  WITH CHECK (public.can_receive_inventory(auth.uid()));

-- recipe_steps
CREATE POLICY "Authenticated can view recipe steps"
  ON public.recipe_steps FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Inventory receivers manage recipe steps"
  ON public.recipe_steps FOR ALL TO authenticated
  USING (public.can_receive_inventory(auth.uid()))
  WITH CHECK (public.can_receive_inventory(auth.uid()));

-- production_runs: leitura por loja acessível; criação por quem pode receber
CREATE POLICY "Users view production runs of accessible stores"
  ON public.production_runs FOR SELECT TO authenticated
  USING (public.user_can_access_store(auth.uid(), store_id));

CREATE POLICY "Inventory receivers can insert production runs"
  ON public.production_runs FOR INSERT TO authenticated
  WITH CHECK (
    public.can_receive_inventory(auth.uid())
    AND public.user_can_access_store(auth.uid(), store_id)
  );

-- =========================================================
-- FUNÇÃO produce_recipe: dá baixa nos ingredientes e adiciona produto final
-- =========================================================
CREATE OR REPLACE FUNCTION public.produce_recipe(
  _recipe_id UUID,
  _store_id UUID,
  _multiplier NUMERIC,
  _notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipe RECORD;
  v_ing RECORD;
  v_avg NUMERIC(14,4);
  v_stock NUMERIC(14,4);
  v_total_cost NUMERIC(14,4) := 0;
  v_produced_qty NUMERIC(14,4);
  v_unit_cost NUMERIC(14,4);
  v_run_id UUID;
BEGIN
  IF NOT public.can_receive_inventory(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para produzir receitas';
  END IF;
  IF NOT public.user_can_access_store(auth.uid(), _store_id) THEN
    RAISE EXCEPTION 'Sem acesso à loja informada';
  END IF;
  IF _multiplier IS NULL OR _multiplier <= 0 THEN
    RAISE EXCEPTION 'Multiplicador deve ser maior que zero';
  END IF;

  SELECT * INTO v_recipe FROM public.recipes WHERE id = _recipe_id;
  IF v_recipe IS NULL THEN
    RAISE EXCEPTION 'Ficha técnica não encontrada';
  END IF;
  IF NOT v_recipe.is_active THEN
    RAISE EXCEPTION 'Ficha técnica inativa';
  END IF;

  -- 1) valida estoque e calcula custo
  FOR v_ing IN
    SELECT ri.product_id, (ri.quantity * _multiplier) AS need_qty, p.average_cost, p.name
      FROM public.recipe_ingredients ri
      JOIN public.inventory_products p ON p.id = ri.product_id
     WHERE ri.recipe_id = _recipe_id
  LOOP
    SELECT quantity INTO v_stock
      FROM public.inventory_stock
     WHERE store_id = _store_id AND product_id = v_ing.product_id;
    v_stock := COALESCE(v_stock, 0);
    IF v_stock < v_ing.need_qty THEN
      RAISE EXCEPTION 'Estoque insuficiente de % (saldo: %, necessário: %)',
        v_ing.name, v_stock, v_ing.need_qty;
    END IF;
    v_total_cost := v_total_cost + (v_ing.need_qty * COALESCE(v_ing.average_cost, 0));
  END LOOP;

  v_produced_qty := v_recipe.yield_quantity * _multiplier;
  v_unit_cost := CASE WHEN v_produced_qty > 0 THEN v_total_cost / v_produced_qty ELSE 0 END;

  -- 2) cria registro da produção
  INSERT INTO public.production_runs
    (recipe_id, store_id, multiplier, produced_quantity, total_cost, unit_cost, notes, produced_by)
  VALUES
    (_recipe_id, _store_id, _multiplier, v_produced_qty, v_total_cost, v_unit_cost, _notes, auth.uid())
  RETURNING id INTO v_run_id;

  -- 3) baixa ingredientes
  FOR v_ing IN
    SELECT ri.product_id, (ri.quantity * _multiplier) AS need_qty
      FROM public.recipe_ingredients ri
     WHERE ri.recipe_id = _recipe_id
  LOOP
    INSERT INTO public.inventory_stock_movements
      (store_id, product_id, movement_type, quantity, reason, created_by)
    VALUES
      (_store_id, v_ing.product_id, 'saida', v_ing.need_qty,
       'Produção: ' || v_recipe.name, auth.uid());
  END LOOP;

  -- 4) entrada do produto final com custo calculado
  INSERT INTO public.inventory_stock_movements
    (store_id, product_id, movement_type, quantity, unit_cost, reason, created_by)
  VALUES
    (_store_id, v_recipe.output_product_id, 'entrada', v_produced_qty, v_unit_cost,
     'Produção: ' || v_recipe.name, auth.uid());

  RETURN v_run_id;
END;
$$;

-- =========================================================
-- STORAGE BUCKET para fotos das fichas
-- =========================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('recipe-photos', 'recipe-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Recipe photos public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'recipe-photos');

CREATE POLICY "Inventory receivers upload recipe photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'recipe-photos'
    AND public.can_receive_inventory(auth.uid())
  );

CREATE POLICY "Inventory receivers update recipe photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'recipe-photos'
    AND public.can_receive_inventory(auth.uid())
  );

CREATE POLICY "Inventory receivers delete recipe photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'recipe-photos'
    AND public.can_receive_inventory(auth.uid())
  );