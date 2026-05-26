ALTER TABLE public.pdv_fiscal_invoices DROP CONSTRAINT IF EXISTS pdv_fiscal_invoices_status_check;
ALTER TABLE public.pdv_fiscal_invoices ADD CONSTRAINT pdv_fiscal_invoices_status_check
  CHECK (status = ANY (ARRAY['pending','processing','authorized','rejected','cancelled','error','contingency']));

ALTER TABLE public.pdv_fiscal_invoices
  ADD COLUMN IF NOT EXISTS contingency_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_contingency_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS contingency_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_pdv_fiscal_invoices_contingency
  ON public.pdv_fiscal_invoices (status, last_contingency_at)
  WHERE status = 'contingency';