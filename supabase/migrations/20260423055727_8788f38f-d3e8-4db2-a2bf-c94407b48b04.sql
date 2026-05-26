-- ============================================
-- Rastreabilidade de lotes em transferências
-- ============================================

-- 1) Adicionar referência ao lote nos itens transferidos
ALTER TABLE public.inventory_transfer_items
  ADD COLUMN IF NOT EXISTS lot_id UUID REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS destination_lot_id UUID REFERENCES public.inventory_lots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_transfer_items_lot ON public.inventory_transfer_items(lot_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transfer_items_dest_lot ON public.inventory_transfer_items(destination_lot_id);

-- 2) Adicionar pai em inventory_lots para manter trilha origem→destino
ALTER TABLE public.inventory_lots
  ADD COLUMN IF NOT EXISTS parent_lot_id UUID REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin_transfer_id UUID REFERENCES public.inventory_transfers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lots_parent ON public.inventory_lots(parent_lot_id);
CREATE INDEX IF NOT EXISTS idx_lots_origin_transfer ON public.inventory_lots(origin_transfer_id);

-- 3) Substituir create_inventory_transfer para aceitar lote e baixar do lote
CREATE OR REPLACE FUNCTION public.create_inventory_transfer(
  _origin_store_id uuid,
  _destination_store_id uuid,
  _items jsonb,
  _sender_name text DEFAULT NULL::text,
  _notes text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_transfer_id UUID;
  v_item JSONB;
  v_product_id UUID;
  v_qty NUMERIC(14,4);
  v_avg NUMERIC(14,4);
  v_stock NUMERIC(14,4);
  v_name TEXT;
  v_lot_id UUID;
  v_lot_qty NUMERIC(14,4);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  IF _origin_store_id = _destination_store_id THEN
    RAISE EXCEPTION 'Loja origem e destino devem ser diferentes';
  END IF;
  IF NOT public.user_can_access_store(v_uid, _origin_store_id) THEN
    RAISE EXCEPTION 'Sem acesso à loja origem';
  END IF;
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Adicione ao menos um item';
  END IF;

  -- Validações
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_lot_id := NULLIF(v_item->>'lot_id','')::UUID;

    IF v_product_id IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Item inválido (produto ou quantidade)';
    END IF;

    -- Se lote informado, valida saldo do lote (não do estoque geral)
    IF v_lot_id IS NOT NULL THEN
      SELECT quantity INTO v_lot_qty FROM public.inventory_lots
        WHERE id = v_lot_id AND store_id = _origin_store_id AND product_id = v_product_id AND status = 'active';
      IF v_lot_qty IS NULL THEN
        RAISE EXCEPTION 'Lote não encontrado ou inválido para este produto/loja';
      END IF;
      IF v_lot_qty < v_qty THEN
        SELECT name INTO v_name FROM public.inventory_products WHERE id = v_product_id;
        RAISE EXCEPTION 'Saldo do lote insuficiente para % (lote: %, necessário: %)', v_name, v_lot_qty, v_qty;
      END IF;
    ELSE
      SELECT quantity INTO v_stock FROM public.inventory_stock
        WHERE store_id = _origin_store_id AND product_id = v_product_id;
      v_stock := COALESCE(v_stock, 0);
      IF v_stock < v_qty THEN
        SELECT name INTO v_name FROM public.inventory_products WHERE id = v_product_id;
        RAISE EXCEPTION 'Estoque insuficiente de % (saldo: %, necessário: %)', v_name, v_stock, v_qty;
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.inventory_transfers
    (origin_store_id, destination_store_id, sender_name, notes, sent_by)
  VALUES
    (_origin_store_id, _destination_store_id, _sender_name, _notes, v_uid)
  RETURNING id INTO v_transfer_id;

  -- Itens + baixa de estoque (e do lote, se aplicável)
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_lot_id := NULLIF(v_item->>'lot_id','')::UUID;
    SELECT average_cost INTO v_avg FROM public.inventory_products WHERE id = v_product_id;

    INSERT INTO public.inventory_transfer_items (transfer_id, product_id, quantity, unit_cost, lot_id)
    VALUES (v_transfer_id, v_product_id, v_qty, COALESCE(v_avg, 0), v_lot_id);

    -- Baixa do lote (se informado)
    IF v_lot_id IS NOT NULL THEN
      UPDATE public.inventory_lots
         SET quantity = quantity - v_qty,
             status = CASE WHEN quantity - v_qty <= 0 THEN 'depleted' ELSE status END,
             updated_at = now()
       WHERE id = v_lot_id;
    END IF;

    -- Movimento de saída (saldo geral)
    INSERT INTO public.inventory_stock_movements
      (store_id, product_id, movement_type, quantity, reason, created_by)
    VALUES
      (_origin_store_id, v_product_id, 'saida', v_qty,
       'Envio para outra loja (transferência ' || v_transfer_id || ')'
         || CASE WHEN v_lot_id IS NOT NULL THEN ' — lote ' || v_lot_id::text ELSE '' END,
       v_uid);
  END LOOP;

  RETURN v_transfer_id;
END;
$function$;

-- 4) Modificar a função de receber transferência para criar lote-filho na loja destino
-- Primeiro, vamos olhar se existe receive_inventory_transfer
DROP FUNCTION IF EXISTS public.receive_inventory_transfer(uuid, text);

