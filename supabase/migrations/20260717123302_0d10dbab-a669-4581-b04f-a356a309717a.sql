
-- 1) Novas colunas de condição
ALTER TABLE public.uniform_stock
  ADD COLUMN IF NOT EXISTS condition text NOT NULL DEFAULT 'nova';
ALTER TABLE public.uniform_stock
  DROP CONSTRAINT IF EXISTS uniform_stock_condition_chk;
ALTER TABLE public.uniform_stock
  ADD CONSTRAINT uniform_stock_condition_chk CHECK (condition IN ('nova','usada'));

ALTER TABLE public.uniform_stock_movements
  ADD COLUMN IF NOT EXISTS condition text NOT NULL DEFAULT 'nova';
ALTER TABLE public.uniform_stock_movements
  DROP CONSTRAINT IF EXISTS uniform_stock_movements_condition_chk;
ALTER TABLE public.uniform_stock_movements
  ADD CONSTRAINT uniform_stock_movements_condition_chk CHECK (condition IN ('nova','usada'));

ALTER TABLE public.uniform_delivery_items
  ADD COLUMN IF NOT EXISTS condition_at_delivery text NOT NULL DEFAULT 'nova';
ALTER TABLE public.uniform_delivery_items
  DROP CONSTRAINT IF EXISTS uniform_delivery_items_condition_chk;
ALTER TABLE public.uniform_delivery_items
  ADD CONSTRAINT uniform_delivery_items_condition_chk CHECK (condition_at_delivery IN ('nova','usada'));

-- 2) Consolidação do estoque em ESTOQUE CENTRAL (sede) com condição 'nova'
DO $mig$
DECLARE
  sede uuid := '06ae09d6-4589-47a4-8a7e-b5467e94d081';
BEGIN
  -- move todo saldo positivo para a sede como 'nova'
  INSERT INTO public.uniform_stock (store_id, uniform_item_id, size, quantity, min_alert, condition)
  SELECT sede, uniform_item_id, size, SUM(quantity), COALESCE(MAX(min_alert),0), 'nova'
    FROM public.uniform_stock
   WHERE store_id <> sede
   GROUP BY uniform_item_id, size
  ON CONFLICT DO NOTHING;

  -- Somar (upsert manual) porque a unique atual não inclui condition
  UPDATE public.uniform_stock s
     SET quantity = s.quantity + agg.qty,
         updated_at = now()
    FROM (
      SELECT uniform_item_id, size, SUM(quantity) AS qty
        FROM public.uniform_stock
       WHERE store_id <> sede
       GROUP BY uniform_item_id, size
    ) agg
   WHERE s.store_id = sede
     AND s.uniform_item_id = agg.uniform_item_id
     AND s.size = agg.size;

  DELETE FROM public.uniform_stock WHERE store_id <> sede;
END $mig$;

-- 3) Recriar unique key incluindo condition
ALTER TABLE public.uniform_stock
  DROP CONSTRAINT IF EXISTS uniform_stock_store_id_uniform_item_id_size_key;
ALTER TABLE public.uniform_stock
  ADD CONSTRAINT uniform_stock_store_item_size_condition_key
  UNIQUE (store_id, uniform_item_id, size, condition);

-- 4) Atualiza trigger de movimentação para respeitar condition
CREATE OR REPLACE FUNCTION public.apply_uniform_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    VALUES (NEW.store_id, NEW.uniform_item_id, NEW.size, GREATEST(delta,0), COALESCE(NEW.condition,'nova'))
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
$function$;

-- 5) Trigger em uniform_return_items: atualiza returned_quantity e devolve pra sede como 'usada'
CREATE OR REPLACE FUNCTION public.apply_uniform_return_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  sede uuid := '06ae09d6-4589-47a4-8a7e-b5467e94d081';
  emp_name text;
BEGIN
  -- Incrementa returned_quantity na peça original entregue
  IF NEW.delivery_item_id IS NOT NULL THEN
    UPDATE public.uniform_delivery_items
       SET returned_quantity = COALESCE(returned_quantity,0) + NEW.quantity
     WHERE id = NEW.delivery_item_id;
  END IF;

  -- Volta ao estoque como usada, na sede, quando marcado
  IF NEW.back_to_stock IS TRUE THEN
    SELECT e.full_name INTO emp_name
      FROM public.uniform_returns r
      JOIN public.employees e ON e.id = r.employee_id
     WHERE r.id = NEW.return_id;

    INSERT INTO public.uniform_stock_movements
      (store_id, uniform_item_id, size, movement_type, quantity, reason, condition)
    VALUES
      (sede, NEW.uniform_item_id, NEW.size, 'devolucao', NEW.quantity,
       'Devolução de ' || COALESCE(emp_name,'colaborador'), 'usada');
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_apply_uniform_return_item ON public.uniform_return_items;
CREATE TRIGGER trg_apply_uniform_return_item
AFTER INSERT ON public.uniform_return_items
FOR EACH ROW EXECUTE FUNCTION public.apply_uniform_return_item();

-- 6) View de pendências por colaborador desligado (para painel + rescisão)
CREATE OR REPLACE VIEW public.uniform_pending_returns AS
SELECT
  e.id                        AS employee_id,
  e.full_name                 AS employee_name,
  e.status                    AS employee_status,
  e.termination_date          AS termination_date,
  COALESCE(e.allocated_store_id, e.store_id) AS store_id,
  di.id                       AS delivery_item_id,
  di.uniform_item_id,
  ui.name                     AS item_name,
  di.size,
  (di.quantity - COALESCE(di.returned_quantity,0)) AS pending_qty,
  di.unit_cost,
  (di.quantity - COALESCE(di.returned_quantity,0))::numeric * di.unit_cost AS pending_value,
  d.delivered_on
  FROM public.uniform_delivery_items di
  JOIN public.uniform_deliveries d ON d.id = di.delivery_id
  JOIN public.employees e          ON e.id = d.employee_id
  JOIN public.uniform_items ui     ON ui.id = di.uniform_item_id
 WHERE di.expected_return = TRUE
   AND (di.quantity - COALESCE(di.returned_quantity,0)) > 0;

GRANT SELECT ON public.uniform_pending_returns TO authenticated;

-- 7) has_pending_uniforms(): bloqueio de rescisão
CREATE OR REPLACE FUNCTION public.has_pending_uniforms(_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.uniform_pending_returns WHERE employee_id = _employee_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_pending_uniforms(uuid) TO authenticated;
