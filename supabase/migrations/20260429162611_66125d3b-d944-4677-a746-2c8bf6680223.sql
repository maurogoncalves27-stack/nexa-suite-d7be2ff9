-- Consolidação da folha + categoria padrão "Folha de pagamento"
ALTER TABLE public.payroll_imports
  ADD COLUMN IF NOT EXISTS consolidated_at timestamptz,
  ADD COLUMN IF NOT EXISTS consolidated_by uuid;

ALTER TABLE public.payroll_import_rows
  ADD COLUMN IF NOT EXISTS payable_id uuid REFERENCES public.accounts_payable(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payroll_import_rows_payable ON public.payroll_import_rows(payable_id);

-- Garante categoria "Folha de pagamento" (despesa)
INSERT INTO public.finance_categories (name, kind, is_active, sort_order)
SELECT 'Folha de pagamento', 'expense', true, 0
WHERE NOT EXISTS (
  SELECT 1 FROM public.finance_categories WHERE lower(name) = 'folha de pagamento' AND kind = 'expense'
);