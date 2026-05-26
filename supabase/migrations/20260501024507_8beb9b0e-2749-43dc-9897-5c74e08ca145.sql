ALTER TABLE public.inventory_invoices
  ADD COLUMN IF NOT EXISTS no_invoice boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.inventory_invoices.no_invoice IS
  'true quando a entrada foi feita sem nota fiscal (ex.: compras na CEASA, feira). Nesses casos, campos fiscais (numero, serie, chave_acesso) ficam nulos.';

CREATE INDEX IF NOT EXISTS idx_inventory_invoices_no_invoice
  ON public.inventory_invoices (no_invoice) WHERE no_invoice = true;