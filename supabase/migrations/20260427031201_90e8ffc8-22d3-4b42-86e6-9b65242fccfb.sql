
-- =====================================================================
-- FASE FINAL DO SISTEMA DE ESTOQUE
-- =====================================================================

ALTER TABLE public.inventory_products
  ADD COLUMN IF NOT EXISTS requires_expiry boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_shelf_life_days integer;

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS shelf_life_days integer;

COMMENT ON COLUMN public.inventory_products.requires_expiry IS
  'Se true, todo recebimento/produção deste produto exige data de validade.';
COMMENT ON COLUMN public.recipes.shelf_life_days IS
  'Validade padrão em dias para o produto resultante desta receita.';

-- ---------------------------------------------------------------------
-- 1) produce_recipe com validade obrigatória + lote automático
--    (usa inventory_stock_movements; tabela inventory_movements não existe)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.produce_recipe(
  _recipe_id uuid,
  _store_id uuid,
  _multiplier numeric,
  _notes text DEFAULT NULL,
  _expiry_date date DEFAULT NULL,
  _manufacture_date date DEFAULT NULL,
  _lot_number text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_requires_expiry boolean;
  v_effective_expiry date;
  v_effective_mfg date;
  v_lot text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado'; END IF;

  SELECT * INTO v_recipe FROM public.recipes WHERE id = _recipe_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receita não encontrada'; END IF;
  IF NOT v_recipe.is_active THEN RAISE EXCEPTION 'Receita inativa'; END IF;
  IF _multiplier <= 0 THEN RAISE EXCEPTION 'Multiplicador deve ser maior que zero'; END IF;

  SELECT requires_expiry INTO v_requires_expiry
    FROM public.inventory_products WHERE id = v_recipe.output_product_id;
  v_requires_expiry := COALESCE(v_requires_expiry, false);

  v_effective_mfg := COALESCE(_manufacture_date, CURRENT_DATE);
  v_effective_expiry := _expiry_date;
  IF v_effective_expiry IS NULL AND v_recipe.shelf_life_days IS NOT NULL THEN
    v_effective_expiry := v_effective_mfg + (v_recipe.shelf_life_days || ' days')::interval;
  END IF;

  IF v_requires_expiry AND v_effective_expiry IS NULL THEN
    RAISE EXCEPTION 'Este produto exige data de validade. Informe a validade ou cadastre os dias de validade na ficha técnica.';
  END IF;
  IF v_effective_expiry IS NOT NULL AND v_effective_expiry < CURRENT_DATE THEN
    RAISE EXCEPTION 'Validade não pode ser anterior à data atual';
  END IF;

  SELECT store_type INTO v_origin_store_type FROM public.stores WHERE id = _store_id;
  IF v_origin_store_type = 'fabrica' THEN
    SELECT id INTO v_central_store_id FROM public.stores WHERE store_type = 'central' LIMIT 1;
    IF v_central_store_id IS NULL THEN
      RAISE EXCEPTION 'Não há estoque central configurado.';
    END IF;
    v_destination_store_id := v_central_store_id;
  ELSE
    v_destination_store_id := _store_id;
  END IF;

  v_produced_qty := v_recipe.yield_quantity * _multiplier;

  -- Consome ingredientes
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

    INSERT INTO public.inventory_stock_movements
      (store_id, product_id, movement_type, quantity, unit_cost, reason, created_by)
    VALUES
      (_store_id, v_ingredient.product_id, 'saida', v_ingredient.need_qty, v_ingredient.average_cost,
       'Produção (consumo): ' || v_recipe.name, v_user_id);

    v_total_cost := v_total_cost + (v_ingredient.need_qty * COALESCE(v_ingredient.average_cost, 0));
  END LOOP;

  v_unit_cost := CASE WHEN v_produced_qty > 0 THEN v_total_cost / v_produced_qty ELSE 0 END;

  -- Entrada do produto produzido
  INSERT INTO public.inventory_stock_movements
    (store_id, product_id, movement_type, quantity, unit_cost, reason, created_by)
  VALUES
    (v_destination_store_id, v_recipe.output_product_id, 'entrada', v_produced_qty, v_unit_cost,
     'Produção: ' || v_recipe.name, v_user_id);

  -- Cria lote SEMPRE que houver validade
  IF v_effective_expiry IS NOT NULL THEN
    v_lot := COALESCE(_lot_number, 'PROD-' || to_char(now(), 'YYYYMMDD-HH24MISS'));
    INSERT INTO public.inventory_lots (
      store_id, product_id, lot_number, quantity, initial_quantity,
      unit_cost, manufacture_date, expiry_date, status, notes, created_by
    ) VALUES (
      v_destination_store_id, v_recipe.output_product_id, v_lot,
      v_produced_qty, v_produced_qty, v_unit_cost,
      v_effective_mfg, v_effective_expiry, 'active',
      'Lote criado na produção: ' || v_recipe.name, v_user_id
    );
  END IF;

  INSERT INTO public.production_runs
    (recipe_id, store_id, multiplier, produced_quantity, total_cost, unit_cost, notes, produced_by)
  VALUES
    (_recipe_id, _store_id, _multiplier, v_produced_qty, v_total_cost, v_unit_cost, _notes, v_user_id)
  RETURNING id INTO v_run_id;

  RETURN v_run_id;
END;
$function$;

-- ---------------------------------------------------------------------
-- 2) Bloqueio de saída/consumo de lote vencido
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.block_expired_lot_movements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_non_expired numeric;
  v_total_active numeric;
