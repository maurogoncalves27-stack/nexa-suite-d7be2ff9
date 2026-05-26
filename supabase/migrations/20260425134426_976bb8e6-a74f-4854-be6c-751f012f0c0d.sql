-- ============== ENUM DE STATUS ==============
CREATE TYPE public.factory_request_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'shipped',
  'received',
  'cancelled'
);

-- ============== TABELAS ==============
CREATE TABLE public.factory_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  status public.factory_request_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  rejection_reason TEXT,
  requested_by UUID NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  shipped_by UUID,
  shipped_at TIMESTAMPTZ,
  received_by UUID,
  received_at TIMESTAMPTZ,
  cancelled_by UUID,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_factory_requests_store ON public.factory_requests(store_id);
CREATE INDEX idx_factory_requests_status ON public.factory_requests(status);
CREATE INDEX idx_factory_requests_created ON public.factory_requests(created_at DESC);

CREATE TABLE public.factory_request_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES public.factory_requests(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE RESTRICT,
  quantity_requested NUMERIC(14,4) NOT NULL CHECK (quantity_requested > 0),
  quantity_approved NUMERIC(14,4),
  quantity_delivered NUMERIC(14,4),
  unit TEXT NOT NULL,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_factory_request_items_request ON public.factory_request_items(request_id);
CREATE INDEX idx_factory_request_items_product ON public.factory_request_items(product_id);

CREATE TRIGGER update_factory_requests_updated_at
  BEFORE UPDATE ON public.factory_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_factory_request_items_updated_at
  BEFORE UPDATE ON public.factory_request_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== HELPER: usuário pertence à fábrica? ==============
CREATE OR REPLACE FUNCTION public.user_works_at_factory(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees e
    JOIN public.stores s ON s.id = COALESCE(e.allocated_store_id, e.store_id)
    WHERE e.user_id = _user_id
      AND s.store_type = 'fabrica'
      AND e.status IN ('active','in_training')
  );
$$;

-- ============== RLS ==============
ALTER TABLE public.factory_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_request_items ENABLE ROW LEVEL SECURITY;

-- factory_requests: SELECT
CREATE POLICY "View factory requests"
  ON public.factory_requests FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.user_works_at_factory(auth.uid())
    OR public.user_can_access_store(auth.uid(), store_id)
  );

-- factory_requests: INSERT (loja cria pedido para sua loja, não-fábrica)
CREATE POLICY "Create factory request from own store"
  ON public.factory_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND public.user_can_access_store(auth.uid(), store_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_id AND s.store_type = 'fabrica'
    )
  );

-- factory_requests: UPDATE — staff/fábrica gerenciam, criador pode cancelar enquanto pendente,
-- loja pode confirmar recebimento.
CREATE POLICY "Update factory requests"
  ON public.factory_requests FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.user_works_at_factory(auth.uid())
    OR (requested_by = auth.uid() AND status = 'pending')
    OR (status = 'shipped' AND public.user_can_access_store(auth.uid(), store_id))
  );

-- factory_requests: DELETE — só admin
CREATE POLICY "Delete factory requests admin only"
  ON public.factory_requests FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- factory_request_items: SELECT (segue o pedido)
CREATE POLICY "View factory request items"
  ON public.factory_request_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.factory_requests r
      WHERE r.id = request_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'manager')
          OR public.user_works_at_factory(auth.uid())
          OR public.user_can_access_store(auth.uid(), r.store_id)
        )
    )
  );

-- factory_request_items: INSERT — pode quem é dono do pedido pendente OU staff/fábrica
CREATE POLICY "Insert factory request items"
  ON public.factory_request_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.factory_requests r
      WHERE r.id = request_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'manager')
          OR public.user_works_at_factory(auth.uid())
          OR (r.requested_by = auth.uid() AND r.status = 'pending')
        )
    )
  );

CREATE POLICY "Update factory request items"
  ON public.factory_request_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.factory_requests r
      WHERE r.id = request_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'manager')
          OR public.user_works_at_factory(auth.uid())
          OR (r.requested_by = auth.uid() AND r.status = 'pending')
        )
    )
  );

CREATE POLICY "Delete factory request items"
  ON public.factory_request_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.factory_requests r
      WHERE r.id = request_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'manager')
          OR public.user_works_at_factory(auth.uid())
          OR (r.requested_by = auth.uid() AND r.status = 'pending')
        )
    )
  );

-- ============== RPC: confirmar recebimento ==============
-- Move estoque da FABRICA → loja solicitante usando quantity_delivered de cada item
CREATE OR REPLACE FUNCTION public.confirm_factory_request_receipt(_request_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_req RECORD;
  v_factory_store_id UUID;
  v_item RECORD;
  v_qty NUMERIC;
  v_avg NUMERIC;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária';
  END IF;

  SELECT * INTO v_req FROM public.factory_requests WHERE id = _request_id FOR UPDATE;
  IF v_req IS NULL THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;
  IF v_req.status <> 'shipped' THEN
    RAISE EXCEPTION 'Só é possível confirmar recebimento de pedidos enviados';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'admin')
    OR public.has_role(v_uid, 'manager')
    OR public.user_can_access_store(v_uid, v_req.store_id)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para confirmar recebimento desta loja';
  END IF;

  SELECT id INTO v_factory_store_id FROM public.stores WHERE store_type = 'fabrica' LIMIT 1;
  IF v_factory_store_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma loja tipo fábrica configurada';
  END IF;

  FOR v_item IN
    SELECT id, product_id, COALESCE(quantity_delivered, quantity_approved, quantity_requested) AS qty
      FROM public.factory_request_items
     WHERE request_id = _request_id
  LOOP
    v_qty := v_item.qty;
    IF v_qty IS NULL OR v_qty <= 0 THEN CONTINUE; END IF;

    SELECT average_cost INTO v_avg FROM public.inventory_products WHERE id = v_item.product_id;
    v_avg := COALESCE(v_avg, 0);

    -- Saída na fábrica
    INSERT INTO public.inventory_stock_movements
      (store_id, product_id, movement_type, quantity, unit_cost, reason, created_by)
    VALUES
      (v_factory_store_id, v_item.product_id, 'saida', v_qty, v_avg,
       'Solicitação loja #' || _request_id, v_uid);

    -- Entrada na loja
    INSERT INTO public.inventory_stock_movements
      (store_id, product_id, movement_type, quantity, unit_cost, reason, created_by)
    VALUES
      (v_req.store_id, v_item.product_id, 'entrada', v_qty, v_avg,
       'Recebimento da fábrica #' || _request_id, v_uid);
  END LOOP;

  UPDATE public.factory_requests
     SET status = 'received',
         received_by = v_uid,
         received_at = now(),
         updated_at = now()
   WHERE id = _request_id;

  RETURN _request_id;
END;
$$;