CREATE TABLE IF NOT EXISTS public.monthly_revenue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  year INT NOT NULL,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  gross_revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE (year, month, store_id, brand_id)
);

CREATE INDEX IF NOT EXISTS idx_monthly_revenue_period ON public.monthly_revenue(year, month);
CREATE INDEX IF NOT EXISTS idx_monthly_revenue_store ON public.monthly_revenue(store_id);
CREATE INDEX IF NOT EXISTS idx_monthly_revenue_brand ON public.monthly_revenue(brand_id);

ALTER TABLE public.monthly_revenue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view monthly_revenue"
ON public.monthly_revenue FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Managers can insert monthly_revenue"
ON public.monthly_revenue FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR public.has_role(auth.uid(), 'contabilidade')
);

CREATE POLICY "Managers can update monthly_revenue"
ON public.monthly_revenue FOR UPDATE
TO authenticated
USING (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR public.has_role(auth.uid(), 'contabilidade')
);

CREATE POLICY "Managers can delete monthly_revenue"
ON public.monthly_revenue FOR DELETE
TO authenticated
USING (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
);

CREATE TRIGGER update_monthly_revenue_updated_at
BEFORE UPDATE ON public.monthly_revenue
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();