BEGIN
  IF NEW.movement_type NOT IN ('saida','perda') THEN
    RETURN NEW;
  END IF;
  -- Perda é justamente como o operador limpa lote vencido — não bloqueia
  IF NEW.movement_type = 'perda' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_non_expired
    FROM public.inventory_lots
   WHERE store_id = NEW.store_id AND product_id = NEW.product_id
     AND status = 'active' AND quantity > 0
     AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE);

  SELECT COALESCE(SUM(quantity), 0) INTO v_total_active
    FROM public.inventory_lots
   WHERE store_id = NEW.store_id AND product_id = NEW.product_id
     AND status = 'active' AND quantity > 0;

  -- Só bloqueia se o produto USA lote (existem lotes ativos) e o saldo não-vencido não cobre a saída
  IF v_total_active > 0 AND v_non_expired < ABS(COALESCE(NEW.quantity, 0)) THEN
    RAISE EXCEPTION 'Saída bloqueada: existem lotes vencidos deste produto na loja. Registre a perda dos lotes vencidos antes de continuar.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_block_expired_lot_stock_movements ON public.inventory_stock_movements;
CREATE TRIGGER trg_block_expired_lot_stock_movements
  BEFORE INSERT ON public.inventory_stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.block_expired_lot_movements();

-- ---------------------------------------------------------------------
-- 3) Agendador da contagem dominical
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_weekly_inventory_counts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_target_sunday date;
  v_store RECORD;
  v_created int := 0;
  v_skipped int := 0;
BEGIN
  v_target_sunday := CURRENT_DATE + ((7 - EXTRACT(DOW FROM CURRENT_DATE)::int) % 7);
  IF v_target_sunday = CURRENT_DATE AND EXTRACT(DOW FROM CURRENT_DATE)::int <> 0 THEN
    v_target_sunday := CURRENT_DATE + 7;
  END IF;

  FOR v_store IN
    SELECT id, name
      FROM public.stores
     WHERE COALESCE(is_virtual, false) = false
       AND COALESCE(is_active, true) = true
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.inventory_counts
       WHERE store_id = v_store.id AND reference_date = v_target_sunday
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.inventory_counts (store_id, reference_date, status, opened_at, notes)
    VALUES (v_store.id, v_target_sunday, 'open', now(),
            'Contagem semanal criada automaticamente pelo agendador');
    v_created := v_created + 1;
  END LOOP;

  RETURN jsonb_build_object('target_sunday', v_target_sunday, 'created', v_created, 'skipped', v_skipped);
END;
$function$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('weekly-inventory-counts');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'weekly-inventory-counts',
  '0 6 * * 4',
  $$ SELECT public.ensure_weekly_inventory_counts(); $$
);

