-- ============ ETAPA 2: Perdas + Lotes/Validades ============

-- 1) Tabela de perdas diárias
CREATE TABLE public.inventory_losses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE CASCADE,
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  quantity NUMERIC(14,4) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(14,4),
  total_cost NUMERIC(14,4),
  reason TEXT NOT NULL DEFAULT 'vencimento', -- vencimento, quebra, descarte, contaminacao, outro
  lot_id UUID,
  notes TEXT,
  created_by UUID,
  movement_id UUID, -- referência ao movimento de estoque gerado
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_losses_store_date ON public.inventory_losses(store_id, occurred_on DESC);
CREATE INDEX idx_losses_product ON public.inventory_losses(product_id);

ALTER TABLE public.inventory_losses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff e usuários da loja podem ver perdas"
ON public.inventory_losses FOR SELECT
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')
  OR user_can_access_store(auth.uid(), store_id)
);

CREATE POLICY "Staff e usuários da loja podem registrar perdas"
ON public.inventory_losses FOR INSERT
WITH CHECK (
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')
   OR user_can_access_store(auth.uid(), store_id))
  AND created_by = auth.uid()
);

CREATE POLICY "Apenas staff pode editar perdas"
ON public.inventory_losses FOR UPDATE
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

CREATE POLICY "Apenas staff pode excluir perdas"
ON public.inventory_losses FOR DELETE
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

CREATE TRIGGER trg_losses_updated_at
BEFORE UPDATE ON public.inventory_losses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Tabela de lotes (controle de validade)
CREATE TABLE public.inventory_lots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE CASCADE,
  lot_number TEXT,
  quantity NUMERIC(14,4) NOT NULL DEFAULT 0,
  initial_quantity NUMERIC(14,4) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(14,4),
  manufacture_date DATE,
  expiry_date DATE NOT NULL,
  invoice_id UUID REFERENCES public.inventory_invoices(id) ON DELETE SET NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active, depleted, expired, discarded
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lots_store_product ON public.inventory_lots(store_id, product_id);
CREATE INDEX idx_lots_expiry ON public.inventory_lots(expiry_date) WHERE status = 'active';
CREATE INDEX idx_lots_status ON public.inventory_lots(status);

ALTER TABLE public.inventory_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff e usuários da loja podem ver lotes"
ON public.inventory_lots FOR SELECT
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')
  OR user_can_access_store(auth.uid(), store_id)
);

CREATE POLICY "Staff e usuários da loja podem criar lotes"
ON public.inventory_lots FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')
  OR user_can_access_store(auth.uid(), store_id)
);

CREATE POLICY "Staff e usuários da loja podem atualizar lotes"
ON public.inventory_lots FOR UPDATE
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')
  OR user_can_access_store(auth.uid(), store_id)
);

CREATE POLICY "Apenas staff pode excluir lotes"
ON public.inventory_lots FOR DELETE
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

CREATE TRIGGER trg_lots_updated_at
BEFORE UPDATE ON public.inventory_lots
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- FK do lote referenciado em perdas
ALTER TABLE public.inventory_losses
  ADD CONSTRAINT inventory_losses_lot_fk
  FOREIGN KEY (lot_id) REFERENCES public.inventory_lots(id) ON DELETE SET NULL;

-- 3) Função: registrar perda (cria movimento de estoque + baixa lote se informado)
CREATE OR REPLACE FUNCTION public.register_inventory_loss(
  _store_id UUID,
  _product_id UUID,
  _quantity NUMERIC,
  _reason TEXT DEFAULT 'vencimento',
  _lot_id UUID DEFAULT NULL,
  _notes TEXT DEFAULT NULL,
  _occurred_on DATE DEFAULT CURRENT_DATE
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_avg NUMERIC(14,4);
  v_loss_id UUID;
  v_mov_id UUID;
  v_stock NUMERIC(14,4);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  IF NOT (has_role(v_uid,'admin') OR has_role(v_uid,'manager') OR user_can_access_store(v_uid, _store_id)) THEN
    RAISE EXCEPTION 'Sem acesso a esta loja';
  END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade deve ser maior que zero';
  END IF;

  -- Valida saldo
  SELECT quantity INTO v_stock FROM inventory_stock
   WHERE store_id = _store_id AND product_id = _product_id;
  v_stock := COALESCE(v_stock, 0);
  IF v_stock < _quantity THEN
    RAISE EXCEPTION 'Estoque insuficiente (saldo: %, perda: %)', v_stock, _quantity;
  END IF;

  -- Custo médio
  SELECT average_cost INTO v_avg FROM inventory_products WHERE id = _product_id;
  v_avg := COALESCE(v_avg, 0);

  -- Movimento de saída tipo 'perda'
  INSERT INTO inventory_stock_movements
    (store_id, product_id, movement_type, quantity, unit_cost, reason, created_by)
  VALUES
    (_store_id, _product_id, 'perda', _quantity, v_avg,
     'Perda: ' || _reason || COALESCE(' - ' || _notes, ''), v_uid)
  RETURNING id INTO v_mov_id;

  -- Registra a perda
  INSERT INTO inventory_losses
    (store_id, product_id, occurred_on, quantity, unit_cost, total_cost,
     reason, lot_id, notes, created_by, movement_id)
  VALUES
    (_store_id, _product_id, _occurred_on, _quantity, v_avg, v_avg * _quantity,
     _reason, _lot_id, _notes, v_uid, v_mov_id)
  RETURNING id INTO v_loss_id;

  -- Baixa do lote
  IF _lot_id IS NOT NULL THEN
    UPDATE inventory_lots
       SET quantity = GREATEST(quantity - _quantity, 0),
           status = CASE WHEN (quantity - _quantity) <= 0 THEN 'depleted' ELSE status END,
           updated_at = now()
     WHERE id = _lot_id;
  END IF;

  RETURN v_loss_id;
END;
$$;

-- 4) View para alertas de validade
CREATE OR REPLACE VIEW public.inventory_lot_alerts AS
SELECT
  l.id AS lot_id,
  l.store_id,
  s.name AS store_name,
  l.product_id,
  p.name AS product_name,
  p.unit,
  l.lot_number,
  l.quantity,
  l.expiry_date,
  (l.expiry_date - CURRENT_DATE) AS days_to_expiry,
  CASE
    WHEN l.expiry_date < CURRENT_DATE THEN 'expired'
    WHEN (l.expiry_date - CURRENT_DATE) <= 7 THEN 'critical'
    WHEN (l.expiry_date - CURRENT_DATE) <= 15 THEN 'warning'
    WHEN (l.expiry_date - CURRENT_DATE) <= 30 THEN 'attention'
    ELSE 'ok'
  END AS alert_level
FROM public.inventory_lots l
JOIN public.inventory_products p ON p.id = l.product_id
JOIN public.stores s ON s.id = l.store_id
WHERE l.status = 'active' AND l.quantity > 0;