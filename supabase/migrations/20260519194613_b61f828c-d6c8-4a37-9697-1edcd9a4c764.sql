
-- 1) Notas recebidas via DF-e
CREATE TABLE public.dfe_inbound_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dfe_company_id uuid REFERENCES public.dfe_companies(id) ON DELETE SET NULL,
  store_id uuid REFERENCES public.stores(id),
  target_store_id uuid REFERENCES public.stores(id),
  supplier_cnpj text,
  supplier_name text,
  numero text,
  serie text,
  chave_acesso text UNIQUE,
  emission_date timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  total_amount numeric(14,2),
  status text NOT NULL DEFAULT 'awaiting_sefaz'
    CHECK (status IN ('awaiting_sefaz','ready','imported','refused','unknown')),
  origin text NOT NULL DEFAULT 'focus'
    CHECK (origin IN ('focus','upload_zip','upload_xml')),
  nsu text,
  xml_url text,
  danfe_url text,
  ciencia_at timestamptz,
  refused_reason text,
  imported_invoice_id uuid REFERENCES public.inventory_invoices(id) ON DELETE SET NULL,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dfe_notes_status ON public.dfe_inbound_notes (status, received_at DESC);
CREATE INDEX idx_dfe_notes_company ON public.dfe_inbound_notes (dfe_company_id);
CREATE INDEX idx_dfe_notes_supplier ON public.dfe_inbound_notes (supplier_cnpj);

CREATE TRIGGER update_dfe_inbound_notes_updated_at
  BEFORE UPDATE ON public.dfe_inbound_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.dfe_inbound_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff view dfe notes" ON public.dfe_inbound_notes
  FOR SELECT USING (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'manager'::app_role)
    OR has_role(auth.uid(),'hr'::app_role)
  );
CREATE POLICY "staff manage dfe notes" ON public.dfe_inbound_notes
  FOR ALL USING (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'manager'::app_role)
    OR has_role(auth.uid(),'hr'::app_role)
  ) WITH CHECK (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'manager'::app_role)
    OR has_role(auth.uid(),'hr'::app_role)
  );

-- 2) Itens
CREATE TABLE public.dfe_inbound_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES public.dfe_inbound_notes(id) ON DELETE CASCADE,
  line_number int NOT NULL,
  description text NOT NULL,
  ncm text,
  cfop text,
  unit text,
  quantity numeric(14,4) NOT NULL DEFAULT 0,
  unit_value numeric(14,6) NOT NULL DEFAULT 0,
  total_value numeric(14,2) NOT NULL DEFAULT 0,
  suggested_product_id uuid REFERENCES public.inventory_products(id) ON DELETE SET NULL,
  mapped_product_id uuid REFERENCES public.inventory_products(id) ON DELETE SET NULL,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dfe_items_note ON public.dfe_inbound_items (note_id);

ALTER TABLE public.dfe_inbound_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff view dfe items" ON public.dfe_inbound_items
  FOR SELECT USING (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'manager'::app_role)
    OR has_role(auth.uid(),'hr'::app_role)
  );
CREATE POLICY "staff manage dfe items" ON public.dfe_inbound_items
  FOR ALL USING (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'manager'::app_role)
    OR has_role(auth.uid(),'hr'::app_role)
  ) WITH CHECK (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'manager'::app_role)
    OR has_role(auth.uid(),'hr'::app_role)
  );

-- 3) Aprendizado fornecedor x descrição -> produto
CREATE TABLE public.dfe_supplier_product_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_cnpj text NOT NULL,
  description_norm text NOT NULL,
  product_id uuid NOT NULL REFERENCES public.inventory_products(id) ON DELETE CASCADE,
  hits int NOT NULL DEFAULT 1,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_cnpj, description_norm)
);
CREATE INDEX idx_dfe_map_supplier ON public.dfe_supplier_product_map (supplier_cnpj);

ALTER TABLE public.dfe_supplier_product_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff view dfe map" ON public.dfe_supplier_product_map
  FOR SELECT USING (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'manager'::app_role)
    OR has_role(auth.uid(),'hr'::app_role)
  );
CREATE POLICY "staff manage dfe map" ON public.dfe_supplier_product_map
  FOR ALL USING (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'manager'::app_role)
    OR has_role(auth.uid(),'hr'::app_role)
  ) WITH CHECK (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'manager'::app_role)
    OR has_role(auth.uid(),'hr'::app_role)
  );
