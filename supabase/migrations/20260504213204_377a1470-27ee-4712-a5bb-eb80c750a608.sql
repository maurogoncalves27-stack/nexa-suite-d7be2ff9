-- Marcação de feriados trabalhados por colaborador (para quem é dispensado de ponto
-- ou quando a regra automática não cobre). Usado pelo painel de revisão da folha.
CREATE TABLE IF NOT EXISTS public.payroll_holiday_worked (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  holiday_id UUID NOT NULL REFERENCES public.holidays(id) ON DELETE CASCADE,
  reference_year INT NOT NULL,
  reference_month INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE (employee_id, holiday_id)
);

CREATE INDEX IF NOT EXISTS idx_phw_emp_ref
  ON public.payroll_holiday_worked (employee_id, reference_year, reference_month);

ALTER TABLE public.payroll_holiday_worked ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read holiday worked"
  ON public.payroll_holiday_worked FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can insert holiday worked"
  ON public.payroll_holiday_worked FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can delete holiday worked"
  ON public.payroll_holiday_worked FOR DELETE
  TO authenticated USING (true);