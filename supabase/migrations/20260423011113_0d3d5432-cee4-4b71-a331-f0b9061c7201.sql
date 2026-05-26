-- Tabela de vendas importadas do Saipos
CREATE TABLE public.pos_sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  order_number TEXT,
  sold_at TIMESTAMPTZ NOT NULL,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_method TEXT,
  customer_name TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  raw_payload JSONB,
  stock_applied BOOLEAN NOT NULL DEFAULT false,
  stock_applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, external_id)
);

CREATE INDEX idx_pos_sales_store_date ON public.pos_sales(store_id, sold_at DESC);
CREATE INDEX idx_pos_sales_stock_pending ON public.pos_sales(stock_applied) WHERE stock_applied = false;

-- Itens das vendas
CREATE TABLE public.pos_sale_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID NOT NULL REFERENCES public.pos_sales(id) ON DELETE CASCADE,
  external_product_id TEXT,
  product_name TEXT NOT NULL,
  quantity NUMERIC(14,4) NOT NULL DEFAULT 0,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  inventory_product_id UUID REFERENCES public.inventory_products(id) ON DELETE SET NULL,
  match_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pos_sale_items_sale ON public.pos_sale_items(sale_id);
CREATE INDEX idx_pos_sale_items_product ON public.pos_sale_items(inventory_product_id);

-- Logs de sincronização
CREATE TABLE public.pos_sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  sales_imported INTEGER NOT NULL DEFAULT 0,
  items_matched INTEGER NOT NULL DEFAULT 0,
  items_unmatched INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  error_message TEXT,
  details JSONB
);

CREATE INDEX idx_pos_sync_logs_started ON public.pos_sync_logs(started_at DESC);

-- RLS
ALTER TABLE public.pos_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sync_logs ENABLE ROW LEVEL SECURITY;

-- Policies: admin/manager têm acesso total
CREATE POLICY "Admins/managers manage pos_sales"
  ON public.pos_sales FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins/managers manage pos_sale_items"
  ON public.pos_sale_items FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins/managers manage pos_sync_logs"
  ON public.pos_sync_logs FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Trigger updated_at
CREATE TRIGGER update_pos_sales_updated_at
  BEFORE UPDATE ON public.pos_sales
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();