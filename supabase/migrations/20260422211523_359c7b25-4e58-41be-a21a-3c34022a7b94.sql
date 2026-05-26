-- =========================================
-- 1. CATÁLOGO DE PRODUTOS
-- =========================================
CREATE TABLE public.inventory_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  internal_code TEXT,
  barcode TEXT,
  ncm TEXT,
  unit TEXT NOT NULL DEFAULT 'UN',
  category TEXT,
  average_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  last_cost NUMERIC(14,4),
  last_purchase_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_products_name ON public.inventory_products USING gin (name gin_trgm_ops);
CREATE INDEX idx_inventory_products_barcode ON public.inventory_products (barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_inventory_products_internal_code ON public.inventory_products (internal_code) WHERE internal_code IS NOT NULL;
CREATE UNIQUE INDEX uniq_inventory_products_barcode ON public.inventory_products (barcode) WHERE barcode IS NOT NULL;

ALTER TABLE public.inventory_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view products"
  ON public.inventory_products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Receivers can insert products"
  ON public.inventory_products FOR INSERT
  TO authenticated
  WITH CHECK (public.can_receive_inventory(auth.uid()));

CREATE POLICY "Receivers can update products"
  ON public.inventory_products FOR UPDATE
  TO authenticated
  USING (public.can_receive_inventory(auth.uid()));

CREATE POLICY "Admins can delete products"
  ON public.inventory_products FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_inventory_products_updated_at
  BEFORE UPDATE ON public.inventory_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- 2. ITENS DA NOTA
-- =========================================
CREATE TABLE public.inventory_invoice_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.inventory_invoices(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.inventory_products(id) ON DELETE SET NULL,
  -- dados originais (vindos do XML ou digitados)
  line_number INTEGER,
  original_description TEXT NOT NULL,
  original_code TEXT,
  original_barcode TEXT,
  original_ncm TEXT,
  unit TEXT NOT NULL DEFAULT 'UN',
  quantity NUMERIC(14,4) NOT NULL DEFAULT 0,
  unit_value NUMERIC(14,4) NOT NULL DEFAULT 0,
  total_value NUMERIC(14,4) NOT NULL DEFAULT 0,
  -- controle de recebimento
  received BOOLEAN NOT NULL DEFAULT false,
  received_at TIMESTAMPTZ,
  received_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inv_items_invoice ON public.inventory_invoice_items (invoice_id);
CREATE INDEX idx_inv_items_product ON public.inventory_invoice_items (product_id) WHERE product_id IS NOT NULL;

ALTER TABLE public.inventory_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users with store access can view invoice items"
  ON public.inventory_invoice_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inventory_invoices inv
      WHERE inv.id = invoice_id
        AND public.user_can_access_store(auth.uid(), inv.store_id)
    )
  );

CREATE POLICY "Receivers can insert invoice items"
  ON public.inventory_invoice_items FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_receive_inventory(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.inventory_invoices inv
      WHERE inv.id = invoice_id
        AND public.user_can_access_store(auth.uid(), inv.store_id)
    )
  );

CREATE POLICY "Receivers can update invoice items"
  ON public.inventory_invoice_items FOR UPDATE
  TO authenticated
  USING (
    public.can_receive_inventory(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.inventory_invoices inv
      WHERE inv.id = invoice_id
        AND public.user_can_access_store(auth.uid(), inv.store_id)
    )
  );

CREATE POLICY "Receivers can delete invoice items"
  ON public.inventory_invoice_items FOR DELETE
  TO authenticated
  USING (
    public.can_receive_inventory(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.inventory_invoices inv
      WHERE inv.id = invoice_id
        AND public.user_can_access_store(auth.uid(), inv.store_id)
    )
  );

CREATE TRIGGER trg_inventory_invoice_items_updated_at
  BEFORE UPDATE ON public.inventory_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- 3. SALDO DE ESTOQUE
-- =========================================
CREATE TABLE public.inventory_stock (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE CASCADE,
  quantity NUMERIC(14,4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, product_id)
);

CREATE INDEX idx_inv_stock_store ON public.inventory_stock (store_id);
CREATE INDEX idx_inv_stock_product ON public.inventory_stock (product_id);

ALTER TABLE public.inventory_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users with store access can view stock"
  ON public.inventory_stock FOR SELECT
  TO authenticated
  USING (public.user_can_access_store(auth.uid(), store_id));

