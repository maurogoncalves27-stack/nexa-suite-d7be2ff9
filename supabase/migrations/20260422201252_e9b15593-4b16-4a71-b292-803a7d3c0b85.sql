
-- =====================================================
-- 1. CARGOS AUTORIZADOS (configurável)
-- =====================================================
CREATE TABLE public.inventory_receiving_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.inventory_receiving_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manages receiving positions"
ON public.inventory_receiving_positions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Authenticated can read receiving positions"
ON public.inventory_receiving_positions
FOR SELECT
TO authenticated
USING (true);

-- Cargos iniciais
INSERT INTO public.inventory_receiving_positions (position) VALUES
  ('Estoquista'),
  ('Encarregado de produção'),
  ('Auxiliar de produção'),
  ('Encarregado de escritório'),
  ('Auxiliar administrativo'),
  ('Gerente Geral'),
  ('Supervisor de Loja');

-- =====================================================
-- 2. FUNÇÕES AUXILIARES
-- =====================================================
CREATE OR REPLACE FUNCTION public.can_receive_inventory(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin')
    OR public.has_role(_user_id, 'manager')
    OR EXISTS (
      SELECT 1
        FROM public.employees e
        JOIN public.inventory_receiving_positions p ON p.position = e.position
       WHERE e.user_id = _user_id
         AND e.status IN ('active','in_training')
    );
$$;

CREATE OR REPLACE FUNCTION public.can_view_accounts_payable(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'manager');
$$;

-- =====================================================
-- 3. NOTAS FISCAIS
-- =====================================================
CREATE TABLE public.inventory_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  created_by UUID NOT NULL,
  -- Dados extraídos / informados
  supplier_name TEXT,
  supplier_cnpj TEXT,
  invoice_number TEXT,
  invoice_series TEXT,
  invoice_key TEXT,                -- chave de acesso NF-e (44 dígitos)
  issue_date DATE,
  total_amount NUMERIC(12,2),
  -- Status do processamento
  extraction_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending','processing','done','failed','manual')),
  extraction_error TEXT,
  raw_extraction JSONB,            -- payload bruto retornado pela IA
  notes TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inv_invoices_store ON public.inventory_invoices(store_id);
CREATE INDEX idx_inv_invoices_status ON public.inventory_invoices(extraction_status);
CREATE INDEX idx_inv_invoices_issue ON public.inventory_invoices(issue_date DESC);

ALTER TABLE public.inventory_invoices ENABLE ROW LEVEL SECURITY;

-- Staff (admin/manager) vê tudo
CREATE POLICY "Staff manages invoices"
ON public.inventory_invoices
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Quem pode receber e atua na loja vê/cria notas da própria loja
CREATE POLICY "Receivers view own store invoices"
ON public.inventory_invoices
FOR SELECT
TO authenticated
USING (
  public.can_receive_inventory(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.employees e
     WHERE e.user_id = auth.uid()
       AND COALESCE(e.allocated_store_id, e.store_id) = inventory_invoices.store_id
  )
);

CREATE POLICY "Receivers insert invoices for own store"
ON public.inventory_invoices
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_receive_inventory(auth.uid())
  AND created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.employees e
     WHERE e.user_id = auth.uid()
       AND COALESCE(e.allocated_store_id, e.store_id) = inventory_invoices.store_id
  )
);

CREATE POLICY "Receivers update own invoices"
ON public.inventory_invoices
FOR UPDATE
TO authenticated
USING (
  public.can_receive_inventory(auth.uid())
  AND created_by = auth.uid()
);

CREATE TRIGGER trg_inv_invoices_updated
BEFORE UPDATE ON public.inventory_invoices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 4. ARQUIVOS DA NOTA
-- =====================================================
CREATE TABLE public.inventory_invoice_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.inventory_invoices(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'invoice' CHECK (kind IN ('invoice','boleto','other')),
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  page_number INTEGER,
  uploaded_by UUID NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inv_invoice_files_invoice ON public.inventory_invoice_files(invoice_id);

ALTER TABLE public.inventory_invoice_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Files follow invoice visibility"
ON public.inventory_invoice_files
FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.inventory_invoices i WHERE i.id = invoice_id)
);

CREATE POLICY "Receivers insert files"
ON public.inventory_invoice_files
FOR INSERT
TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.inventory_invoices i
     WHERE i.id = invoice_id
       AND (
         public.has_role(auth.uid(), 'admin')
         OR public.has_role(auth.uid(), 'manager')
         OR i.created_by = auth.uid()
       )
  )
);

CREATE POLICY "Staff or owner deletes files"
ON public.inventory_invoice_files
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR uploaded_by = auth.uid()
);

-- =====================================================
-- 5. CONTAS A PAGAR (BOLETOS)
-- =====================================================
CREATE TABLE public.accounts_payable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.inventory_invoices(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  installment_number INTEGER NOT NULL DEFAULT 1,
  due_date DATE,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  barcode TEXT,
  digitable_line TEXT,
  beneficiary TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','cancelled')),
  paid_at TIMESTAMPTZ,
  paid_by UUID,
  payment_notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ap_invoice ON public.accounts_payable(invoice_id);
CREATE INDEX idx_ap_due ON public.accounts_payable(due_date);
CREATE INDEX idx_ap_status ON public.accounts_payable(status);

ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;

-- Apenas admin/manager visualiza e gerencia o financeiro
CREATE POLICY "Finance views payables"
ON public.accounts_payable
FOR SELECT
TO authenticated
USING (public.can_view_accounts_payable(auth.uid()));

CREATE POLICY "Finance manages payables"
ON public.accounts_payable
FOR ALL
TO authenticated
USING (public.can_view_accounts_payable(auth.uid()))
WITH CHECK (public.can_view_accounts_payable(auth.uid()));

-- Quem cria a nota também pode inserir os boletos extraídos da IA
CREATE POLICY "Receivers insert payables for own invoice"
ON public.accounts_payable
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_receive_inventory(auth.uid())
  AND created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.inventory_invoices i
     WHERE i.id = invoice_id AND i.created_by = auth.uid()
  )
);

CREATE TRIGGER trg_ap_updated
BEFORE UPDATE ON public.accounts_payable
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 6. STORAGE BUCKET
-- =====================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('inventory-invoices', 'inventory-invoices', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authorized read inventory files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'inventory-invoices'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.can_receive_inventory(auth.uid())
  )
);

CREATE POLICY "Receivers upload inventory files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'inventory-invoices'
  AND public.can_receive_inventory(auth.uid())
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Staff or owner delete inventory files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'inventory-invoices'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR auth.uid()::text = (storage.foldername(name))[1]
  )
);
