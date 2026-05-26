ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS inscricao_estadual TEXT,
  ADD COLUMN IF NOT EXISTS inscricao_municipal TEXT,
  ADD COLUMN IF NOT EXISTS regime_tributario SMALLINT,
  ADD COLUMN IF NOT EXISTS nfce_csc_id_homolog TEXT,
  ADD COLUMN IF NOT EXISTS nfce_csc_token_homolog TEXT,
  ADD COLUMN IF NOT EXISTS nfce_csc_id_prod TEXT,
  ADD COLUMN IF NOT EXISTS nfce_csc_token_prod TEXT,
  ADD COLUMN IF NOT EXISTS nfce_serie SMALLINT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS nfce_next_number INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS nfce_environment TEXT DEFAULT 'homologacao' CHECK (nfce_environment IN ('homologacao','producao'));

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS ncm TEXT,
  ADD COLUMN IF NOT EXISTS cest TEXT,
  ADD COLUMN IF NOT EXISTS cfop TEXT DEFAULT '5102',
  ADD COLUMN IF NOT EXISTS origem_mercadoria SMALLINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS csosn TEXT DEFAULT '102',
  ADD COLUMN IF NOT EXISTS cst TEXT,
  ADD COLUMN IF NOT EXISTS unidade_comercial TEXT DEFAULT 'UN',
  ADD COLUMN IF NOT EXISTS ean TEXT;

CREATE TABLE IF NOT EXISTS public.pdv_fiscal_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.pdv_orders(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id),
  provider TEXT NOT NULL DEFAULT 'focus_nfe',
  environment TEXT NOT NULL DEFAULT 'homologacao',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','authorized','rejected','cancelled','error')),
  focus_ref TEXT UNIQUE,
  numero INT,
  serie SMALLINT,
  chave_acesso TEXT,
  protocolo TEXT,
  danfe_url TEXT,
  xml_url TEXT,
  rejection_code TEXT,
  rejection_reason TEXT,
  request_payload JSONB,
  response_payload JSONB,
  emitted_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pdv_fiscal_invoices_order ON public.pdv_fiscal_invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_pdv_fiscal_invoices_status ON public.pdv_fiscal_invoices(status);

ALTER TABLE public.pdv_fiscal_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fiscal invoices view"
  ON public.pdv_fiscal_invoices FOR SELECT
  USING (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'contabilidade'::app_role)
  );

CREATE POLICY "Fiscal invoices insert"
  ON public.pdv_fiscal_invoices FOR INSERT
  WITH CHECK (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "Fiscal invoices update"
  ON public.pdv_fiscal_invoices FOR UPDATE
  USING (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

CREATE TRIGGER trg_pdv_fiscal_invoices_updated
  BEFORE UPDATE ON public.pdv_fiscal_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();