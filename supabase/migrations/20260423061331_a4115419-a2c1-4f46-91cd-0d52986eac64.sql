-- 1) Adicionar store_type
DO $$ BEGIN
  CREATE TYPE public.store_type AS ENUM ('loja', 'fabrica', 'central');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.stores
ADD COLUMN IF NOT EXISTS store_type public.store_type NOT NULL DEFAULT 'loja';

-- Auto-classificar pela nomenclatura existente
UPDATE public.stores
SET store_type = 'fabrica'
WHERE name ~* 'f[áa]brica' AND store_type = 'loja';

UPDATE public.stores
SET store_type = 'central'
WHERE id = (
  SELECT id FROM public.stores
  WHERE name ~* 'central' AND store_type = 'loja'
  ORDER BY created_at LIMIT 1
);

-- Garantir no máximo um central
CREATE UNIQUE INDEX IF NOT EXISTS uniq_stores_central
ON public.stores ((store_type)) WHERE store_type = 'central';

COMMENT ON COLUMN public.stores.store_type IS 'Tipo da unidade: loja (PDV), fabrica (produção) ou central (distribuição). Apenas 1 central permitido.';

-- 2) Adicionar factory_only no produto
ALTER TABLE public.inventory_products
ADD COLUMN IF NOT EXISTS factory_only boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_inventory_products_factory_only
ON public.inventory_products(factory_only) WHERE factory_only = true;

COMMENT ON COLUMN public.inventory_products.factory_only IS 'Se true, o produto só circula na fábrica (insumo exclusivo). Não aparece no estoque central nem em outras lojas.';

-- 3) Atualizar produce_recipe: produção da fábrica vai para o central
CREATE OR REPLACE FUNCTION public.produce_recipe(
  _recipe_id uuid,
  _store_id uuid,
  _multiplier numeric,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipe RECORD;
  v_ingredient RECORD;
  v_total_cost numeric := 0;
  v_produced_qty numeric;
  v_unit_cost numeric;
  v_run_id uuid;
  v_user_id uuid;
  v_origin_store_type public.store_type;
  v_central_store_id uuid;
  v_destination_store_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  SELECT * INTO v_recipe FROM public.recipes WHERE id = _recipe_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receita não encontrada';
  END IF;
  IF NOT v_recipe.is_active THEN
    RAISE EXCEPTION 'Receita inativa';
  END IF;
  IF _multiplier <= 0 THEN
    RAISE EXCEPTION 'Multiplicador deve ser maior que zero';
  END IF;

  -- Tipo da loja origem (onde está acontecendo a produção)
  SELECT store_type INTO v_origin_store_type FROM public.stores WHERE id = _store_id;

  -- Se for produção na FÁBRICA → produto final entra no CENTRAL
  IF v_origin_store_type = 'fabrica' THEN
    SELECT id INTO v_central_store_id FROM public.stores WHERE store_type = 'central' LIMIT 1;
    IF v_central_store_id IS NULL THEN
      RAISE EXCEPTION 'Não há estoque central configurado. Marque uma loja como tipo "central" antes de produzir na fábrica.';
    END IF;
    v_destination_store_id := v_central_store_id;
  ELSE
    v_destination_store_id := _store_id;
  END IF;

  v_produced_qty := v_recipe.yield_quantity * _multiplier;

  -- Validar e debitar ingredientes da loja de origem (fábrica ou própria loja)
  FOR v_ingredient IN
    SELECT ri.product_id, ri.quantity * _multiplier AS need_qty, ip.average_cost
    FROM public.recipe_ingredients ri
    JOIN public.inventory_products ip ON ip.id = ri.product_id
    WHERE ri.recipe_id = _recipe_id
  LOOP
    IF COALESCE((SELECT quantity FROM public.inventory_stock
                 WHERE store_id = _store_id AND product_id = v_ingredient.product_id), 0) < v_ingredient.need_qty THEN
      RAISE EXCEPTION 'Estoque insuficiente do ingrediente %', v_ingredient.product_id;
    END IF;

    UPDATE public.inventory_stock
    SET quantity = quantity - v_ingredient.need_qty, updated_at = now()
    WHERE store_id = _store_id AND product_id = v_ingredient.product_id;

    INSERT INTO public.inventory_movements (store_id, product_id, movement_type, quantity, reference, created_by, notes)
    VALUES (_store_id, v_ingredient.product_id, 'producao_consumo', -v_ingredient.need_qty,
            'Produção: ' || v_recipe.name, v_user_id,
            'Consumo de ingrediente para produção');

    v_total_cost := v_total_cost + (v_ingredient.need_qty * v_ingredient.average_cost);
  END LOOP;

  v_unit_cost := CASE WHEN v_produced_qty > 0 THEN v_total_cost / v_produced_qty ELSE 0 END;

  -- Adicionar produto final ao destino (CENTRAL se origem=fabrica; ou própria loja)
  INSERT INTO public.inventory_stock (store_id, product_id, quantity, average_cost, last_entry_at, updated_at)
  VALUES (v_destination_store_id, v_recipe.output_product_id, v_produced_qty, v_unit_cost, now(), now())
  ON CONFLICT (store_id, product_id) DO UPDATE
  SET quantity = inventory_stock.quantity + EXCLUDED.quantity,
      average_cost = CASE
        WHEN inventory_stock.quantity + EXCLUDED.quantity > 0
        THEN ((inventory_stock.quantity * inventory_stock.average_cost) + (EXCLUDED.quantity * EXCLUDED.average_cost))
             / (inventory_stock.quantity + EXCLUDED.quantity)
        ELSE EXCLUDED.average_cost
      END,
      last_entry_at = now(),
      updated_at = now();

  INSERT INTO public.inventory_movements (store_id, product_id, movement_type, quantity, unit_cost, reference, created_by, notes)
  VALUES (v_destination_store_id, v_recipe.output_product_id, 'producao_entrada', v_produced_qty, v_unit_cost,
          'Produção: ' || v_recipe.name, v_user_id,
          CASE WHEN v_origin_store_type = 'fabrica'
               THEN 'Entrada de produção da fábrica no estoque central'
               ELSE 'Entrada de produção'
          END);

  -- Registrar a corrida de produção
  INSERT INTO public.production_runs (recipe_id, store_id, multiplier, produced_quantity, total_cost, unit_cost, notes, produced_by)
  VALUES (_recipe_id, _store_id, _multiplier, v_produced_qty, v_total_cost, v_unit_cost, _notes, v_user_id)
  RETURNING id INTO v_run_id;

  RETURN v_run_id;
END;
$$;