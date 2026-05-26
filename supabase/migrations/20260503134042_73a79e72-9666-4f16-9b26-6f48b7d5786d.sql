ALTER TABLE public.monthly_revenue ALTER COLUMN store_id DROP NOT NULL;
ALTER TABLE public.monthly_revenue ADD COLUMN IF NOT EXISTS is_consolidated boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS monthly_revenue_consolidated_unique ON public.monthly_revenue(year, month) WHERE is_consolidated = true;