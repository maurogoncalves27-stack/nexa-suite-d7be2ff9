-- Tabela de transferências (envios) entre lojas
CREATE TABLE public.inventory_transfers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  origin_store_id UUID NOT NULL REFERENCES public.stores(id),
  destination_store_id UUID NOT NULL REFERENCES public.stores(id),
  status TEXT NOT NULL DEFAULT 'in_transit' CHECK (status IN ('in_transit','received','cancelled')),
  notes TEXT,
  sender_name TEXT,
  receiver_name TEXT,
  sent_by UUID NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  received_by UUID,
  received_at TIMESTAMP WITH TIME ZONE,
  cancelled_by UUID,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancel_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT inventory_transfers_distinct_stores CHECK (origin_store_id <> destination_store_id)
);

CREATE INDEX idx_inventory_transfers_origin ON public.inventory_transfers(origin_store_id);
CREATE INDEX idx_inventory_transfers_destination ON public.inventory_transfers(destination_store_id);
CREATE INDEX idx_inventory_transfers_status ON public.inventory_transfers(status);

-- Itens da transferência
CREATE TABLE public.inventory_transfer_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transfer_id UUID NOT NULL REFERENCES public.inventory_transfers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.inventory_products(id),
  quantity NUMERIC(14,4) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(14,4),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_transfer_items_transfer ON public.inventory_transfer_items(transfer_id);
CREATE INDEX idx_inventory_transfer_items_product ON public.inventory_transfer_items(product_id);

-- RLS
ALTER TABLE public.inventory_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transfer_items ENABLE ROW LEVEL SECURITY;

-- Visualização: pode ver quem tem acesso à loja origem ou destino (admin/manager veem tudo via user_can_access_store)
CREATE POLICY "Acesso via lojas" ON public.inventory_transfers
  FOR SELECT TO authenticated
  USING (
    public.user_can_access_store(auth.uid(), origin_store_id)
    OR public.user_can_access_store(auth.uid(), destination_store_id)
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );

-- Itens visíveis se a transferência for visível
CREATE POLICY "Acesso via transferência" ON public.inventory_transfer_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inventory_transfers t
      WHERE t.id = transfer_id
        AND (
          public.user_can_access_store(auth.uid(), t.origin_store_id)
          OR public.user_can_access_store(auth.uid(), t.destination_store_id)
          OR public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'manager')
        )
    )
  );

-- Trigger updated_at
CREATE TRIGGER update_inventory_transfers_updated_at
  BEFORE UPDATE ON public.inventory_transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RPC: criar envio (baixa imediata na origem; itens ficam "em trânsito" aguardando confirmação)
