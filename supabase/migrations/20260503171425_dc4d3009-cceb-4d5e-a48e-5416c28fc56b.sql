
-- Tabela de configuração TEF por loja
CREATE TABLE public.pdv_tef_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'mock' CHECK (provider IN ('sitef','paygo','mock')),
  agent_url text NOT NULL DEFAULT 'http://localhost:60906',
  merchant_code text,
  terminal_code text,
  acquirer text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id)
);

ALTER TABLE public.pdv_tef_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/managers can manage TEF config"
ON public.pdv_tef_config FOR ALL
TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.is_super_user(auth.uid()))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.is_super_user(auth.uid()));

CREATE TRIGGER trg_pdv_tef_config_updated
BEFORE UPDATE ON public.pdv_tef_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de transações TEF
CREATE TABLE public.pdv_tef_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.pdv_orders(id) ON DELETE SET NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  provider text NOT NULL,
  amount numeric(12,2) NOT NULL,
  payment_method text,
  card_brand text,
  card_last4 text,
  installments int DEFAULT 1,
  nsu text,
  authorization_code text,
  acquirer text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','waiting_card','processing','approved','declined','cancelled','error','timeout')),
  message text,
  raw_response jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pdv_tef_tx_order ON public.pdv_tef_transactions(order_id);
CREATE INDEX idx_pdv_tef_tx_store ON public.pdv_tef_transactions(store_id);
CREATE INDEX idx_pdv_tef_tx_status ON public.pdv_tef_transactions(status);

ALTER TABLE public.pdv_tef_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/managers/contabilidade can view TEF tx"
ON public.pdv_tef_transactions FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'contabilidade') OR public.is_super_user(auth.uid()));

CREATE POLICY "Authenticated can insert TEF tx"
ON public.pdv_tef_transactions FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated can update TEF tx"
ON public.pdv_tef_transactions FOR UPDATE
TO authenticated
USING (true);

CREATE TRIGGER trg_pdv_tef_tx_updated
BEFORE UPDATE ON public.pdv_tef_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
