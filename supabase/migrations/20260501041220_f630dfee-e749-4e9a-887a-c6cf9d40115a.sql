
-- RPC para registrar lotes durante a contagem:
-- 1. Substitui (descarta) lotes ativos do produto/loja
-- 2. Cria os novos lotes informados
-- 3. Auto-preenche counted_quantity do item da contagem com a soma
CREATE OR REPLACE FUNCTION public.set_count_item_lots(
  _count_item_id uuid,
  _lots jsonb -- [{quantity: number, expiry_date: 'YYYY-MM-DD', lot_number?: text, manufacture_date?: 'YYYY-MM-DD', notes?: text}]
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item record;
  v_count record;
  v_total numeric := 0;
  v_lot jsonb;
  v_qty numeric;
  v_unit_cost numeric;
BEGIN
  SELECT ci.*, ip.requires_expiry
    INTO v_item
  FROM public.inventory_count_items ci
  JOIN public.inventory_products ip ON ip.id = ci.product_id
  WHERE ci.id = _count_item_id;

  IF v_item IS NULL THEN
    RAISE EXCEPTION 'Item da contagem não encontrado';
  END IF;

  SELECT * INTO v_count FROM public.inventory_counts WHERE id = v_item.count_id;
  IF v_count.status NOT IN ('open','submitted') THEN
    RAISE EXCEPTION 'Contagem não está editável (status: %)', v_count.status;
  END IF;

  -- Soma e validações
  IF jsonb_typeof(_lots) <> 'array' THEN
    RAISE EXCEPTION 'Parâmetro _lots deve ser um array';
  END IF;

  FOR v_lot IN SELECT * FROM jsonb_array_elements(_lots) LOOP
    v_qty := COALESCE((v_lot->>'quantity')::numeric, 0);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantidade do lote deve ser positiva';
    END IF;
    IF (v_lot->>'expiry_date') IS NULL THEN
      RAISE EXCEPTION 'Validade obrigatória em todos os lotes';
    END IF;
    v_total := v_total + v_qty;
  END LOOP;

  v_unit_cost := COALESCE(v_item.unit_cost, 0);

  -- Descarta lotes ativos atuais do produto/loja
  UPDATE public.inventory_lots
  SET status = 'discarded',
      quantity = 0,
      notes = COALESCE(notes,'') || E'\n[Substituído por contagem ' || v_count.id || ']',
      updated_at = now()
  WHERE store_id = v_count.store_id
    AND product_id = v_item.product_id
    AND status = 'active';

  -- Insere os novos lotes
  FOR v_lot IN SELECT * FROM jsonb_array_elements(_lots) LOOP
    v_qty := (v_lot->>'quantity')::numeric;
    INSERT INTO public.inventory_lots (
      store_id, product_id, lot_number, quantity, initial_quantity,
      unit_cost, manufacture_date, expiry_date, notes, status, created_by
    ) VALUES (
      v_count.store_id,
      v_item.product_id,
      NULLIF(v_lot->>'lot_number',''),
      v_qty,
      v_qty,
      v_unit_cost,
      NULLIF(v_lot->>'manufacture_date','')::date,
      (v_lot->>'expiry_date')::date,
      NULLIF(v_lot->>'notes',''),
      'active',
      auth.uid()
    );
  END LOOP;

  -- Auto-preenche a quantidade contada com a soma dos lotes
  UPDATE public.inventory_count_items
  SET counted_quantity = v_total,
      counted_by = auth.uid(),
      counted_at = now()
  WHERE id = _count_item_id;

  RETURN v_total;
END;
$$;

-- RPC para ler os lotes ativos atuais do produto/loja (para abrir o dialog já preenchido)
CREATE OR REPLACE FUNCTION public.get_product_active_lots(
  _store_id uuid,
  _product_id uuid
)
RETURNS TABLE (
  id uuid,
  lot_number text,
  quantity numeric,
  manufacture_date date,
  expiry_date date,
  notes text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, lot_number, quantity, manufacture_date, expiry_date, notes
  FROM public.inventory_lots
  WHERE store_id = _store_id
    AND product_id = _product_id
    AND status = 'active'
  ORDER BY expiry_date ASC NULLS LAST, created_at ASC;
$$;
