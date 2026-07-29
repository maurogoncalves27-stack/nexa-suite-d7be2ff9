CREATE OR REPLACE FUNCTION public.apply_uniform_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delta INTEGER;
  current_qty INTEGER;
BEGIN
  IF NEW.movement_type IN ('entrada','devolucao') THEN
    delta := NEW.quantity;
  ELSIF NEW.movement_type IN ('saida','perda') THEN
    delta := -NEW.quantity;
  ELSE
    delta := NEW.quantity;
  END IF;

  INSERT INTO public.uniform_stock (store_id, uniform_item_id, size, quantity, condition)
    VALUES (NEW.store_id, NEW.uniform_item_id, NEW.size, delta, COALESCE(NEW.condition,'nova'))
  ON CONFLICT (store_id, uniform_item_id, size, condition)
    DO UPDATE SET quantity = public.uniform_stock.quantity + delta,
                  updated_at = now();

  SELECT quantity INTO current_qty FROM public.uniform_stock
   WHERE store_id = NEW.store_id
     AND uniform_item_id = NEW.uniform_item_id
     AND size = NEW.size
     AND condition = COALESCE(NEW.condition,'nova');

  IF current_qty < 0 THEN
    RAISE EXCEPTION 'Estoque insuficiente para % (tam %, %): saldo ficaria %.',
      NEW.uniform_item_id, NEW.size, COALESCE(NEW.condition,'nova'), current_qty;
  END IF;
  RETURN NEW;
END;
$$;