-- ---------------------------------------------------------------------
-- 4) Divergência no recebimento da loja
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_factory_request_receipt_with_divergence(
  _request_id uuid,
  _items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_req RECORD;
  v_factory_store_id uuid;
  v_item_payload jsonb;
  v_item RECORD;
  v_sent_qty numeric;
  v_received_qty numeric;
  v_diff numeric;
  v_avg numeric;
  v_total_diff numeric := 0;
  v_items_with_diff int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;

  SELECT * INTO v_req FROM public.factory_requests WHERE id = _request_id FOR UPDATE;
  IF v_req IS NULL THEN RAISE EXCEPTION 'Solicitação não encontrada'; END IF;
  IF v_req.status <> 'shipped' THEN
    RAISE EXCEPTION 'Só é possível confirmar pedidos enviados';
  END IF;

  IF NOT (
    public.has_role(v_uid,'admin')
    OR public.has_role(v_uid,'manager')
    OR public.user_can_access_store(v_uid, v_req.store_id)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para esta loja';
  END IF;

  SELECT id INTO v_factory_store_id FROM public.stores WHERE store_type = 'fabrica' LIMIT 1;
  IF v_factory_store_id IS NULL THEN RAISE EXCEPTION 'Fábrica não configurada'; END IF;

  FOR v_item_payload IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT id, product_id,
           COALESCE(quantity_delivered, quantity_approved, quantity_requested) AS sent_qty
      INTO v_item
      FROM public.factory_request_items
     WHERE id = (v_item_payload->>'item_id')::uuid AND request_id = _request_id;
    CONTINUE WHEN v_item IS NULL;

    v_sent_qty := COALESCE(v_item.sent_qty, 0);
    v_received_qty := COALESCE((v_item_payload->>'received_qty')::numeric, v_sent_qty);
    IF v_received_qty < 0 THEN v_received_qty := 0; END IF;
    v_diff := v_sent_qty - v_received_qty;

    SELECT average_cost INTO v_avg FROM public.inventory_products WHERE id = v_item.product_id;
    v_avg := COALESCE(v_avg, 0);

    IF v_sent_qty > 0 THEN
      INSERT INTO public.inventory_stock_movements
        (store_id, product_id, movement_type, quantity, unit_cost, reason, created_by)
      VALUES
        (v_factory_store_id, v_item.product_id, 'saida', v_sent_qty, v_avg,
         'Solicitação loja #' || _request_id, v_uid);
    END IF;

    IF v_received_qty > 0 THEN
      INSERT INTO public.inventory_stock_movements
        (store_id, product_id, movement_type, quantity, unit_cost, reason, created_by)
      VALUES
        (v_req.store_id, v_item.product_id, 'entrada', v_received_qty, v_avg,
         'Recebimento da fábrica #' || _request_id, v_uid);
    END IF;

    IF v_diff > 0 THEN
      INSERT INTO public.inventory_stock_movements
        (store_id, product_id, movement_type, quantity, unit_cost, reason, created_by)
      VALUES
        (v_factory_store_id, v_item.product_id, 'perda', v_diff, v_avg,
         'Divergência no recebimento (loja '|| v_req.store_id ||'): ' ||
         COALESCE(NULLIF(v_item_payload->>'loss_reason',''), 'sem justificativa'),
         v_uid);
      v_total_diff := v_total_diff + v_diff;
      v_items_with_diff := v_items_with_diff + 1;
    END IF;

    UPDATE public.factory_request_items
       SET quantity_delivered = v_received_qty,
           updated_at = now()
     WHERE id = v_item.id;
  END LOOP;

  UPDATE public.factory_requests
     SET status = 'received',
         received_by = v_uid,
         received_at = now(),
         updated_at = now()
   WHERE id = _request_id;

  RETURN jsonb_build_object(
    'request_id', _request_id,
    'items_with_divergence', v_items_with_diff,
    'total_loss_qty', v_total_diff
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ensure_weekly_inventory_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_factory_request_receipt_with_divergence(uuid, jsonb) TO authenticated;
