CREATE TABLE public.asset_inventory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('mobiliario', 'equipamento', 'utensilio')),
  name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit_value NUMERIC NOT NULL DEFAULT 0 CHECK (unit_value >= 0),
  acquired_at DATE,
  depreciation_rate_yearly NUMERIC NOT NULL DEFAULT 10 CHECK (depreciation_rate_yearly >= 0 AND depreciation_rate_yearly <= 100),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_asset_inventory_store ON public.asset_inventory(store_id);
CREATE INDEX idx_asset_inventory_category ON public.asset_inventory(category);

ALTER TABLE public.asset_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view asset inventory"
ON public.asset_inventory FOR SELECT
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Staff can insert asset inventory"
ON public.asset_inventory FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Staff can update asset inventory"
ON public.asset_inventory FOR UPDATE
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Staff can delete asset inventory"
ON public.asset_inventory FOR DELETE
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER update_asset_inventory_updated_at
BEFORE UPDATE ON public.asset_inventory
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();