-- =========================================
-- 4. MOVIMENTAÇÕES DE ESTOQUE
-- =========================================
CREATE TABLE public.inventory_stock_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('entrada','saida','ajuste','perda','devolucao')),
  quantity NUMERIC(14,4) NOT NULL,
  unit_cost NUMERIC(14,4),
  invoice_item_id UUID REFERENCES public.inventory_invoice_items(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES public.inventory_invoices(id) ON DELETE SET NULL,
  reason TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inv_mov_store_product ON public.inventory_stock_movements (store_id, product_id);
CREATE INDEX idx_inv_mov_created_at ON public.inventory_stock_movements (created_at DESC);
CREATE INDEX idx_inv_mov_invoice ON public.inventory_stock_movements (invoice_id) WHERE invoice_id IS NOT NULL;

ALTER TABLE public.inventory_stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users with store access can view movements"
  ON public.inventory_stock_movements FOR SELECT
  TO authenticated
  USING (public.user_can_access_store(auth.uid(), store_id));

CREATE POLICY "Receivers can insert movements"
  ON public.inventory_stock_movements FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_receive_inventory(auth.uid())
    AND public.user_can_access_store(auth.uid(), store_id)
  );

-- =========================================
-- 5. TRIGGER: aplicar movimentação ao saldo + custo médio
-- =========================================
CREATE OR REPLACE FUNCTION public.apply_inventory_stock_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delta NUMERIC(14,4);
  current_qty NUMERIC(14,4);
  current_avg NUMERIC(14,4);
  new_qty NUMERIC(14,4);
  new_avg NUMERIC(14,4);
BEGIN
  IF NEW.movement_type IN ('entrada','devolucao') THEN
    delta := NEW.quantity;
  ELSIF NEW.movement_type IN ('saida','perda') THEN
    delta := -NEW.quantity;
  ELSE -- ajuste: aceita positivo ou negativo conforme NEW.quantity
    delta := NEW.quantity;
  END IF;

  -- Upsert do saldo
  INSERT INTO public.inventory_stock (store_id, product_id, quantity)
  VALUES (NEW.store_id, NEW.product_id, GREATEST(delta, 0))
  ON CONFLICT (store_id, product_id) DO UPDATE
    SET quantity = public.inventory_stock.quantity + delta,
        updated_at = now();

  -- Recalcular custo médio na entrada (apenas para entradas com custo informado)
  IF NEW.movement_type = 'entrada' AND NEW.unit_cost IS NOT NULL AND NEW.unit_cost > 0 THEN
    SELECT average_cost INTO current_avg FROM public.inventory_products WHERE id = NEW.product_id;

    -- soma do saldo nesta loja após a entrada
    SELECT quantity INTO current_qty FROM public.inventory_stock
     WHERE store_id = NEW.store_id AND product_id = NEW.product_id;

    -- custo médio ponderado simples (por produto, considerando apenas a entrada atual)
    -- new_avg = (avg_atual * (saldo_anterior) + custo_unit * qtd_entrada) / saldo_atual
    new_qty := current_qty;
    IF new_qty > 0 THEN
      new_avg := ((COALESCE(current_avg, 0) * GREATEST(new_qty - NEW.quantity, 0)) + (NEW.unit_cost * NEW.quantity)) / new_qty;
    ELSE
      new_avg := NEW.unit_cost;
    END IF;

    UPDATE public.inventory_products
       SET average_cost = ROUND(new_avg, 4),
           last_cost = NEW.unit_cost,
           last_purchase_at = now(),
           updated_at = now()
     WHERE id = NEW.product_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apply_inventory_stock_movement
  AFTER INSERT ON public.inventory_stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_inventory_stock_movement();

-- =========================================
-- 6. RPC: marcar item como recebido (gera movimentação)
-- =========================================
CREATE OR REPLACE FUNCTION public.receive_invoice_item(_item_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_store UUID;
  v_mov_id UUID;
BEGIN
  IF NOT public.can_receive_inventory(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para receber mercadorias';
  END IF;

  SELECT i.*, inv.store_id AS store_id
    INTO v_item
    FROM public.inventory_invoice_items i
    JOIN public.inventory_invoices inv ON inv.id = i.invoice_id
   WHERE i.id = _item_id;

  IF v_item IS NULL THEN
    RAISE EXCEPTION 'Item não encontrado';
  END IF;
  IF v_item.received THEN
    RAISE EXCEPTION 'Item já foi recebido';
  END IF;
  IF v_item.product_id IS NULL THEN
    RAISE EXCEPTION 'Vincule este item a um produto antes de receber';
  END IF;

  v_store := v_item.store_id;

  IF NOT public.user_can_access_store(auth.uid(), v_store) THEN
    RAISE EXCEPTION 'Sem acesso à loja desta nota';
  END IF;

  INSERT INTO public.inventory_stock_movements
    (store_id, product_id, movement_type, quantity, unit_cost, invoice_item_id, invoice_id, reason, created_by)
  VALUES
    (v_store, v_item.product_id, 'entrada', v_item.quantity, v_item.unit_value, v_item.id, v_item.invoice_id, 'Recebimento de nota fiscal', auth.uid())
  RETURNING id INTO v_mov_id;

  UPDATE public.inventory_invoice_items
     SET received = true,
         received_at = now(),
         received_by = auth.uid(),
         updated_at = now()
   WHERE id = _item_id;

  RETURN v_mov_id;
END;
$$;