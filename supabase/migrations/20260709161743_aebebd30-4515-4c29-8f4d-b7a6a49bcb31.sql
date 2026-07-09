
-- 1. Tabela de templates de contas recorrentes
CREATE TABLE public.recurring_payables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.finance_categories(id) ON DELETE SET NULL,
  bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  payment_method text,
  due_day smallint NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  default_amount numeric(14,2),
  kind text NOT NULL DEFAULT 'fixed' CHECK (kind IN ('fixed','variable')),
  active boolean NOT NULL DEFAULT true,
  start_month date NOT NULL DEFAULT date_trunc('month', now())::date,
  end_month date,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_payables TO authenticated;
GRANT ALL ON public.recurring_payables TO service_role;

ALTER TABLE public.recurring_payables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance roles manage recurring payables"
ON public.recurring_payables
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR public.has_role(auth.uid(), 'contabilidade')
  OR public.is_super_user(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR public.has_role(auth.uid(), 'contabilidade')
  OR public.is_super_user(auth.uid())
);

CREATE TRIGGER trg_recurring_payables_updated
BEFORE UPDATE ON public.recurring_payables
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Vínculo em accounts_payable
ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS recurring_template_id uuid REFERENCES public.recurring_payables(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS competence_month date,
  ADD COLUMN IF NOT EXISTS awaiting_amount boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_recurring_payable_per_month
  ON public.accounts_payable (recurring_template_id, competence_month)
  WHERE recurring_template_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recurring_payables_active
  ON public.recurring_payables (active, start_month);
