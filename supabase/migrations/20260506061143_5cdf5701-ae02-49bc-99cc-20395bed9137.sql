
-- ============ Adjudicação item-a-item ============
CREATE TABLE public.quotation_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  quotation_item_id UUID NOT NULL REFERENCES public.quotation_items(id) ON DELETE CASCADE,
  bid_item_id UUID REFERENCES public.quotation_bid_items(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  final_quantity NUMERIC(14,4),
  is_vetoed BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(quotation_item_id)
);
CREATE INDEX idx_qawards_quotation ON public.quotation_awards(quotation_id);
CREATE INDEX idx_qawards_supplier ON public.quotation_awards(supplier_id);

ALTER TABLE public.quotation_awards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff gerencia adjudicações" ON public.quotation_awards
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));

CREATE TRIGGER trg_qawards_updated BEFORE UPDATE ON public.quotation_awards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Ordens de compra ============
CREATE TABLE public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID REFERENCES public.quotations(id) ON DELETE SET NULL,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  store_id UUID REFERENCES public.stores(id),
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('draft','sent','confirmed','partial','fulfilled','cancelled')),
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  supplier_notes TEXT,
  sent_at TIMESTAMPTZ DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_po_quotation ON public.purchase_orders(quotation_id);
CREATE INDEX idx_po_supplier ON public.purchase_orders(supplier_id);
CREATE INDEX idx_po_status ON public.purchase_orders(status);

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff gerencia ordens de compra" ON public.purchase_orders
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));

CREATE POLICY "Fornecedor vê suas ordens" ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (supplier_id = current_supplier_id());

CREATE POLICY "Fornecedor confirma/corta sua ordem" ON public.purchase_orders
  FOR UPDATE TO authenticated
  USING (supplier_id = current_supplier_id())
  WITH CHECK (supplier_id = current_supplier_id());

CREATE TRIGGER trg_po_updated BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Itens da ordem ============
CREATE TABLE public.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  quotation_item_id UUID REFERENCES public.quotation_items(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  ordered_quantity NUMERIC(14,4) NOT NULL,
  unit TEXT NOT NULL DEFAULT 'UN',
  unit_price NUMERIC(14,4) NOT NULL DEFAULT 0,
  pack_description TEXT,
  fulfilled_quantity NUMERIC(14,4),
  cut_reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','cut','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_poi_po ON public.purchase_order_items(purchase_order_id);

ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff gerencia itens da ordem" ON public.purchase_order_items
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));

CREATE POLICY "Fornecedor vê itens da sua ordem" ON public.purchase_order_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = purchase_order_items.purchase_order_id
      AND po.supplier_id = current_supplier_id()
  ));

CREATE POLICY "Fornecedor edita itens da sua ordem" ON public.purchase_order_items
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = purchase_order_items.purchase_order_id
      AND po.supplier_id = current_supplier_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = purchase_order_items.purchase_order_id
      AND po.supplier_id = current_supplier_id()
  ));

CREATE TRIGGER trg_poi_updated BEFORE UPDATE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
