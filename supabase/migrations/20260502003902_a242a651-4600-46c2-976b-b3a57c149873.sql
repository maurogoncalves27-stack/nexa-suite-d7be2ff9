
-- =========================================================================
-- PDV NOVO - Fase 1 (esqueleto)
-- Tabelas em paralelo ao /pdv atual (Saipos). Não altera nada existente.
-- =========================================================================

-- 1) CANAIS DE VENDA -------------------------------------------------------
CREATE TABLE public.pdv_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  code TEXT NOT NULL,                    -- 'counter','ifood','own_delivery','phone'
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  external_config JSONB,                 -- credenciais/IDs do canal externo (ex.: ifood merchant_id)
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, code)
);

-- 2) SESSÕES DE CAIXA -----------------------------------------------------
CREATE TABLE public.pdv_cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  opened_by UUID NOT NULL,               -- auth.users id do operador que abriu
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  opening_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  closed_by UUID,
  closed_at TIMESTAMPTZ,
  closing_amount NUMERIC(12,2),
  expected_amount NUMERIC(12,2),         -- calculado pelo sistema
  difference NUMERIC(12,2),              -- closing - expected
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pdv_cash_sessions_store_status ON public.pdv_cash_sessions(store_id, status);
-- Apenas uma sessão aberta por loja
CREATE UNIQUE INDEX uq_pdv_cash_sessions_one_open
  ON public.pdv_cash_sessions(store_id) WHERE status = 'open';

-- 3) PEDIDOS --------------------------------------------------------------
CREATE TABLE public.pdv_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  channel_id UUID NOT NULL REFERENCES public.pdv_channels(id) ON DELETE RESTRICT,
  cash_session_id UUID REFERENCES public.pdv_cash_sessions(id) ON DELETE SET NULL,
  order_number TEXT,                     -- número humano do pedido (sequencial por loja/dia)
  external_order_id TEXT,                -- id do canal externo (ex.: id do pedido iFood)
  customer_name TEXT,
  customer_phone TEXT,
  customer_document TEXT,                -- CPF na nota
  delivery_address JSONB,                -- {street, number, complement, neighborhood, city, state, zip, lat, lng, fee}
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','confirmed','preparing','ready','delivering','completed','canceled')),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  delivery_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  source_payload JSONB,                  -- payload bruto do canal externo (debug)
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pdv_orders_store_status ON public.pdv_orders(store_id, status);
CREATE INDEX idx_pdv_orders_session ON public.pdv_orders(cash_session_id);
CREATE INDEX idx_pdv_orders_channel ON public.pdv_orders(channel_id);
CREATE INDEX idx_pdv_orders_opened_at ON public.pdv_orders(opened_at DESC);
CREATE UNIQUE INDEX uq_pdv_orders_external
  ON public.pdv_orders(channel_id, external_order_id)
  WHERE external_order_id IS NOT NULL;

-- 4) ITENS DO PEDIDO ------------------------------------------------------
CREATE TABLE public.pdv_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.pdv_orders(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,                    -- snapshot do nome (preserva histórico)
  quantity NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  complements JSONB,                     -- snapshot de adicionais/complementos
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pdv_order_items_order ON public.pdv_order_items(order_id);
CREATE INDEX idx_pdv_order_items_menu_item ON public.pdv_order_items(menu_item_id);

-- 5) PAGAMENTOS -----------------------------------------------------------
CREATE TABLE public.pdv_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.pdv_orders(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('cash','debit','credit','pix','voucher','online','other')),
  amount NUMERIC(12,2) NOT NULL,
  change_amount NUMERIC(12,2) NOT NULL DEFAULT 0,  -- troco (só para 'cash')
  authorization_code TEXT,
  external_payment_id TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pdv_payments_order ON public.pdv_payments(order_id);
CREATE INDEX idx_pdv_payments_paid_at ON public.pdv_payments(paid_at DESC);

-- =========================================================================
-- TRIGGERS de updated_at
-- =========================================================================
CREATE TRIGGER trg_pdv_channels_upd BEFORE UPDATE ON public.pdv_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_pdv_cash_sessions_upd BEFORE UPDATE ON public.pdv_cash_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_pdv_orders_upd BEFORE UPDATE ON public.pdv_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- RLS
-- =========================================================================
ALTER TABLE public.pdv_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_payments ENABLE ROW LEVEL SECURITY;

-- Helper: usuário trabalha nessa loja?
-- (já existe public.has_role; assumimos employees.user_id + employees.store_id)
-- Política única "staff_all" para gestor/admin/RH e funcionários da loja.

-- pdv_channels: leitura para staff; escrita para admin/manager
CREATE POLICY "pdv_channels_read_staff" ON public.pdv_channels FOR SELECT
  TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'employee') OR public.has_role(auth.uid(),'hr')
    OR public.is_super_user(auth.uid())
  );
CREATE POLICY "pdv_channels_write_admin" ON public.pdv_channels FOR ALL
  TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR public.is_super_user(auth.uid())
  ) WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR public.is_super_user(auth.uid())
  );

-- pdv_cash_sessions / pdv_orders / pdv_order_items / pdv_payments:
-- Staff (admin/manager/employee/hr/super) tem acesso completo.
-- (refinamos por loja em fase posterior se necessário)
CREATE POLICY "pdv_cash_sessions_staff" ON public.pdv_cash_sessions FOR ALL
  TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'employee') OR public.has_role(auth.uid(),'hr')
    OR public.is_super_user(auth.uid())
  ) WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'employee') OR public.has_role(auth.uid(),'hr')
    OR public.is_super_user(auth.uid())
  );

CREATE POLICY "pdv_orders_staff" ON public.pdv_orders FOR ALL
  TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'employee') OR public.has_role(auth.uid(),'hr')
    OR public.is_super_user(auth.uid())
  ) WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'employee') OR public.has_role(auth.uid(),'hr')
    OR public.is_super_user(auth.uid())
  );

CREATE POLICY "pdv_order_items_staff" ON public.pdv_order_items FOR ALL
  TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'employee') OR public.has_role(auth.uid(),'hr')
    OR public.is_super_user(auth.uid())
  ) WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'employee') OR public.has_role(auth.uid(),'hr')
    OR public.is_super_user(auth.uid())
  );

CREATE POLICY "pdv_payments_staff" ON public.pdv_payments FOR ALL
  TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'employee') OR public.has_role(auth.uid(),'hr')
    OR public.is_super_user(auth.uid())
  ) WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'employee') OR public.has_role(auth.uid(),'hr')
    OR public.is_super_user(auth.uid())
  );

-- =========================================================================
-- SEED: canais padrão para cada loja física
-- =========================================================================
INSERT INTO public.pdv_channels (store_id, code, name, sort_order)
SELECT s.id, c.code, c.name, c.sort_order
FROM public.stores s
CROSS JOIN (VALUES
  ('counter','Balcão',1),
  ('ifood','iFood',2),
  ('own_delivery','Delivery próprio',3)
) AS c(code, name, sort_order)
WHERE s.is_virtual = false AND s.is_active = true
ON CONFLICT (store_id, code) DO NOTHING;
