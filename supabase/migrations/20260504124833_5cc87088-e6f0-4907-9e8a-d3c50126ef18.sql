
-- Fase C: baixa de estoque automática via receita

-- 1) Marca de consumo no pedido pra evitar dupla baixa
ALTER TABLE public.pdv_orders
  ADD COLUMN IF NOT EXISTS stock_consumed_at timestamptz,
  ADD COLUMN IF NOT EXISTS stock_consumed_by uuid;

-- 2) Função que consome o estoque de um pedido
CREATE OR REPLACE FUNCTION public.pdv_consume_order_stock(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _store_id uuid;
  _already timestamptz;
  _consumed jsonb := '[]'::jsonb;
  _missing  jsonb := '[]'::jsonb;
  _row record;
  _new_qty numeric;
BEGIN
  SELECT store_id, stock_consumed_at INTO _store_id, _already
  FROM public.pdv_orders WHERE id = _order_id;

  IF _store_id IS NULL THEN
    RAISE EXCEPTION 'Pedido % não encontrado', _order_id;
  END IF;
  IF _already IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_consumed', true);
  END IF;

  -- Agrega ingredientes a partir das receitas dos itens vendidos
  FOR _row IN
    SELECT
      ri.product_id,
      SUM(oi.quantity * ri.quantity) AS qty_needed,
      ip.name AS product_name
    FROM public.pdv_order_items oi
    JOIN public.menu_items mi ON mi.id = oi.menu_item_id
    JOIN public.recipe_ingredients ri ON ri.recipe_id = mi.recipe_id
    JOIN public.inventory_products ip ON ip.id = ri.product_id
    WHERE oi.order_id = _order_id
      AND mi.recipe_id IS NOT NULL
      AND COALESCE(ri.is_packaging, false) = false
    GROUP BY ri.product_id, ip.name
  LOOP
    -- Upsert no estoque (pode ficar negativo, mas registra alerta)
    INSERT INTO public.inventory_stock (store_id, product_id, quantity)
    VALUES (_store_id, _row.product_id, -_row.qty_needed)
    ON CONFLICT (store_id, product_id)
    DO UPDATE SET quantity = public.inventory_stock.quantity - _row.qty_needed,
                  updated_at = now()
    RETURNING quantity INTO _new_qty;

    -- Movimento (saída por venda)
    INSERT INTO public.inventory_stock_movements
      (store_id, product_id, movement_type, quantity, reason, notes)
    VALUES
      (_store_id, _row.product_id, 'sale', -_row.qty_needed,
       'pdv_order', 'Pedido ' || _order_id::text);

    _consumed := _consumed || jsonb_build_object(
      'product_id', _row.product_id,
      'name', _row.product_name,
      'qty', _row.qty_needed,
      'remaining', _new_qty
    );
    IF _new_qty < 0 THEN
      _missing := _missing || jsonb_build_object(
        'product_id', _row.product_id,
        'name', _row.product_name,
        'short_by', -_new_qty
      );
    END IF;
  END LOOP;

  UPDATE public.pdv_orders
     SET stock_consumed_at = now(),
         stock_consumed_by = auth.uid()
   WHERE id = _order_id;

  RETURN jsonb_build_object('ok', true, 'consumed', _consumed, 'shortages', _missing);
END;
$$;

-- 3) Trigger automático quando o pedido vira concluded (1 vez só)
CREATE OR REPLACE FUNCTION public.pdv_auto_consume_stock_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'concluded'
     AND (OLD.status IS DISTINCT FROM 'concluded')
     AND NEW.stock_consumed_at IS NULL THEN
    PERFORM public.pdv_consume_order_stock(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pdv_auto_consume_stock ON public.pdv_orders;
CREATE TRIGGER trg_pdv_auto_consume_stock
AFTER UPDATE OF status ON public.pdv_orders
FOR EACH ROW
EXECUTE FUNCTION public.pdv_auto_consume_stock_trg();

-- E também para inserts já como concluded (caso do Balcão)
CREATE OR REPLACE FUNCTION public.pdv_auto_consume_stock_ins_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'concluded' AND NEW.stock_consumed_at IS NULL THEN
    PERFORM public.pdv_consume_order_stock(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pdv_auto_consume_stock_ins ON public.pdv_orders;
CREATE TRIGGER trg_pdv_auto_consume_stock_ins
AFTER INSERT ON public.pdv_orders
FOR EACH ROW
EXECUTE FUNCTION public.pdv_auto_consume_stock_ins_trg();

-- 4) View de ruptura: produtos abaixo do mínimo
CREATE OR REPLACE VIEW public.pdv_stock_shortages AS
SELECT
  s.store_id,
  s.product_id,
  p.name AS product_name,
  p.unit,
  s.quantity AS current_qty,
  s.min_qty,
  CASE
    WHEN s.quantity <= 0 THEN 'out'
    WHEN s.min_qty IS NOT NULL AND s.quantity < s.min_qty THEN 'low'
    ELSE 'ok'
  END AS severity,
  s.updated_at
FROM public.inventory_stock s
JOIN public.inventory_products p ON p.id = s.product_id
WHERE s.quantity <= 0
   OR (s.min_qty IS NOT NULL AND s.quantity < s.min_qty);
