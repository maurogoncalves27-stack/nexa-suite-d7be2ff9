ALTER TABLE public.pdv_orders
  ADD COLUMN IF NOT EXISTS closure_id uuid,
  ADD COLUMN IF NOT EXISTS closure_status text,
  ADD COLUMN IF NOT EXISTS closure_channel text,
  ADD COLUMN IF NOT EXISTS closure_error text;

ALTER TABLE public.pdv_payments
  ADD COLUMN IF NOT EXISTS closure_id uuid;

ALTER TABLE public.pdv_tef_transactions
  ADD COLUMN IF NOT EXISTS closure_id uuid;

ALTER TABLE public.pdv_fiscal_invoices
  ADD COLUMN IF NOT EXISTS closure_id uuid;

CREATE INDEX IF NOT EXISTS idx_pdv_orders_closure_id ON public.pdv_orders(closure_id);
CREATE INDEX IF NOT EXISTS idx_pdv_payments_closure_id ON public.pdv_payments(closure_id);
CREATE INDEX IF NOT EXISTS idx_pdv_tef_transactions_closure_id ON public.pdv_tef_transactions(closure_id);
CREATE INDEX IF NOT EXISTS idx_pdv_fiscal_invoices_closure_id ON public.pdv_fiscal_invoices(closure_id);