CREATE OR REPLACE FUNCTION public.receive_inventory_transfer(
  _transfer_id uuid,
  _receiver_name text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_transfer RECORD;
  v_item RECORD;
  v_origin_lot RECORD;
  v_new_lot_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;

  SELECT * INTO v_transfer FROM public.inventory_transfers WHERE id = _transfer_id;
  IF v_transfer IS NULL THEN RAISE EXCEPTION 'Transferência não encontrada'; END IF;
  IF v_transfer.received_at IS NOT NULL THEN RAISE EXCEPTION 'Transferência já recebida'; END IF;

  IF NOT public.user_can_access_store(v_uid, v_transfer.destination_store_id) THEN
    RAISE EXCEPTION 'Sem acesso à loja destino';
  END IF;

  -- Para cada item: cria lote-filho (se origem tinha lote) e dá entrada no destino
  FOR v_item IN
    SELECT * FROM public.inventory_transfer_items WHERE transfer_id = _transfer_id
  LOOP
    v_new_lot_id := NULL;

    IF v_item.lot_id IS NOT NULL THEN
      SELECT * INTO v_origin_lot FROM public.inventory_lots WHERE id = v_item.lot_id;

      IF v_origin_lot.id IS NOT NULL THEN
        -- Cria lote-filho na loja destino mantendo nº, validade e fabricação
        INSERT INTO public.inventory_lots (
          store_id, product_id, lot_number, quantity, initial_quantity,
          unit_cost, manufacture_date, expiry_date, notes,
          status, parent_lot_id, origin_transfer_id, created_by
        ) VALUES (
          v_transfer.destination_store_id,
          v_origin_lot.product_id,
          v_origin_lot.lot_number,
          v_item.quantity,
          v_item.quantity,
          COALESCE(v_item.unit_cost, v_origin_lot.unit_cost),
          v_origin_lot.manufacture_date,
          v_origin_lot.expiry_date,
          'Recebido por transferência da loja origem (lote pai: ' || v_origin_lot.id::text || ')',
          'active',
          v_origin_lot.id,
          _transfer_id,
          v_uid
        ) RETURNING id INTO v_new_lot_id;

        UPDATE public.inventory_transfer_items
           SET destination_lot_id = v_new_lot_id
         WHERE id = v_item.id;
      END IF;
    END IF;

    -- Entrada no estoque destino
    INSERT INTO public.inventory_stock_movements
      (store_id, product_id, movement_type, quantity, unit_cost, reason, created_by)
    VALUES
      (v_transfer.destination_store_id, v_item.product_id, 'entrada', v_item.quantity,
       v_item.unit_cost,
       'Recebimento de transferência ' || _transfer_id::text
         || CASE WHEN v_new_lot_id IS NOT NULL THEN ' — lote ' || v_new_lot_id::text ELSE '' END,
       v_uid);
  END LOOP;

  UPDATE public.inventory_transfers
     SET received_at = now(),
         received_by = v_uid,
         receiver_name = COALESCE(_receiver_name, receiver_name),
         updated_at = now()
   WHERE id = _transfer_id;

  RETURN _transfer_id;
END;
$function$;

-- 5) Função para pegar trilha completa de um lote (raiz + filhos recursivamente)
CREATE OR REPLACE FUNCTION public.lot_trail(_lot_id uuid)
RETURNS TABLE(
  id uuid,
  store_id uuid,
  store_name text,
  product_name text,
  lot_number text,
  quantity numeric,
  initial_quantity numeric,
  expiry_date date,
  status text,
  parent_lot_id uuid,
  origin_transfer_id uuid,
  created_at timestamptz,
  depth int
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH RECURSIVE root AS (
    -- Sobe até a raiz
    SELECT l.* FROM public.inventory_lots l WHERE l.id = _lot_id
    UNION ALL
    SELECT p.* FROM public.inventory_lots p JOIN root r ON p.id = r.parent_lot_id
  ),
  topmost AS (
    SELECT * FROM root WHERE parent_lot_id IS NULL
    UNION ALL
    SELECT * FROM root WHERE id = _lot_id AND NOT EXISTS (SELECT 1 FROM root WHERE parent_lot_id IS NULL)
    LIMIT 1
  ),
  tree AS (
    SELECT l.*, 0 AS depth FROM public.inventory_lots l
      WHERE l.id = (SELECT id FROM topmost LIMIT 1)
    UNION ALL
    SELECT c.*, t.depth + 1 FROM public.inventory_lots c
      JOIN tree t ON c.parent_lot_id = t.id
  )
  SELECT t.id, t.store_id, s.name, p.name, t.lot_number, t.quantity, t.initial_quantity,
         t.expiry_date, t.status, t.parent_lot_id, t.origin_transfer_id, t.created_at, t.depth
    FROM tree t
    LEFT JOIN public.stores s ON s.id = t.store_id
    LEFT JOIN public.inventory_products p ON p.id = t.product_id
   ORDER BY t.depth, t.created_at;
$function$;