-- ============================================================
-- VALE GÁS
-- ============================================================

-- 1) Categoria financeira fixa "Vale Gás"
INSERT INTO public.finance_categories (name, kind, dre_group, sort_order)
VALUES ('Vale Gás', 'expense', 'expense_admin', 100)
ON CONFLICT (name, kind) DO NOTHING;

-- 2) Configuração (singleton): preço atual do vale gás
CREATE TABLE public.gas_voucher_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_price numeric(10,2) NOT NULL DEFAULT 120.00,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.gas_voucher_settings (unit_price) VALUES (120.00);

ALTER TABLE public.gas_voucher_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated reads gas settings"
  ON public.gas_voucher_settings FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Staff manages gas settings"
  ON public.gas_voucher_settings FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER tg_gas_voucher_settings_updated
  BEFORE UPDATE ON public.gas_voucher_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Compras de vales gás
CREATE TABLE public.gas_voucher_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchased_at date NOT NULL DEFAULT CURRENT_DATE,
  total_amount numeric(12,2) NOT NULL,
  unit_price numeric(10,2) NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  remaining integer NOT NULL,
  bank_transaction_id uuid REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_gas_purchases_date ON public.gas_voucher_purchases (purchased_at DESC);

ALTER TABLE public.gas_voucher_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated reads gas purchases"
  ON public.gas_voucher_purchases FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Staff manages gas purchases"
  ON public.gas_voucher_purchases FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER tg_gas_voucher_purchases_updated
  BEFORE UPDATE ON public.gas_voucher_purchases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Estado dos bujões por loja (1 em uso + 1 reserva)
CREATE TABLE public.gas_voucher_store_state (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  has_reserve boolean NOT NULL DEFAULT true,
  reserve_activated_at timestamptz, -- preenche quando reserva entra em uso
  last_received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gas_voucher_store_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated reads gas state"
  ON public.gas_voucher_store_state FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Staff manages gas state"
  ON public.gas_voucher_store_state FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER tg_gas_voucher_store_state_updated
  BEFORE UPDATE ON public.gas_voucher_store_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Solicitações / movimentações
-- status: 'requested' (loja informou que solicitou à empresa de gás)
--       | 'received'  (loja confirmou o recebimento -> abate 1 vale)
--       | 'cancelled'
CREATE TABLE public.gas_voucher_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','received','cancelled')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by uuid,
  received_at timestamptz,
  received_by uuid,
  purchase_id uuid REFERENCES public.gas_voucher_purchases(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_gas_requests_store ON public.gas_voucher_requests (store_id, requested_at DESC);
CREATE INDEX idx_gas_requests_status ON public.gas_voucher_requests (status);

-- Apenas 1 solicitação aberta (requested) por loja
CREATE UNIQUE INDEX idx_gas_requests_one_open_per_store
  ON public.gas_voucher_requests (store_id)
  WHERE status = 'requested';

ALTER TABLE public.gas_voucher_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated reads gas requests"
  ON public.gas_voucher_requests FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated creates gas requests"
  ON public.gas_voucher_requests FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated updates gas requests"
  ON public.gas_voucher_requests FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Staff deletes gas requests"
  ON public.gas_voucher_requests FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER tg_gas_voucher_requests_updated
  BEFORE UPDATE ON public.gas_voucher_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6) RPC: usar reserva (loja marca que está usando o reserva e abre solicitação)
CREATE OR REPLACE FUNCTION public.gas_use_reserve(_store_id uuid, _notes text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id uuid;
  v_open_id uuid;
BEGIN
  -- Garante registro de estado
  INSERT INTO public.gas_voucher_store_state (store_id, has_reserve)
  VALUES (_store_id, true)
  ON CONFLICT (store_id) DO NOTHING;

  -- Marca reserva como em uso
  UPDATE public.gas_voucher_store_state
     SET has_reserve = false,
         reserve_activated_at = COALESCE(reserve_activated_at, now())
   WHERE store_id = _store_id;

  -- Reaproveita solicitação aberta se existir
  SELECT id INTO v_open_id
    FROM public.gas_voucher_requests
   WHERE store_id = _store_id AND status = 'requested'
   LIMIT 1;

  IF v_open_id IS NOT NULL THEN
    RETURN v_open_id;
  END IF;

  INSERT INTO public.gas_voucher_requests (store_id, status, requested_by, notes)
  VALUES (_store_id, 'requested', auth.uid(), _notes)
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

-- 7) RPC: confirmar recebimento (abate 1 vale do estoque global FIFO + reposiciona reserva)
CREATE OR REPLACE FUNCTION public.gas_confirm_receipt(_request_id uuid, _notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_status text;
  v_purchase_id uuid;
BEGIN
  SELECT store_id, status INTO v_store_id, v_status
    FROM public.gas_voucher_requests
   WHERE id = _request_id
   FOR UPDATE;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;

  IF v_status <> 'requested' THEN
    RAISE EXCEPTION 'Solicitação já finalizada (status=%)', v_status;
  END IF;

  -- Pega a compra mais antiga com saldo (FIFO)
  SELECT id INTO v_purchase_id
    FROM public.gas_voucher_purchases
   WHERE remaining > 0
   ORDER BY purchased_at ASC, created_at ASC
   FOR UPDATE
   LIMIT 1;

  IF v_purchase_id IS NULL THEN
    RAISE EXCEPTION 'Sem vales disponíveis no estoque. Registre uma compra antes.';
  END IF;

  UPDATE public.gas_voucher_purchases
     SET remaining = remaining - 1
   WHERE id = v_purchase_id;

  UPDATE public.gas_voucher_requests
     SET status = 'received',
         received_at = now(),
         received_by = auth.uid(),
         purchase_id = v_purchase_id,
         notes = COALESCE(_notes, notes)
   WHERE id = _request_id;

  -- Repõe reserva da loja
  INSERT INTO public.gas_voucher_store_state (store_id, has_reserve, last_received_at)
  VALUES (v_store_id, true, now())
  ON CONFLICT (store_id) DO UPDATE
    SET has_reserve = true,
        reserve_activated_at = NULL,
        last_received_at = now();
END;
$$;

-- 8) RPC: registrar compra (calcula quantity automaticamente do total/unit_price)
CREATE OR REPLACE FUNCTION public.gas_register_purchase(
  _total_amount numeric,
  _unit_price numeric,
  _purchased_at date DEFAULT CURRENT_DATE,
  _bank_transaction_id uuid DEFAULT NULL,
  _quantity integer DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qty integer;
  v_id uuid;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  v_qty := COALESCE(_quantity, FLOOR(_total_amount / NULLIF(_unit_price, 0))::int);

  IF v_qty IS NULL OR v_qty <= 0 THEN
    RAISE EXCEPTION 'Quantidade inválida';
  END IF;

  INSERT INTO public.gas_voucher_purchases
    (purchased_at, total_amount, unit_price, quantity, remaining, bank_transaction_id, notes, created_by)
  VALUES
    (_purchased_at, _total_amount, _unit_price, v_qty, v_qty, _bank_transaction_id, _notes, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.gas_use_reserve(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gas_confirm_receipt(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gas_register_purchase(numeric, numeric, date, uuid, integer, text) TO authenticated;