CREATE OR REPLACE FUNCTION public.create_inventory_transfer(
  _origin_store_id UUID,
  _destination_store_id UUID,
  _items JSONB,
  _sender_name TEXT DEFAULT NULL,
  _notes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_transfer_id UUID;
  v_item JSONB;
  v_product_id UUID;
  v_qty NUMERIC(14,4);
  v_avg NUMERIC(14,4);
  v_stock NUMERIC(14,4);
  v_name TEXT;
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

  -- Valida estoque suficiente em todos os itens
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    IF v_product_id IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Item inválido (produto ou quantidade)';
    END IF;
    SELECT quantity INTO v_stock FROM public.inventory_stock
      WHERE store_id = _origin_store_id AND product_id = v_product_id;
    v_stock := COALESCE(v_stock, 0);
    IF v_stock < v_qty THEN
      SELECT name INTO v_name FROM public.inventory_products WHERE id = v_product_id;
      RAISE EXCEPTION 'Estoque insuficiente de % (saldo: %, necessário: %)', v_name, v_stock, v_qty;
    END IF;
  END LOOP;

  INSERT INTO public.inventory_transfers
    (origin_store_id, destination_store_id, sender_name, notes, sent_by)
  VALUES
    (_origin_store_id, _destination_store_id, _sender_name, _notes, v_uid)
  RETURNING id INTO v_transfer_id;

  -- Registra itens (com snapshot do custo médio na origem) e baixa estoque
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    SELECT average_cost INTO v_avg FROM public.inventory_products WHERE id = v_product_id;

    INSERT INTO public.inventory_transfer_items (transfer_id, product_id, quantity, unit_cost)
    VALUES (v_transfer_id, v_product_id, v_qty, COALESCE(v_avg, 0));

    -- Baixa imediata na origem (vai para "em trânsito")
    INSERT INTO public.inventory_stock_movements
      (store_id, product_id, movement_type, quantity, reason, created_by)
    VALUES
      (_origin_store_id, v_product_id, 'saida', v_qty,
       'Envio para outra loja (transferência ' || v_transfer_id || ')', v_uid);
  END LOOP;

  RETURN v_transfer_id;
END;
$$;

-- RPC: confirmar recebimento (entrada na loja destino)
CREATE OR REPLACE FUNCTION public.confirm_inventory_transfer(
  _transfer_id UUID,
  _receiver_name TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_t RECORD;
  v_item RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  SELECT * INTO v_t FROM public.inventory_transfers WHERE id = _transfer_id;
  IF v_t IS NULL THEN RAISE EXCEPTION 'Transferência não encontrada'; END IF;
  IF v_t.status <> 'in_transit' THEN
    RAISE EXCEPTION 'Esta transferência não está em trânsito (status: %)', v_t.status;
  END IF;
  IF NOT public.user_can_access_store(v_uid, v_t.destination_store_id) THEN
    RAISE EXCEPTION 'Sem acesso à loja de destino';
  END IF;

  -- Entrada na loja destino com custo unitário do snapshot
  FOR v_item IN
    SELECT product_id, quantity, unit_cost FROM public.inventory_transfer_items
     WHERE transfer_id = _transfer_id
  LOOP
    INSERT INTO public.inventory_stock_movements
      (store_id, product_id, movement_type, quantity, unit_cost, reason, created_by)
    VALUES
      (v_t.destination_store_id, v_item.product_id, 'entrada', v_item.quantity,
       NULLIF(v_item.unit_cost, 0),
       'Recebimento de transferência ' || _transfer_id, v_uid);
  END LOOP;

  UPDATE public.inventory_transfers
     SET status = 'received',
         received_by = v_uid,
         received_at = now(),
         receiver_name = COALESCE(_receiver_name, receiver_name),
         updated_at = now()
   WHERE id = _transfer_id;

  RETURN TRUE;
END;
$$;

-- RPC: cancelar envio (devolve para a origem)
CREATE OR REPLACE FUNCTION public.cancel_inventory_transfer(
  _transfer_id UUID,
  _reason TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_t RECORD;
  v_item RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  SELECT * INTO v_t FROM public.inventory_transfers WHERE id = _transfer_id;
  IF v_t IS NULL THEN RAISE EXCEPTION 'Transferência não encontrada'; END IF;
  IF v_t.status <> 'in_transit' THEN
    RAISE EXCEPTION 'Apenas transferências em trânsito podem ser canceladas';
  END IF;
  IF NOT (public.user_can_access_store(v_uid, v_t.origin_store_id)
       OR public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'manager')) THEN
    RAISE EXCEPTION 'Sem permissão para cancelar';
  END IF;

  -- Devolve à origem
  FOR v_item IN
    SELECT product_id, quantity FROM public.inventory_transfer_items
     WHERE transfer_id = _transfer_id
  LOOP
    INSERT INTO public.inventory_stock_movements
      (store_id, product_id, movement_type, quantity, reason, created_by)
    VALUES
      (v_t.origin_store_id, v_item.product_id, 'devolucao', v_item.quantity,
       'Cancelamento de transferência ' || _transfer_id, v_uid);
  END LOOP;

  UPDATE public.inventory_transfers
     SET status = 'cancelled',
         cancelled_by = v_uid,
         cancelled_at = now(),
         cancel_reason = _reason,
         updated_at = now()
   WHERE id = _transfer_id;

  RETURN TRUE;
END;
$$;