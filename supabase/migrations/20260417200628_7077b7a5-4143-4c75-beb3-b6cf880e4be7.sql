CREATE TABLE IF NOT EXISTS public.payroll_rubrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_rubr text NOT NULL,
  ide_tab_rubr text,
  description text NOT NULL,
  nat_rubr text,
  tp_rubr text,
  category text NOT NULL DEFAULT 'other',
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cod_rubr, ide_tab_rubr)
);

ALTER TABLE public.payroll_rubrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage payroll rubrics"
  ON public.payroll_rubrics FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated view payroll rubrics"
  ON public.payroll_rubrics FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER trg_payroll_rubrics_updated_at
  BEFORE UPDATE ON public.payroll_rubrics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_payroll_rubrics_cod ON public.payroll_rubrics(cod_rubr);
CREATE INDEX IF NOT EXISTS idx_payroll_rubrics_category ON public.payroll_rubrics(category);