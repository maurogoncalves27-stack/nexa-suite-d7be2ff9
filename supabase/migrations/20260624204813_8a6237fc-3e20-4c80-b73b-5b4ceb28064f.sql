
-- Função: estornar estoque consumido de um pedido (em caso de cancelamento)
CREATE OR REPLACE FUNCTION public.pdv_reverse_order_stock(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _store_id uuid;
  _already timestamptz;
  _row record;
  _reversed jsonb := '[]'::jsonb;
BEGIN
  SELECT store_id, stock_consumed_at INTO _store_id, _already
  FROM public.pdv_orders WHERE id = _order_id;

  IF _store_id IS NULL THEN
    RAISE EXCEPTION 'Pedido % não encontrado', _order_id;
  END IF;
  IF _already IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'nothing_to_reverse', true);
  END IF;

  FOR _row IN
    SELECT
      ri.product_id,
      SUM(oi.quantity * ri.quantity) AS qty_back,
      ip.name AS product_name
    FROM public.pdv_order_items oi
    JOIN public.menu_items mi ON mi.id = oi.menu_item_id
    JOIN public.recipe_ingredients ri ON ri.recipe_id = mi.recipe_id
    JOIN public.inventory_products ip ON ip.id = ri.product_id
    WHERE oi.order_id = _order_id
      AND mi.recipe_id IS NOT NULL
      AND COALESCE(ri.is_packaging, false) = false
      AND COALESCE(ip.infinite_stock, false) = false
    GROUP BY ri.product_id, ip.name
  LOOP
    INSERT INTO public.inventory_stock (store_id, product_id, quantity)
    VALUES (_store_id, _row.product_id, _row.qty_back)
    ON CONFLICT (store_id, product_id)
    DO UPDATE SET quantity = public.inventory_stock.quantity + _row.qty_back,
                  updated_at = now();

    INSERT INTO public.inventory_stock_movements
      (store_id, product_id, movement_type, quantity, reason, notes)
    VALUES
      (_store_id, _row.product_id, 'adjustment', _row.qty_back,
       'pdv_order_cancel', 'Estorno pedido ' || _order_id::text);

    _reversed := _reversed || jsonb_build_object(
      'product_id', _row.product_id,
      'name', _row.product_name,
      'qty', _row.qty_back
    );
  END LOOP;

  UPDATE public.pdv_orders
     SET stock_consumed_at = NULL,
         stock_consumed_by = NULL
   WHERE id = _order_id;

  RETURN jsonb_build_object('ok', true, 'reversed', _reversed);
END;
$$;

-- Trigger: ao mudar status, baixa ou estorna automaticamente.
-- Baixa quando entra em 'confirmed' / 'preparing' / 'concluded' pela primeira vez.
-- Estorna quando cai em 'cancelled' após já ter consumido.
CREATE OR REPLACE FUNCTION public.trg_pdv_order_status_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('confirmed','preparing','ready','dispatched','concluded')
       AND NEW.stock_consumed_at IS NULL THEN
      PERFORM public.pdv_consume_order_stock(NEW.id);
    ELSIF NEW.status = 'cancelled'
       AND NEW.stock_consumed_at IS NOT NULL THEN
      PERFORM public.pdv_reverse_order_stock(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pdv_orders_status_stock ON public.pdv_orders;
CREATE TRIGGER trg_pdv_orders_status_stock
AFTER UPDATE OF status ON public.pdv_orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_pdv_order_status_stock();
