ALTER TABLE public.inventory_products
  ADD COLUMN IF NOT EXISTS is_custom BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS print_run NUMERIC,
  ADD COLUMN IF NOT EXISTS unit_value NUMERIC,
  ADD COLUMN IF NOT EXISTS fixed_supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS art_file_url TEXT,
  ADD COLUMN IF NOT EXISTS lead_time_days INTEGER,
  ADD COLUMN IF NOT EXISTS custom_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_inventory_products_is_custom ON public.inventory_products(is_custom) WHERE is_custom = true;
CREATE INDEX IF NOT EXISTS idx_inventory_products_fixed_supplier ON public.inventory_products(fixed_supplier_id);